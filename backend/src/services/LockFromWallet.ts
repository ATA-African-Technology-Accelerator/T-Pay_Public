import type { ISigner } from '@tpay/shared/application/ports/crypto';
import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import type { AuthorizeVaultResponse, CreateVaultRequest } from '@tpay/shared/contracts/api';
import { convertNgnToUsd } from '@tpay/shared/domain/convertNgnToUsd';
import { Money } from '@tpay/shared/shared/domain/Money';
import { ApiError } from './ApiError';
import { presentVault, walletSettleBy } from './AuthorizeVault';
import type { Device, ITransactionRepository, IVaultRepository, IVoucherRepository, IWalletRepository, Vault } from './ports';
import { balanceNgn, balanceUsd } from './walletBalance';

const HOUR_MS = 60 * 60 * 1000;

export interface LockFromWalletDependencies {
  vaults: IVaultRepository;
  vouchers: IVoucherRepository;
  wallet: IWalletRepository;
  transactions: ITransactionRepository;
  signer: ISigner;
  clock: IClock;
  random: IRandom;
  fxRate: string;
  rootPrivateKey: string;
}

/**
 * Locks money for offline spending straight from the Online wallet. The money is already in
 * T-Pay's PayPal account, so there is no PayPal step: the wallet is debited and the vault opens in
 * one transaction, and whatever is not spent goes back to the wallet when the vault closes.
 */
export class LockFromWallet {
  constructor(private readonly dependencies: LockFromWalletDependencies) {}

  public async execute(device: Device, request: CreateVaultRequest): Promise<AuthorizeVaultResponse> {
    const { clock, fxRate, random, transactions, vaults, wallet } = this.dependencies;
    const amountUsdMinor = this.toUsdMinor(request.amountNgnMinor);

    // A PayPal lock that was started and never approved gives way, like starting a new PayPal lock does.
    const open = await vaults.findOpenForDevice(device.id);
    if (open && open.status !== 'PENDING_APPROVAL') {
      throw new ApiError('ACTIVE_VAULT_EXISTS', 'This device already has an open vault');
    }
    if (open) {
      await vaults.abandon(open.id);
    }

    const vaultId = `vlt_${random.uuid()}`;
    const now = clock.now();
    const vault: Vault = {
      id: vaultId,
      deviceId: device.id,
      status: 'ACTIVE',
      amountNgnMinor: request.amountNgnMinor,
      authorisedUsdMinor: amountUsdMinor,
      fxRate,
      durationHours: request.durationHours,
      // Not PayPal ids: they mark the vault as paid from the wallet and keep the columns unique.
      paypalOrderId: `WALLET-ORDER-${vaultId}`,
      paypalAuthorizationId: `WALLET-AUTH-${vaultId}`,
      spendBy: new Date(now.getTime() + request.durationHours * HOUR_MS),
      settleBy: walletSettleBy(now),
      honorEndsAt: null,
      declaredLastSequence: null,
      declaredTotalUsdMinor: null,
      releasedAt: null,
      createdAt: now,
      fundedBy: 'WALLET',
    };

    await wallet.withWalletLock(device.id, async (session) => {
      if (balanceUsd(session.ledger) < amountUsdMinor || balanceNgn(session.ledger) < request.amountNgnMinor) {
        throw new ApiError('INSUFFICIENT_BALANCE', 'The Online wallet does not have this much');
      }
      if (!(await session.insertVault(vault))) {
        throw new ApiError('ACTIVE_VAULT_EXISTS', 'This device already has an open vault');
      }
      await session.addLedgerEntry({
        id: `led_${random.uuid()}`,
        deviceId: device.id,
        type: 'VAULT_LOCK',
        amountUsdMinor,
        amountNgnMinor: request.amountNgnMinor,
        voucherId: null,
        withdrawalId: null,
        depositId: null,
        paypalCaptureId: null,
        createdAt: now,
        vaultId,
      });
    });

    await transactions.append({
      id: `txn_${vaultId}_locked`,
      deviceId: device.id,
      type: 'VAULT_LOCKED',
      amountNgnMinor: request.amountNgnMinor,
      amountUsdMinor,
      vaultId,
      voucherId: null,
      paypalReferenceId: null,
      occurredAt: now,
    });
    return presentVault(this.dependencies, device, (await vaults.findById(vaultId)) as Vault);
  }

  private toUsdMinor(amountNgnMinor: number): number {
    const converted = convertNgnToUsd(Money.fromMinor(amountNgnMinor, 'NGN').getValue(), this.dependencies.fxRate);
    const cents = converted.isSuccess ? converted.getValue().minor : 0;
    if (cents === 0) {
      throw new ApiError('VALIDATION_FAILED', 'The amount is too small to lock');
    }
    return cents;
  }
}
