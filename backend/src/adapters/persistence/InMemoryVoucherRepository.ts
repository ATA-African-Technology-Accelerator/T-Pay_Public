import { ApiError } from '../../services/ApiError';
import type {
  Alert, IVoucherRepository, LedgerRecord, PayPalEventRecord, VaultChanges, VaultSession,
  Voucher, VoucherChanges, VoucherPage,
} from '../../services/ports';
import { isInProgress } from '../../services/vaultView';
import type { InMemoryTransactionRepository } from './InMemoryTransactionRepository';
import type { InMemoryVaultRepository } from './InMemoryVaultRepository';




export class InMemoryVoucherRepository implements IVoucherRepository {
  private readonly vouchers: Voucher[] = [];
  private readonly ledger: LedgerRecord[] = [];
  private readonly alerts: Alert[] = [];
  private readonly events = new Set<string>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    public readonly vaults: InMemoryVaultRepository,
    private readonly transactions: InMemoryTransactionRepository,
  ) {}

  public withVaultLock<T>(vaultId: string, work: (session: VaultSession) => Promise<T>): Promise<T> {
    const previous = this.locks.get(vaultId) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(() => this.runLocked(vaultId, work));
    this.locks.set(vaultId, run);
    return run;
  }


  public async findById(id: string): Promise<Voucher | null> {
    return this.vouchers.find((voucher) => voucher.id === id) ?? null;
  }


  public async findByCaptureId(captureId: string): Promise<Voucher | null> {
    return this.vouchers.find((voucher) => voucher.paypalCaptureId === captureId) ?? null;
  }


  public async listForVault(vaultId: string): Promise<Voucher[]> {
    return this.vouchers.filter((voucher) => voucher.vaultId === vaultId);
  }


  public async listForDevice(deviceId: string, cursor: string | null, limit: number): Promise<VoucherPage> {
    const end = cursor === null ? this.vouchers.length : Number(cursor);
    const matches = this.vouchers
      .map((voucher, position) => ({ voucher, position }))
      .filter(({ position, voucher }) =>
        position < end && (voucher.payerDeviceId === deviceId || voucher.payeeDeviceId === deviceId))
      .reverse();
    const page = matches.slice(0, limit);
    return {
      items: page.map(({ voucher }) => voucher),
      nextCursor: matches.length > limit ? String(page.at(-1)?.position) : null,
    };
  }


  public async findDueForRetry(now: Date): Promise<Voucher[]> {
    return this.vouchers.filter((voucher) =>
      (voucher.status === 'SETTLING' || voucher.status === 'RETRYABLE_FAILURE')
      && voucher.paypalCaptureId === null
      && (voucher.nextAttemptAt === null || voucher.nextAttemptAt <= now)
      && (voucher.leaseUntil === null || voucher.leaseUntil <= now));
  }


  public async pendingNgnForPayee(deviceId: string): Promise<number> {
    return this.vouchers
      .filter((voucher) => voucher.payeeDeviceId === deviceId && isInProgress(voucher))
      .reduce((total, voucher) => total + voucher.amountNgnMinor, 0);
  }


  public devicesWithLedgerType(type: LedgerRecord['type']): string[] {
    return [...new Set(this.ledger.filter((entry) => entry.type === type).map((entry) => entry.deviceId))];
  }


  public ledgerFor(deviceId: string): LedgerRecord[] {
    return this.ledger.filter((entry) => entry.deviceId === deviceId);
  }


  public appendLedger(entry: LedgerRecord): void {
    const exists = this.ledger.some(({ type, voucherId, withdrawalId, depositId, vaultId }) =>
      type === entry.type
      && ((voucherId !== null && voucherId === entry.voucherId)
        || (withdrawalId !== null && withdrawalId === entry.withdrawalId)
        || (depositId !== null && depositId === entry.depositId)
        || (vaultId != null && vaultId === entry.vaultId)));
    if (!exists) {
      this.ledger.push({ ...entry, vaultId: entry.vaultId ?? null, autoCashOut: entry.autoCashOut === true });
    }
  }


  public async listLedgerForDevice(deviceId: string): Promise<LedgerRecord[]> {
    return this.ledgerFor(deviceId).reverse();
  }


  public async listAlerts(vaultId: string): Promise<Alert[]> {
    return this.alerts.filter((alert) => alert.vaultId === vaultId);
  }


  public async rememberEvent({ id }: PayPalEventRecord): Promise<boolean> {
    if (this.events.has(id)) {
      return false;
    }
    this.events.add(id);
    return true;
  }


  public async forgetEvent(eventId: string): Promise<void> {
    this.events.delete(eventId);
  }


  private async runLocked<T>(vaultId: string, work: (session: VaultSession) => Promise<T>): Promise<T> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      throw new ApiError('VAULT_NOT_FOUND', 'This vault does not exist');
    }
    const session = this.createSession(vaultId, await this.listForVault(vaultId));
    return work(session);
  }


  private createSession(vaultId: string, vouchers: Voucher[]): VaultSession {
    const { alerts, transactions, vaults } = this;
    const list = this.vouchers;
    const currentVault = () => vaults.findById(vaultId);
    let vault = vaults.peek(vaultId);

    return {
      get vault() {
        return vault;
      },
      vouchers,
      insertVoucher: async (voucher) => {
        list.push(voucher);
        vouchers.push(voucher);
      },
      updateVoucher: async (id, changes: VoucherChanges) => {
        const position = list.findIndex((voucher) => voucher.id === id);
        const updated = { ...(list[position] as Voucher), ...changes };
        list[position] = updated;
        vouchers[vouchers.findIndex((voucher) => voucher.id === id)] = updated;
        return updated;
      },
      updateVault: async (changes: VaultChanges) => {
        vault = { ...(await currentVault() as NonNullable<Awaited<ReturnType<typeof currentVault>>>), ...changes };
        vaults.replace(vault);
      },
      addAlert: async (alert) => {
        alerts.push(alert);
      },
      addLedgerEntry: async (entry) => this.appendLedger(entry),
      addEvent: (event) => transactions.append(event),
    };
  }
}
