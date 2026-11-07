import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import type {
  AlertType, CaptureResult, IPaymentGateway, IVaultRepository, IVoucherRepository, TransactionEvent,
  Vault, VaultSession, Voucher,
} from './ports';
import { backoffMs } from './backoff';
import type { VaultRelease } from './VaultRelease';
import { isInProgress } from './vaultView';




const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 8;


export interface VoucherSettlementDependencies {
  vaults: IVaultRepository;
  vouchers: IVoucherRepository;
  gateway: IPaymentGateway;
  clock: IClock;
  random: IRandom;
}


export class VoucherSettlement {
  constructor(
    private readonly dependencies: VoucherSettlementDependencies,
    private readonly vaultRelease: VaultRelease,
  ) {}

  public async attempt(voucherId: string): Promise<Voucher> {
    const { vaults, vouchers } = this.dependencies;
    const current = await vouchers.findById(voucherId) as Voucher;
    const claimed = await this.claim(current);
    if (!claimed) {
      return (await vouchers.findById(voucherId)) as Voucher;
    }
    const vault = await vaults.findById(claimed.vaultId) as Vault;
    return this.record(claimed, await this.capture(vault, claimed));
  }


  public async retryDue(): Promise<void> {
    const { clock, vouchers } = this.dependencies;
    for (const voucher of await vouchers.findDueForRetry(clock.now())) {
      await this.attempt(voucher.id);
    }
  }


  public async markCompleted(voucher: Voucher, captureId: string): Promise<void> {
    await this.dependencies.vouchers.withVaultLock(voucher.vaultId, (session) =>
      this.settle(session, voucher.id, captureId));
    await this.releaseIfClear(voucher.vaultId);
  }


  public markPending(voucher: Voucher, captureId: string): Promise<void> {
    return this.dependencies.vouchers.withVaultLock(voucher.vaultId, async (session) => {
      const current = session.vouchers.find(({ id }) => id === voucher.id) as Voucher;
      if (isInProgress(current)) {
        await this.keepPending(session, current, captureId);
      }
    });
  }


  public markBlocked(voucher: Voucher, reason: string): Promise<void> {
    return this.dependencies.vouchers.withVaultLock(voucher.vaultId, (session) =>
      this.block(session, voucher.id, reason));
  }


  public markReversed(voucher: Voucher, reason: string): Promise<void> {
    return this.dependencies.vouchers.withVaultLock(voucher.vaultId, (session) =>
      this.reverse(session, voucher.id, reason));
  }


  public async recordAlert(
    session: VaultSession,
    type: AlertType,
    voucherId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await session.addAlert({
      id: `alr_${this.dependencies.random.uuid()}`,
      type,
      vaultId: session.vault.id,
      voucherId,
      details,
      createdAt: this.dependencies.clock.now(),
    });
  }


  public async recordEvents(session: VaultSession, voucher: Voucher, type: TransactionEvent['type']): Promise<void> {
    const occurredAt = this.dependencies.clock.now();
    for (const deviceId of [voucher.payerDeviceId, voucher.payeeDeviceId]) {
      await session.addEvent({
        id: `txn_${voucher.id}_${type.toLowerCase()}_${deviceId}`,
        deviceId,
        type,
        amountNgnMinor: voucher.amountNgnMinor,
        amountUsdMinor: voucher.amountUsdMinor,
        vaultId: voucher.vaultId,
        voucherId: voucher.id,
        paypalReferenceId: voucher.paypalCaptureId,
        occurredAt,
      });
    }
  }


  private claim(voucher: Voucher): Promise<Voucher | null> {
    const { clock, vouchers } = this.dependencies;
    const now = clock.now();
    const available = (item: Voucher) => item.leaseUntil === null || item.leaseUntil <= now;

    return vouchers.withVaultLock(voucher.vaultId, async (session) => {
      const current = session.vouchers.find(({ id }) => id === voucher.id) as Voucher;
      const due = current.nextAttemptAt === null || current.nextAttemptAt <= now;
      const claimable = isInProgress(current) && !current.paypalCaptureId && due;
      if (!claimable || !session.vouchers.every(available)) {
        return null;
      }
      return session.updateVoucher(current.id, { leaseUntil: new Date(now.getTime() + LEASE_MS) });
    });
  }


  private async capture(vault: Vault, voucher: Voucher): Promise<CaptureResult> {
    const { gateway } = this.dependencies;
    const result = await gateway.capture({
      authorizationId: vault.paypalAuthorizationId as string,
      requestId: `${voucher.id}-capture`,
      invoiceId: voucher.id,
      amountUsdMinor: voucher.amountUsdMinor,
    });
    return result.outcome === 'RETRY' ? this.readBack(vault, voucher) : result;
  }


