import type pg from 'pg';
import type { IdempotencyClaim, IIdempotencyStore, StoredResponse } from '../../services/ports';




interface KeyRow {
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
}

export class PostgresIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly pool: pg.Pool) {}

  public async claim(deviceId: string, key: string, requestHash: string): Promise<IdempotencyClaim> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO idempotency_keys (device_id, key, request_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_id, key) DO NOTHING`,
      [deviceId, key, requestHash],
    );
    if (rowCount === 1) {
      return { outcome: 'NEW' };
    }

    const { rows } = await this.pool.query<KeyRow>(
      'SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE device_id = $1 AND key = $2',
      [deviceId, key],
    );
    const row = rows[0];
    if (row?.request_hash === requestHash && row.response_status !== null) {
      return { outcome: 'REPLAY', response: { status: row.response_status, body: row.response_body } };
    }
    return { outcome: 'CONFLICT' };
  }

  public async complete(deviceId: string, key: string, response: StoredResponse): Promise<void> {
    await this.pool.query(
      `UPDATE idempotency_keys SET response_status = $3, response_body = $4
       WHERE device_id = $1 AND key = $2`,
      [deviceId, key, response.status, JSON.stringify(response.body)],
    );
  }

  public async release(deviceId: string, key: string): Promise<void> {
    await this.pool.query('DELETE FROM idempotency_keys WHERE device_id = $1 AND key = $2', [deviceId, key]);
  }
}
