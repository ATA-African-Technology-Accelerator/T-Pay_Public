import type {
  IWalletRepository, WalletSession, Withdrawal, WithdrawalChanges,
} from '../../services/ports';
import type { InMemoryTransactionRepository } from './InMemoryTransactionRepository';
import type { InMemoryVoucherRepository } from './InMemoryVoucherRepository';




export class InMemoryWalletRepository implements IWalletRepository {
  private readonly withdrawals = new Map<string, Withdrawal>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly vouchers: InMemoryVoucherRepository,
    private readonly transactions: InMemoryTransactionRepository,
  ) {}

  public withWalletLock<T>(deviceId: string, work: (session: WalletSession) => Promise<T>): Promise<T> {
    const previous = this.locks.get(deviceId) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(() => work(this.createSession(deviceId)));
    this.locks.set(deviceId, run);
    return run;
  }


  public async findWithdrawal(id: string): Promise<Withdrawal | null> {
    return this.withdrawals.get(id) ?? null;
  }


  public async findDueWithdrawals(now: Date): Promise<Withdrawal[]> {
    return [...this.withdrawals.values()].filter(({ nextAttemptAt, status }) =>
      status === 'PENDING' && nextAttemptAt !== null && nextAttemptAt <= now);
  }


  private createSession(deviceId: string): WalletSession {
    const { transactions, vouchers, withdrawals } = this;
    const session: WalletSession = {
      get ledger() {
        return vouchers.ledgerFor(deviceId);
      },
      insertWithdrawal: async (withdrawal) => {
        withdrawals.set(withdrawal.id, withdrawal);
      },
      updateWithdrawal: async (id, changes: WithdrawalChanges) => {
        const updated = { ...(withdrawals.get(id) as Withdrawal), ...changes };
        withdrawals.set(id, updated);
        return updated;
      },
      addLedgerEntry: async (entry) => vouchers.appendLedger(entry),
      addEvent: (event) => transactions.append(event),
    };
    return session;
  }
}