  private async readBack(vault: Vault, voucher: Voucher): Promise<CaptureResult> {
    try {
      const found = await this.dependencies.gateway.findCapture({
        orderId: vault.paypalOrderId,
        invoiceId: voucher.id,
      });
      return found ?? { outcome: 'RETRY' };
    } catch {
      return { outcome: 'RETRY' };
    }
  }


  private async record(voucher: Voucher, result: CaptureResult): Promise<Voucher> {
    const { vouchers } = this.dependencies;
    await vouchers.withVaultLock(voucher.vaultId, (session) => this.apply(session, voucher, result));
    if (result.outcome === 'COMPLETED') {
      await this.releaseIfClear(voucher.vaultId);
    }
    return (await vouchers.findById(voucher.id)) as Voucher;
  }


  private apply(session: VaultSession, voucher: Voucher, result: CaptureResult): Promise<void> {
    switch (result.outcome) {
      case 'COMPLETED':
        return this.settle(session, voucher.id, result.captureId);
      case 'PENDING':
        return this.keepPending(session, voucher, result.captureId);
      case 'BLOCKED':
        return this.block(session, voucher.id, result.reason);
      default:
        return this.scheduleRetry(session, voucher);
    }
  }


  private async settle(session: VaultSession, voucherId: string, captureId: string): Promise<void> {
    const current = session.vouchers.find(({ id }) => id === voucherId) as Voucher;
    if (current.status === 'SETTLED') {
      return;
    }
    const now = this.dependencies.clock.now();
    const settled = await session.updateVoucher(voucherId, {
      status: 'SETTLED',
      paypalCaptureId: captureId,
      nextAttemptAt: null,
      leaseUntil: null,
      updatedAt: now,
    });
    await session.addLedgerEntry({
      id: `led_${this.dependencies.random.uuid()}`,
      deviceId: settled.payeeDeviceId,
      type: 'CREDIT',
      amountUsdMinor: settled.amountUsdMinor,
      amountNgnMinor: settled.amountNgnMinor,
      voucherId,
      withdrawalId: null,
      paypalCaptureId: captureId,
      createdAt: now,
    });
    await this.recordEvents(session, settled, 'VOUCHER_SETTLED');
  }


  private async keepPending(session: VaultSession, voucher: Voucher, captureId: string): Promise<void> {
    await session.updateVoucher(voucher.id, {
      status: 'SETTLING',
      paypalCaptureId: captureId,
      nextAttemptAt: null,
      leaseUntil: null,
      updatedAt: this.dependencies.clock.now(),
    });
  }


  private async block(session: VaultSession, voucherId: string, reason: string): Promise<void> {
    const current = session.vouchers.find(({ id }) => id === voucherId) as Voucher;
    if (current.status === 'SETTLED') {
      await this.reverse(session, voucherId, reason);
      return;
    }
    if (!isInProgress(current)) {
      return;
    }
    const blocked = await session.updateVoucher(voucherId, {
      status: 'SETTLEMENT_BLOCKED',
      nextAttemptAt: null,
      leaseUntil: null,
      updatedAt: this.dependencies.clock.now(),
    });
    await this.recordAlert(session, 'SETTLEMENT_BLOCKED', voucherId, { reason });
    await this.recordEvents(session, blocked, 'VOUCHER_REJECTED');
  }


  private async reverse(session: VaultSession, voucherId: string, reason: string): Promise<void> {
    const current = session.vouchers.find(({ id }) => id === voucherId) as Voucher;
    if (current.status !== 'SETTLED') {
      return;
    }
    const now = this.dependencies.clock.now();
    const reversed = await session.updateVoucher(voucherId, { status: 'SETTLEMENT_BLOCKED', updatedAt: now });
    await session.addLedgerEntry({
      id: `led_${this.dependencies.random.uuid()}`,
      deviceId: reversed.payeeDeviceId,
      type: 'REVERSAL',
      amountUsdMinor: reversed.amountUsdMinor,
      amountNgnMinor: reversed.amountNgnMinor,
      voucherId,
      withdrawalId: null,
      paypalCaptureId: reversed.paypalCaptureId,
      createdAt: now,
    });
    await this.recordAlert(session, 'PAYMENT_REVERSED', voucherId, { reason });
    await this.recordEvents(session, reversed, 'VOUCHER_REJECTED');
  }


  private async scheduleRetry(session: VaultSession, voucher: Voucher): Promise<void> {
    const attempts = voucher.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.block(session, voucher.id, 'RETRIES_EXHAUSTED');
      return;
    }
    const now = this.dependencies.clock.now();
    await session.updateVoucher(voucher.id, {
      status: 'RETRYABLE_FAILURE',
      attempts,
      nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
      leaseUntil: null,
      updatedAt: now,
    });
  }


  private async releaseIfClear(vaultId: string): Promise<void> {
    try {
      await this.vaultRelease.releaseIfClear(vaultId);
    } catch (error) {
      console.error(`Could not release ${vaultId} yet`, error instanceof Error ? error.message : error);
    }
  }
}
