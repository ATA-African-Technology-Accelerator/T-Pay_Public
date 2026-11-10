import 'dotenv/config';
import { createPool } from '../src/adapters/persistence/database';
import { runMigrations } from '../src/adapters/persistence/migrations';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = createPool(connectionString);
await runMigrations(pool);
await pool.end();
console.log('Database is up to date');