import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { isDatabaseReachable } from '../../src/adapters/persistence/database';
import { runMigrations } from '../../src/adapters/persistence/migrations';
import { PostgresDeviceRepository } from '../../src/adapters/persistence/PostgresDeviceRepository';
import { PostgresTransactionRepository } from '../../src/adapters/persistence/PostgresTransactionRepository';
import { device, transaction } from '../support/deviceFactory';
import { createTestDatabase, testDatabaseUrl } from '../support/testDatabase';






describe.runIf(testDatabaseUrl)('Postgres rules', () => {
  let database: { pool: pg.Pool; close(): Promise<void> };

  beforeAll(async () => {
    database = await createTestDatabase();
    await new PostgresDeviceRepository(database.pool).save(device('rules'));
    await new PostgresTransactionRepository(database.pool).append(
      transaction('txn_rules', 'dev_rules'),
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it('can run migrations twice', async () => {
    await expect(runMigrations(database.pool)).resolves.toBeUndefined();
  });

  it('refuses to change a recorded transaction', async () => {
    await expect(
      database.pool.query(`UPDATE transaction_events SET amount_usd_minor = 1`),
    ).rejects.toThrow('append-only');
  });

  it('refuses to delete a recorded transaction', async () => {
    await expect(database.pool.query('DELETE FROM transaction_events')).rejects.toThrow(
      'append-only',
    );
  });

  it('reports that the database is reachable', async () => {
    expect(await isDatabaseReachable(database.pool)).toBe(true);
  });
});