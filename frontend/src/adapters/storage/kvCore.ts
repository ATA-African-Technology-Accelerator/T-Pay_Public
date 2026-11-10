// The storage underneath the local repositories: rows of JSON in named tables, with
// writes that land together or not at all. SQLite on the phone; memory in tests and
// the web preview.

export type Table = 'vaults' | 'vouchers' | 'seen' | 'meta';
export type Write = { table: Table; key: string; value: unknown | null };

export interface Kv {
  get<T>(table: Table, key: string): Promise<T | null>;
  all<T>(table: Table): Promise<T[]>;
  /** Every write lands, or none do. A null value deletes the row. */
  batch(writes: Write[]): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryKv implements Kv {
  private readonly tables = new Map<Table, Map<string, string>>();

  constructor(private readonly persist?: (snapshot: string) => void, snapshot?: string | null) {
    if (!snapshot) return;
    try {
      const parsed = JSON.parse(snapshot) as Record<Table, Record<string, string>>;
      for (const [table, rows] of Object.entries(parsed)) this.tables.set(table as Table, new Map(Object.entries(rows)));
    } catch { /* a damaged snapshot starts empty */ }
  }

  async get<T>(table: Table, key: string): Promise<T | null> {
    const raw = this.tables.get(table)?.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }

  async all<T>(table: Table): Promise<T[]> {
    return [...(this.tables.get(table)?.values() ?? [])].map(raw => JSON.parse(raw) as T);
  }

  async batch(writes: Write[]): Promise<void> {
    // Serialise everything first, so a value that can't be stored changes nothing.
    const rows = writes.map(w => ({ ...w, raw: w.value === null ? null : JSON.stringify(w.value) }));
    for (const { table, key, raw } of rows) {
      const rowsOf = this.tables.get(table) ?? new Map<string, string>();
      if (raw === null) rowsOf.delete(key); else rowsOf.set(key, raw);
      this.tables.set(table, rowsOf);
    }
    this.save();
  }

  async clear(): Promise<void> {
    this.tables.clear();
    this.save();
  }

  private save() {
    if (!this.persist) return;
    const out: Record<string, Record<string, string>> = {};
    for (const [table, rows] of this.tables) out[table] = Object.fromEntries(rows);
    this.persist(JSON.stringify(out));
  }
}
