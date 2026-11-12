import type pg from 'pg';
import type { LedgerRecord } from '../../services/ports';




export interface LedgerRow {
  id: string;
  device_id: string;
  type: LedgerRecord['type'];
  amount_usd_minor: string;
  amount_ngn_minor: string;
  voucher_id: string | null;
  withdrawal_id: string | null;
  deposit_id: string | null;
  paypal_capture_id: string | null;
  created_at: Date;
  vault_id?: string | null;
  auto_cash_out?: boolean;
}


export const toLedgerRecord = (row: LedgerRow): LedgerRecord => ({
  id: row.id,
  deviceId: row.device_id,
  type: row.type,
  amountUsdMinor: Number(row.amount_usd_minor),
  amountNgnMinor: Number(row.amount_ngn_minor),
  voucherId: row.voucher_id,
  withdrawalId: row.withdrawal_id,
  depositId: row.deposit_id,
  paypalCaptureId: row.paypal_capture_id,
  createdAt: row.created_at,
  vaultId: row.vault_id ?? null,
  autoCashOut: row.auto_cash_out === true,
});


export async function insertLedgerEntry(client: pg.PoolClient, entry: LedgerRecord): Promise<void> {
  await client.query(
    `INSERT INTO ledger_entries
       (id, device_id, type, amount_usd_minor, amount_ngn_minor, voucher_id, withdrawal_id, deposit_id, paypal_capture_id, created_at, vault_id, auto_cash_out)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT DO NOTHING`,
    [
      entry.id, entry.deviceId, entry.type, entry.amountUsdMinor, entry.amountNgnMinor,
      entry.voucherId, entry.withdrawalId, entry.depositId, entry.paypalCaptureId, entry.createdAt, entry.vaultId ?? null, entry.autoCashOut === true,
    ],
  );
}
