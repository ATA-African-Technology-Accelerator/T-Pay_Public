import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { runMigrations } from '../../src/adapters/persistence/migrations';






export const testDatabaseUrl = process.env.TEST_DATABASE_URL;


export async function createTestDatabase() {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: testDatabaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);

  const pool = new pg.Pool({
    connectionString: testDatabaseUrl,
    options: `-c search_path=${schema}`,
  });
  await runMigrations(pool);

  const close = async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  };

  return { pool, close };
}