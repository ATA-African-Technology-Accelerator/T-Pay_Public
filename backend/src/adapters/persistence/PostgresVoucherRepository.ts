import type pg from 'pg';
import type { ReceiptPayload, SignedEnvelope, VoucherPayload } from '@tpay/shared/contracts/messages';
import { ApiError } from '../../services/ApiError';
import type {
  Alert, AlertType, IVoucherRepository, LedgerRecord, PayPalEventRecord, StoredVoucherStatus,
  VaultChanges, VaultSession, Voucher, VoucherChanges, VoucherPage,
} from '../../services/ports';
import { insertLedgerEntry, toLedgerRecord, type LedgerRow } from './ledgerRows';
import { PostgresTransactionRepository } from './PostgresTransactionRepository';
import { toVault, type VaultRow } from './PostgresVaultRepository';




interface VoucherRow {
  position: string;
  id: string;
  vault_id: string;
  sequence: number;
  payload_hash: string;
  payload: VoucherPayload;
  signature: string;
  receipt: SignedEnvelope<ReceiptPayload> | null;
  payer_device_id: string;
  payee_device_id: string;
  payer_name: string;
  payee_name: string;
  amount_ngn_minor: string;
  amount_usd_minor: string;
  status: StoredVoucherStatus;
  paypal_capture_id: string | null;
  attempts: number;
  next_attempt_at: Date | null;
  lease_until: Date | null;
  created_at: Date;
  updated_at: Date;
}


interface AlertRow {
  id: string;
  type: AlertType;
  vault_id: string;
  voucher_id: string | null;
  details: Record<string, unknown>;
  created_at: Date;
}


const VOUCHER_COLUMNS: Record<keyof VoucherChanges, string> = {
  status: 'status',
  paypalCaptureId: 'paypal_capture_id',
  attempts: 'attempts',
  nextAttemptAt: 'next_attempt_at',
  leaseUntil: 'lease_until',
  updatedAt: 'updated_at',
};

const VAULT_COLUMNS: Record<keyof VaultChanges, string> = {
  status: 'status',
  declaredLastSequence: 'declared_last_sequence',
  declaredTotalUsdMinor: 'declared_total_usd_minor',
  releasedAt: 'released_at',
};


const toVoucher = (row: VoucherRow): Voucher => ({
  id: row.id,
  vaultId: row.vault_id,
  sequence: row.sequence,
  payloadHash: row.payload_hash,
  payload: row.payload,
  signature: row.signature,
  receipt: row.receipt,
  payerDeviceId: row.payer_device_id,
  payeeDeviceId: row.payee_device_id,
  payerName: row.payer_name,
  payeeName: row.payee_name,
  amountNgnMinor: Number(row.amount_ngn_minor),
  amountUsdMinor: Number(row.amount_usd_minor),
  status: row.status,
  paypalCaptureId: row.paypal_capture_id,
  attempts: row.attempts,
  nextAttemptAt: row.next_attempt_at,
  leaseUntil: row.lease_until,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});


const toAlert = (row: AlertRow): Alert => ({
  id: row.id,
  type: row.type,
  vaultId: row.vault_id,
  voucherId: row.voucher_id,
  details: row.details,
  createdAt: row.created_at,
});


function assignments<T extends object>(changes: T, columns: Record<keyof T, string>) {
  const entries = Object.entries(changes) as Array<[keyof T, unknown]>;
  return {
    clause: entries.map(([key], index) => `${columns[key]} = $${index + 2}`).join(', '),
    values: entries.map(([, value]) => value),
  };
}


export class PostgresVoucherRepository implements IVoucherRepository {
  constructor(private readonly pool: pg.Pool) {}

  public async withVaultLock<T>(vaultId: string, work: (session: VaultSession) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const session = await this.openSession(client, vaultId);
      const result = await work(session);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }


  public async findById(id: string): Promise<Voucher | null> {
    const { rows } = await this.pool.query<VoucherRow>('SELECT * FROM vouchers WHERE id = $1', [id]);
    return rows[0] ? toVoucher(rows[0]) : null;
  }


  public async findByCaptureId(captureId: string): Promise<Voucher | null> {
    const { rows } = await this.pool.query<VoucherRow>(
      'SELECT * FROM vouchers WHERE paypal_capture_id = $1',
      [captureId],
    );
    return rows[0] ? toVoucher(rows[0]) : null;
  }


  public async listForVault(vaultId: string): Promise<Voucher[]> {
    const { rows } = await this.pool.query<VoucherRow>(
      'SELECT * FROM vouchers WHERE vault_id = $1 ORDER BY position',
      [vaultId],
    );
    return rows.map(toVoucher);
  }


  public async listForDevice(deviceId: string, cursor: string | null, limit: number): Promise<VoucherPage> {
    const { rows } = await this.pool.query<VoucherRow>(
      `SELECT * FROM vouchers
       WHERE (payer_device_id = $1 OR payee_device_id = $1)
         AND ($2::bigint IS NULL OR position < $2::bigint)
       ORDER BY position DESC
       LIMIT $3`,
      [deviceId, cursor, limit + 1],
    );
    const page = rows.slice(0, limit);
    return {
      items: page.map(toVoucher),
      nextCursor: rows.length > limit ? (page.at(-1) as VoucherRow).position : null,
    };
  }


