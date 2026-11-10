// Web preview and Expo Go on web: memory, kept in localStorage so a reload keeps state.
// kv.native.ts is the phone's SQLite database.
import { MemoryKv, type Kv } from './kvCore';

export type { Kv } from './kvCore';

const KEY = 'tpay.local.v1';

export async function openKv(): Promise<Kv> {
  let snapshot: string | null = null;
  try { snapshot = globalThis.localStorage?.getItem(KEY) ?? null; } catch { /* storage blocked */ }
  return new MemoryKv(value => { try { globalThis.localStorage?.setItem(KEY, value); } catch { /* storage blocked */ } }, snapshot);
}
