import type { ISigner } from '@tpay/shared/application/ports/crypto';
import type { IClock } from '@tpay/shared/application/ports/system';
import type { AuthorizeVaultResponse } from '@tpay/shared/contracts/api';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import { signMessage } from '@tpay/shared/domain/signedMessages';
import { ApiError } from './ApiError';
import type {
  Device, IPaymentGateway, ITransactionRepository, IVaultRepository, IVoucherRepository,
  PaymentAuthorization, Vault,
} from './ports';
import { toVaultView } from './vaultView';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// PayPal holds an authorisation for 29 days and guarantees it for 3.
export const PAYPAL_HOLD_MS = 29 * DAY_MS;
export const HONOR_PERIOD_MS = 3 * DAY_MS;
// Release a day before PayPal would expire the hold, so the release is ours, not a surprise.
const HOLD_EXPIRY_MARGIN_MS = DAY_MS;


// Settle-by is as late as PayPal allows, not a short grace period. Merchants who
// stay offline for days can still be paid, and the hold is released earlier only
// when the customer melts the vault in T-Pay and every declared voucher has settled.
export function settleByFor(lockedAt: Date, authorization: PaymentAuthorization): Date {
  const paypalLimit = lockedAt.getTime() + PAYPAL_HOLD_MS;
  const expiresAt = Math.min(authorization.expiresAt?.getTime() ?? paypalLimit, paypalLimit);
  return new Date(expiresAt - HOLD_EXPIRY_MARGIN_MS);
}

export interface AuthorizeVaultDependencies {
  vaults: IVaultRepository;
  vouchers: IVoucherRepository;
  transactions: ITransactionRepository;
  gateway: IPaymentGateway;
  signer: ISigner;
  clock: IClock;
  rootPrivateKey: string;
}

export class AuthorizeVault {
  constructor(private readonly dependencies: AuthorizeVaultDependencies) {}

  public async execute(device: Device, vaultId: string): Promise<AuthorizeVaultResponse> {
    const vault = await this.dependencies.vaults.findById(vaultId);
    if (vault?.deviceId !== device.id || (vault.status === 'CLOSED' && !vault.paypalAuthorizationId)) {
      throw new ApiError('VAULT_NOT_FOUND', 'This vault does not exist');
    }
    return this.present(device, vault.status === 'PENDING_APPROVAL' ? await this.lock(vault) : vault);
  }

  private async lock(vault: Vault): Promise<Vault> {
    const { gateway, transactions, vaults } = this.dependencies;
    const authorization = await gateway.authorizeOrder({
      requestId: `${vault.id}-authorize`,
      orderId: vault.paypalOrderId,
    });
    if (!authorization) {
      throw new ApiError('ORDER_NOT_APPROVED', 'The PayPal order has not been approved');
    }
    if (authorization.amountUsdMinor !== vault.authorisedUsdMinor) {
      throw new Error(`PayPal authorised a different amount for ${vault.id}`);
    }

    const now = this.dependencies.clock.now();
    await transactions.append(this.lockedEvent(vault, authorization, now));
    const active = await vaults.activate(vault.id, {
      paypalAuthorizationId: authorization.authorizationId,
      spendBy: new Date(now.getTime() + vault.durationHours * HOUR_MS),
      settleBy: settleByFor(now, authorization),
      honorEndsAt: new Date(now.getTime() + HONOR_PERIOD_MS),
    });
    return active ?? (await vaults.findById(vault.id) as Vault);
  }

  private lockedEvent(vault: Vault, authorization: PaymentAuthorization, occurredAt: Date) {
    return {
      id: `txn_${vault.id}_locked`,
      deviceId: vault.deviceId,
      type: 'VAULT_LOCKED' as const,
      amountNgnMinor: vault.amountNgnMinor,
      amountUsdMinor: vault.authorisedUsdMinor,
      vaultId: vault.id,
      voucherId: null,
      paypalReferenceId: authorization.authorizationId,
      occurredAt,
    };
  }

  private async present(device: Device, vault: Vault): Promise<AuthorizeVaultResponse> {
    const { rootPrivateKey, signer, vouchers } = this.dependencies;
    const view = toVaultView(vault, await vouchers.listForVault(vault.id));
    return {
      vault: view,
      vaultCertificate: await signMessage(
        MESSAGE_PREFIX.VAULT_CERTIFICATE,
        {
          vaultId: view.vaultId,
          keyId: device.keyId,
          authorisedUsdMinor: view.authorisedUsdMinor,
          amountNgnMinor: view.amountNgnMinor,
          fxRate: view.fxRate,
          spendBy: view.spendBy,
          settleBy: view.settleBy,
        },
        rootPrivateKey,
        signer,
      ),
    };
  }
}
