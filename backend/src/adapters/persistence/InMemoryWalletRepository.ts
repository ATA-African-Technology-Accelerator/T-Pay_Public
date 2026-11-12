import type {
  Deposit, DepositChanges, IWalletRepository, WalletSession, Withdrawal, WithdrawalChanges,
} from '../../services/ports';
import type { InMemoryTransactionRepository } from './InMemoryTransactionRepository';
import type { InMemoryVoucherRepository } from './InMemoryVoucherRepository';




export class InMemoryWalletRepository implements IWalletRepository {
  private readonly withdrawals = new Map<string, Withdrawal>();
  private readonly deposits = new Map<string, Deposit>();
  private readonly payLinks = new Map<string, string>();
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


  public async listDevicesPaidOffline(): Promise<string[]> {
    return this.vouchers.devicesWithLedgerType('CREDIT');
  }


  public async findDeposit(id: string): Promise<Deposit | null> {
    return this.deposits.get(id) ?? null;
  }


  public async findOrCreatePayLink(deviceId: string, token: string): Promise<string> {
    const existing = [...this.payLinks].find(([, owner]) => owner === deviceId);
    if (existing) {
      return existing[0];
    }
    this.payLinks.set(token, deviceId);
    return token;
  }


  public async findPayLinkOwner(token: string): Promise<string | null> {
    return this.payLinks.get(token) ?? null;
  }


  public async findWithdrawal(id: string): Promise<Withdrawal | null> {
    return this.withdrawals.get(id) ?? null;
  }


  public async findDueWithdrawals(now: Date): Promise<Withdrawal[]> {
    return [...this.withdrawals.values()].filter(({ nextAttemptAt, status }) =>
      status === 'PENDING' && nextAttemptAt !== null && nextAttemptAt <= now);
  }


  private createSession(deviceId: string): WalletSession {
    const { deposits, transactions, vouchers, withdrawals } = this;
    const session: WalletSession = {
      get ledger() {
        return vouchers.ledgerFor(deviceId);
      },
      insertVault: (vault) => vouchers.vaults.create(vault),
      insertDeposit: async (deposit) => {
        deposits.set(deposit.id, deposit);
      },
      updateDeposit: async (id, changes: DepositChanges) => {
        const updated = { ...(deposits.get(id) as Deposit), ...changes };
        deposits.set(id, updated);
        return updated;
      },
      insertWithdrawal: async (withdrawal) => {
        withdrawals.set(withdrawal.id, { ...withdrawal, autoCashOut: withdrawal.autoCashOut === true });
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
