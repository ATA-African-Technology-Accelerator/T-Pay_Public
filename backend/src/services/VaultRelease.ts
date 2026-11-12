import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import type {
  IPaymentGateway, IVaultRepository, IVoucherRepository, Vault, VaultSession, Voucher,
} from './ports';
import { isInProgress, settledUsd } from './vaultView';




export interface VaultReleaseDependencies {
  vaults: IVaultRepository;
  vouchers: IVoucherRepository;
  gateway: IPaymentGateway;
  clock: IClock;
  random: IRandom;
}


export const findBlockingVouchers = (vouchers: Voucher[]) => vouchers.filter(isInProgress);


export function isClearToRelease(vault: Vault, vouchers: Voucher[]): boolean {
  const lastSequence = vault.declaredLastSequence as number;
  const finished = (sequence: number) => vouchers.some((voucher) =>
    voucher.sequence === sequence && !isInProgress(voucher));
  const everyDeclaredVoucherFinished = Array.from({ length: lastSequence }, (_, index) => index + 1).every(finished);
  return everyDeclaredVoucherFinished
    && findBlockingVouchers(vouchers).length === 0
    && settledUsd(vouchers) >= (vault.declaredTotalUsdMinor as number);
}


export class VaultRelease {
  constructor(private readonly dependencies: VaultReleaseDependencies) {}

  public async releaseIfClear(vaultId: string): Promise<void> {
    const { vaults, vouchers } = this.dependencies;
    const vault = await vaults.findById(vaultId);
    if (vault?.status !== 'SPEND_CLOSED') {
      return;
    }
    if (isClearToRelease(vault, await vouchers.listForVault(vaultId))) {
      await this.release(vault);
    }
  }


  public async release(vault: Vault): Promise<void> {
    const { gateway, vouchers } = this.dependencies;
    const held = await vouchers.listForVault(vault.id);
    if (vault.fundedBy !== 'WALLET' && settledUsd(held) < vault.authorisedUsdMinor) {
      const result = await gateway.voidAuthorization(vault.paypalAuthorizationId as string);
      if (result === 'ALREADY_CAPTURED') {
        console.error(`PayPal would not void the rest of ${vault.id} after its captures`);
      }
    }
    await this.close(vault.id);
  }


  public close(vaultId: string): Promise<void> {
    return this.dependencies.vouchers.withVaultLock(vaultId, async (session) => {
      if (session.vault.status === 'CLOSED') {
        return;
      }
      const now = this.dependencies.clock.now();
      for (const voucher of session.vouchers.filter((item) => isInProgress(item) && !item.paypalCaptureId)) {
        await this.blockUnfinished(session, voucher, now);
      }
      await session.updateVault({ status: 'CLOSED', releasedAt: now });
      await this.recordRelease(session, now);
      if (session.vault.fundedBy === 'WALLET') {
        await this.returnToWallet(session, now);
      }
    });
  }


  private async blockUnfinished(session: VaultSession, voucher: Voucher, now: Date): Promise<void> {
    await session.updateVoucher(voucher.id, {
      status: 'SETTLEMENT_BLOCKED',
      nextAttemptAt: null,
      leaseUntil: null,
      updatedAt: now,
    });
    await session.addAlert({
      id: `alr_${this.dependencies.random.uuid()}`,
      type: 'SETTLEMENT_BLOCKED',
      vaultId: session.vault.id,
      voucherId: voucher.id,
      details: { reason: 'HOLD_RELEASED' },
      createdAt: now,
    });
    for (const deviceId of [voucher.payerDeviceId, voucher.payeeDeviceId]) {
      await session.addEvent({
        id: `txn_${voucher.id}_rejected_${deviceId}`,
        deviceId,
        type: 'VOUCHER_REJECTED',
        amountNgnMinor: voucher.amountNgnMinor,
        amountUsdMinor: voucher.amountUsdMinor,
        vaultId: voucher.vaultId,
        voucherId: voucher.id,
        paypalReferenceId: null,
        occurredAt: now,
      });
    }
  }


  private async returnToWallet({ addLedgerEntry, vault, vouchers }: VaultSession, now: Date): Promise<void> {
    const settled = vouchers.filter(({ status }) => status === 'SETTLED');
    const unspentUsd = vault.authorisedUsdMinor - settledUsd(settled);
    const unspentNgn = vault.amountNgnMinor - settled.reduce((total, voucher) => total + voucher.amountNgnMinor, 0);
    if (unspentUsd <= 0) {
      return;
    }
    await addLedgerEntry({
      id: `led_${this.dependencies.random.uuid()}`,
      deviceId: vault.deviceId,
      type: 'VAULT_RETURN',
      amountUsdMinor: unspentUsd,
      amountNgnMinor: Math.max(unspentNgn, 0),
      voucherId: null,
      withdrawalId: null,
      depositId: null,
      paypalCaptureId: null,
      createdAt: now,
      vaultId: vault.id,
    });
  }


  private async recordRelease({ addEvent, vault, vouchers }: VaultSession, occurredAt: Date): Promise<void> {
    const settled = vouchers.filter(({ status }) => status === 'SETTLED');
    const settledNgn = settled.reduce((total, voucher) => total + voucher.amountNgnMinor, 0);
    await addEvent({
      id: `txn_${vault.id}_released`,
      deviceId: vault.deviceId,
      type: 'VAULT_RELEASED',
      amountNgnMinor: vault.amountNgnMinor - settledNgn,
      amountUsdMinor: vault.authorisedUsdMinor - settledUsd(settled),
      vaultId: vault.id,
      voucherId: null,
      paypalReferenceId: vault.paypalAuthorizationId,
      occurredAt,
    });
  }
}
