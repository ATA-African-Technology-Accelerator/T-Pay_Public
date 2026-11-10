import type pg from 'pg';
import type {
  IWalletRepository, WalletSession, Withdrawal, WithdrawalChanges, WithdrawalStatus,
} from '../../services/ports';
import { insertLedgerEntry, toLedgerRecord, type LedgerRow } from './ledgerRows';
import { PostgresTransactionRepository } from './PostgresTransactionRepository';




interface WithdrawalRow {
  id: string;
  device_id: string;
  receiver_email: string;
  amount_usd_minor: string;
  amount_ngn_minor: string;
  status: WithdrawalStatus;
  paypal_batch_id: string | null;
  attempts: number;
  next_attempt_at: Date | null;
  created_at: Date;
  updated_at: Date;
}


const WITHDRAWAL_COLUMNS: Record<keyof WithdrawalChanges, string> = {
  status: 'status',
  paypalBatchId: 'paypal_batch_id',
  attempts: 'attempts',
  nextAttemptAt: 'next_attempt_at',
  updatedAt: 'updated_at',
};


const toWithdrawal = (row: WithdrawalRow): Withdrawal => ({
  id: row.id,
  deviceId: row.device_id,
  receiverEmail: row.receiver_email,
  amountUsdMinor: Number(row.amount_usd_minor),
  amountNgnMinor: Number(row.amount_ngn_minor),
  status: row.status,
  paypalBatchId: row.paypal_batch_id,
  attempts: row.attempts,
  nextAttemptAt: row.next_attempt_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});


export class PostgresWalletRepository implements IWalletRepository {
  constructor(private readonly pool: pg.Pool) {}

  public async withWalletLock<T>(deviceId: string, work: (session: WalletSession) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM devices WHERE id = $1 FOR NO KEY UPDATE', [deviceId]);
      const result = await work(await this.openSession(client, deviceId));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }


  public async findWithdrawal(id: string): Promise<Withdrawal | null> {
    const { rows } = await this.pool.query<WithdrawalRow>('SELECT * FROM withdrawals WHERE id = $1', [id]);
    return rows[0] ? toWithdrawal(rows[0]) : null;
  }


  public async findDueWithdrawals(now: Date): Promise<Withdrawal[]> {
    const { rows } = await this.pool.query<WithdrawalRow>(
      `SELECT * FROM withdrawals
       WHERE status = 'PENDING' AND next_attempt_at <= $1
       ORDER BY next_attempt_at`,
      [now],
    );
    return rows.map(toWithdrawal);
  }


  private async openSession(client: pg.PoolClient, deviceId: string): Promise<WalletSession> {
    const { rows } = await client.query<LedgerRow>(
      'SELECT * FROM ledger_entries WHERE device_id = $1 ORDER BY position',
      [deviceId],
    );
    const ledger = rows.map(toLedgerRecord);
    const transactions = new PostgresTransactionRepository(client as unknown as pg.Pool);

    return {
      ledger,
      insertWithdrawal: async (withdrawal) => {
        await client.query(
          `INSERT INTO withdrawals
             (id, device_id, receiver_email, amount_usd_minor, amount_ngn_minor, status, paypal_batch_id,
              attempts, next_attempt_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            withdrawal.id, withdrawal.deviceId, withdrawal.receiverEmail, withdrawal.amountUsdMinor,
            withdrawal.amountNgnMinor, withdrawal.status, withdrawal.paypalBatchId, withdrawal.attempts,
            withdrawal.nextAttemptAt, withdrawal.createdAt, withdrawal.updatedAt,
          ],
        );
      },
      updateWithdrawal: async (id, changes) => {
        const entries = Object.entries(changes) as Array<[keyof WithdrawalChanges, unknown]>;
        const clause = entries.map(([key], index) => `${WITHDRAWAL_COLUMNS[key]} = $${index + 2}`).join(', ');
        const updated = await client.query<WithdrawalRow>(
          `UPDATE withdrawals SET ${clause} WHERE id = $1 RETURNING *`,
          [id, ...entries.map(([, value]) => value)],
        );
        return toWithdrawal(updated.rows[0] as WithdrawalRow);
      },
      addLedgerEntry: (entry) => insertLedgerEntry(client, entry),
      addEvent: (event) => transactions.append(event),
    };
  }
}
