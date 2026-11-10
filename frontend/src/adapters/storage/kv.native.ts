// The phone's own database (NFR-01): payments survive a kill, a restart and days offline.
import * as SQLite from 'expo-sqlite';
import type { Kv, Table, Write } from './kvCore';

export type { Kv } from './kvCore';

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS rows (
    tbl TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (tbl, key)
  );
`;

class SqliteKv implements Kv {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async get<T>(table: Table, key: string): Promise<T | null> {
    const row = await this.db.getFirstAsync<{ value: string }>('SELECT value FROM rows WHERE tbl = ? AND key = ?', table, key);
    return row ? (JSON.parse(row.value) as T) : null;
  }

  async all<T>(table: Table): Promise<T[]> {
    const rows = await this.db.getAllAsync<{ value: string }>('SELECT value FROM rows WHERE tbl = ?', table);
    return rows.map(r => JSON.parse(r.value) as T);
  }

  async batch(writes: Write[]): Promise<void> {
    const rows = writes.map(w => ({ ...w, raw: w.value === null ? null : JSON.stringify(w.value) }));
    // Exclusive, so a payment's voucher and the sequence it used commit as one.
    await this.db.withExclusiveTransactionAsync(async txn => {
      for (const { table, key, raw } of rows) {
        if (raw === null) await txn.runAsync('DELETE FROM rows WHERE tbl = ? AND key = ?', table, key);
        else await txn.runAsync('INSERT OR REPLACE INTO rows (tbl, key, value) VALUES (?, ?, ?)', table, key, raw);
      }
    });
  }

  async clear(): Promise<void> {
    await this.db.runAsync('DELETE FROM rows');
  }
}

export async function openKv(): Promise<Kv> {
  const db = await SQLite.openDatabaseAsync('tpay.db');
  await db.execAsync(SCHEMA);
  return new SqliteKv(db);
}
