import type pg from 'pg';
import type {
  Deposit, DepositChanges, DepositSource, DepositStatus, IWalletRepository, WalletSession, Withdrawal, WithdrawalChanges, WithdrawalStatus,
} from '../../services/ports';
import { insertLedgerEntry, toLedgerRecord, type LedgerRow } from './ledgerRows';
import { PostgresTransactionRepository } from './PostgresTransactionRepository';
import { insertVaultRow } from './PostgresVaultRepository';




interface DepositRow {
  id: string;
  device_id: string;
  source: DepositSource;
  order_id: string;
  amount_usd_minor: string;
  amount_ngn_minor: string;
  status: DepositStatus;
  paypal_capture_id: string | null;
  created_at: Date;
  updated_at: Date;
}


const DEPOSIT_COLUMNS: Record<keyof DepositChanges, string> = {
  status: 'status',
  paypalCaptureId: 'paypal_capture_id',
  updatedAt: 'updated_at',
};


const toDeposit = (row: DepositRow): Deposit => ({
  id: row.id,
  deviceId: row.device_id,
  source: row.source,
  orderId: row.order_id,
  amountUsdMinor: Number(row.amount_usd_minor),
  amountNgnMinor: Number(row.amount_ngn_minor),
  status: row.status,
  paypalCaptureId: row.paypal_capture_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});


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
  auto_cash_out?: boolean;
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
  autoCashOut: row.auto_cash_out === true,
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


  public async listDevicesPaidOffline(): Promise<string[]> {
    const { rows } = await this.pool.query<{ device_id: string }>("SELECT DISTINCT device_id FROM ledger_entries WHERE type = 'CREDIT'");
    return rows.map(({ device_id }) => device_id);
  }


  public async findDeposit(id: string): Promise<Deposit | null> {
    const { rows } = await this.pool.query<DepositRow>('SELECT * FROM deposits WHERE id = $1', [id]);
    return rows[0] ? toDeposit(rows[0]) : null;
  }


  public async findOrCreatePayLink(deviceId: string, token: string, now: Date): Promise<string> {
    // One link per device: the unique device column makes a second insert do nothing.
    await this.pool.query(
      'INSERT INTO pay_links (token, device_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (device_id) DO NOTHING',
      [token, deviceId, now],
    );
    const { rows } = await this.pool.query<{ token: string }>('SELECT token FROM pay_links WHERE device_id = $1', [deviceId]);
    return (rows[0] as { token: string }).token;
  }


  public async findPayLinkOwner(token: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ device_id: string }>('SELECT device_id FROM pay_links WHERE token = $1', [token]);
    return rows[0]?.device_id ?? null;
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
      insertVault: (vault) => insertVaultRow(client, vault),
      insertDeposit: async (deposit) => {
        await client.query(
          `INSERT INTO deposits
             (id, device_id, source, order_id, amount_usd_minor, amount_ngn_minor, status, paypal_capture_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            deposit.id, deposit.deviceId, deposit.source, deposit.orderId, deposit.amountUsdMinor, deposit.amountNgnMinor,
            deposit.status, deposit.paypalCaptureId, deposit.createdAt, deposit.updatedAt,
          ],
        );
      },
      updateDeposit: async (id, changes) => {
        const entries = Object.entries(changes) as Array<[keyof DepositChanges, unknown]>;
        const clause = entries.map(([key], index) => `${DEPOSIT_COLUMNS[key]} = $${index + 2}`).join(', ');
        const updated = await client.query<DepositRow>(
          `UPDATE deposits SET ${clause} WHERE id = $1 RETURNING *`,
          [id, ...entries.map(([, value]) => value)],
        );
        return toDeposit(updated.rows[0] as DepositRow);
      },
      insertWithdrawal: async (withdrawal) => {
        await client.query(
          `INSERT INTO withdrawals
             (id, device_id, receiver_email, amount_usd_minor, amount_ngn_minor, status, paypal_batch_id,
              attempts, next_attempt_at, created_at, updated_at, auto_cash_out)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            withdrawal.id, withdrawal.deviceId, withdrawal.receiverEmail, withdrawal.amountUsdMinor,
            withdrawal.amountNgnMinor, withdrawal.status, withdrawal.paypalBatchId, withdrawal.attempts,
            withdrawal.nextAttemptAt, withdrawal.createdAt, withdrawal.updatedAt, withdrawal.autoCashOut === true,
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
