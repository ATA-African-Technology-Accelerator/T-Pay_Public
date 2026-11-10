import type pg from 'pg';
import type { Language } from '@tpay/shared/contracts/statuses';
import type { Device, IDeviceRepository } from '../../services/ports';

interface DeviceRow {
  id: string;
  key_id: string;
  public_key: string;
  token_hash: string;
  display_name: string;
  language: Language;
  payout_email: string;
  created_at: Date;
  revoked_at: Date | null;
}

const toDevice = (row: DeviceRow): Device => ({
  id: row.id,
  keyId: row.key_id,
  publicKey: row.public_key,
  tokenHash: row.token_hash,
  displayName: row.display_name,
  language: row.language,
  payoutEmail: row.payout_email,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
});

export class PostgresDeviceRepository implements IDeviceRepository {
  constructor(private readonly pool: pg.Pool) {}

  public findById(id: string): Promise<Device | null> {
    return this.findWhere('id', id);
  }

  public findByKeyId(keyId: string): Promise<Device | null> {
    return this.findWhere('key_id', keyId);
  }

  public findByPublicKey(publicKey: string): Promise<Device | null> {
    return this.findWhere('public_key', publicKey);
  }

  public findByTokenHash(tokenHash: string): Promise<Device | null> {
    return this.findWhere('token_hash', tokenHash);
  }

  public async save(device: Device): Promise<Device> {
    const { rows } = await this.pool.query<DeviceRow>(
      `INSERT INTO devices
         (id, key_id, public_key, token_hash, display_name, language, payout_email, created_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (public_key) DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         display_name = EXCLUDED.display_name,
         language = EXCLUDED.language,
         payout_email = EXCLUDED.payout_email,
         revoked_at = COALESCE(devices.revoked_at, EXCLUDED.revoked_at)
       RETURNING *`,
      [
        device.id,
        device.keyId,
        device.publicKey,
        device.tokenHash,
        device.displayName,
        device.language,
        device.payoutEmail,
        device.createdAt,
        device.revokedAt,
      ],
    );
    return toDevice(rows[0] as DeviceRow);
  }

  private async findWhere(column: 'id' | 'key_id' | 'public_key' | 'token_hash', value: string): Promise<Device | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `SELECT * FROM devices WHERE ${column} = $1`,
      [value],
    );
    return rows[0] ? toDevice(rows[0]) : null;
  }
}
