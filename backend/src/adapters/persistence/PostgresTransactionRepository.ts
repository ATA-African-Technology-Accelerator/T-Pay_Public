import type pg from 'pg';
import type { TransactionType } from '@tpay/shared/contracts/api';
import type {
  ITransactionRepository, TransactionEvent, TransactionPage,
} from '../../services/ports';





interface TransactionRow {
  position: string;
  id: string;
  device_id: string;
  type: TransactionType;
  amount_ngn_minor: string | null;
  amount_usd_minor: string | null;
  vault_id: string | null;
  voucher_id: string | null;
  paypal_reference_id: string | null;
  occurred_at: Date;
}



const toAmount = (value: string | null) => (value === null ? null : Number(value));

const toEvent = (row: TransactionRow): TransactionEvent => ({
  id: row.id,
  deviceId: row.device_id,
  type: row.type,
  amountNgnMinor: toAmount(row.amount_ngn_minor),
  amountUsdMinor: toAmount(row.amount_usd_minor),
  vaultId: row.vault_id,
  voucherId: row.voucher_id,
  paypalReferenceId: row.paypal_reference_id,
  occurredAt: row.occurred_at,
});

export class PostgresTransactionRepository implements ITransactionRepository {
  constructor(private readonly pool: Pick<pg.Pool, 'query'>) {}

  public async append(event: TransactionEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO transaction_events
         (id, device_id, type, amount_ngn_minor, amount_usd_minor, vault_id, voucher_id, paypal_reference_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        event.deviceId,
        event.type,
        event.amountNgnMinor,
        event.amountUsdMinor,
        event.vaultId,
        event.voucherId,
        event.paypalReferenceId,
        event.occurredAt,
      ],
    );
  }

  
  public async listForDevice(
    deviceId: string,
    cursor: string | null,
    limit: number,
  ): Promise<TransactionPage> {
    const { rows } = await this.pool.query<TransactionRow>(
      `SELECT * FROM transaction_events
       WHERE device_id = $1 AND ($2::bigint IS NULL OR position < $2::bigint)
       ORDER BY position DESC
       LIMIT $3`,
      [deviceId, cursor, limit + 1],
    );
    const page = rows.slice(0, limit);
    return {
      items: page.map(toEvent),
      nextCursor: rows.length > limit ? (page.at(-1) as TransactionRow).position : null,
    };
  }
}