  public async findDueForRetry(now: Date): Promise<Voucher[]> {
    const { rows } = await this.pool.query<VoucherRow>(
      `SELECT * FROM vouchers
       WHERE status IN ('SETTLING', 'RETRYABLE_FAILURE')
         AND paypal_capture_id IS NULL
         AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
         AND (lease_until IS NULL OR lease_until <= $1)
       ORDER BY position`,
      [now],
    );
    return rows.map(toVoucher);
  }


  public async pendingNgnForPayee(deviceId: string): Promise<number> {
    const { rows } = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_ngn_minor), 0) AS total FROM vouchers
       WHERE payee_device_id = $1 AND status IN ('SETTLING', 'RETRYABLE_FAILURE')`,
      [deviceId],
    );
    return Number(rows[0]?.total);
  }


  public async listLedgerForDevice(deviceId: string): Promise<LedgerRecord[]> {
    const { rows } = await this.pool.query<LedgerRow>(
      'SELECT * FROM ledger_entries WHERE device_id = $1 ORDER BY position DESC',
      [deviceId],
    );
    return rows.map(toLedgerRecord);
  }


  public async listAlerts(vaultId: string): Promise<Alert[]> {
    const { rows } = await this.pool.query<AlertRow>(
      'SELECT * FROM alerts WHERE vault_id = $1 ORDER BY position',
      [vaultId],
    );
    return rows.map(toAlert);
  }


  public async rememberEvent({ id, payload, type }: PayPalEventRecord): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO paypal_events (event_id, event_type, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING`,
      [id, type, JSON.stringify(payload)],
    );
    return rowCount === 1;
  }


  public async forgetEvent(eventId: string): Promise<void> {
    await this.pool.query('DELETE FROM paypal_events WHERE event_id = $1', [eventId]);
  }


  private async openSession(client: pg.PoolClient, vaultId: string): Promise<VaultSession> {
    const locked = await client.query<VaultRow>('SELECT * FROM vaults WHERE id = $1 FOR UPDATE', [vaultId]);
    if (!locked.rows[0]) {
      throw new ApiError('VAULT_NOT_FOUND', 'This vault does not exist');
    }
    const { rows } = await client.query<VoucherRow>(
      'SELECT * FROM vouchers WHERE vault_id = $1 ORDER BY position',
      [vaultId],
    );

    let vault = toVault(locked.rows[0]);
    const vouchers = rows.map(toVoucher);
    const transactions = new PostgresTransactionRepository(client as unknown as pg.Pool);

    return {
      get vault() {
        return vault;
      },
      vouchers,
      insertVoucher: async (voucher) => {
        await client.query(
          `INSERT INTO vouchers
             (id, vault_id, sequence, payload_hash, payload, signature, receipt, payer_device_id, payee_device_id,
              payer_name, payee_name, amount_ngn_minor, amount_usd_minor, status, paypal_capture_id, attempts,
              next_attempt_at, lease_until, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            voucher.id, voucher.vaultId, voucher.sequence, voucher.payloadHash, JSON.stringify(voucher.payload),
            voucher.signature, voucher.receipt && JSON.stringify(voucher.receipt), voucher.payerDeviceId,
            voucher.payeeDeviceId, voucher.payerName, voucher.payeeName, voucher.amountNgnMinor,
            voucher.amountUsdMinor, voucher.status, voucher.paypalCaptureId, voucher.attempts,
            voucher.nextAttemptAt, voucher.leaseUntil, voucher.createdAt, voucher.updatedAt,
          ],
        );
        vouchers.push(voucher);
      },
      updateVoucher: async (id, changes) => {
        const { clause, values } = assignments(changes, VOUCHER_COLUMNS);
        const updated = await client.query<VoucherRow>(
          `UPDATE vouchers SET ${clause} WHERE id = $1 RETURNING *`,
          [id, ...values],
        );
        const voucher = toVoucher(updated.rows[0] as VoucherRow);
        vouchers[vouchers.findIndex((candidate) => candidate.id === id)] = voucher;
        return voucher;
      },
      updateVault: async (changes) => {
        const { clause, values } = assignments(changes, VAULT_COLUMNS);
        const updated = await client.query<VaultRow>(
          `UPDATE vaults SET ${clause} WHERE id = $1 RETURNING *`,
          [vaultId, ...values],
        );
        vault = toVault(updated.rows[0] as VaultRow);
      },
      addAlert: async (alert) => {
        await client.query(
          `INSERT INTO alerts (id, type, vault_id, voucher_id, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [alert.id, alert.type, alert.vaultId, alert.voucherId, JSON.stringify(alert.details), alert.createdAt],
        );
      },
      addLedgerEntry: (entry) => insertLedgerEntry(client, entry),
      addEvent: (event) => transactions.append(event),
    };
  }
}
