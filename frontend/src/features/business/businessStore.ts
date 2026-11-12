// A business's stock list and monthly budget. They live on the phone only: the server holds
// money, not a shop's shelves, so these never leave the device and work with no network.
import { useEffect, useState } from 'react';
import { random, store } from '../../composition';

export interface StockItem { id: string; name: string; quantity: number }

const STOCK = 'biz.stock';
const BUDGET = 'biz.budget';
const SALES = 'biz.sales';
export const MAX_ITEMS = 200;
export const MAX_QUANTITY = 100_000;
/** At or below this many left, an item is shown as running low. */
export const LOW_STOCK = 3;

// Every change reads the shelf, edits it and writes it back. Two quick taps would otherwise both
// read the same shelf and one would be lost, so changes wait their turn.
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

export const stockStore = {
  load: async (): Promise<StockItem[]> => (await store.getMeta<StockItem[]>(STOCK)) ?? [],
  save: (items: StockItem[]) => store.setMeta(STOCK, items),
  add: (name: string, quantity: number): Promise<void> => inTurn(async () => {
    const items = await stockStore.load();
    if (items.length >= MAX_ITEMS) return;
    const clean = name.trim().slice(0, 60);
    const existing = items.find(i => i.name.toLowerCase() === clean.toLowerCase());
    if (existing) existing.quantity = Math.min(existing.quantity + quantity, MAX_QUANTITY);
    else items.push({ id: random.uuid(), name: clean, quantity: Math.min(quantity, MAX_QUANTITY) });
    await stockStore.save(items);
  }),
  change: (id: string, by: number): Promise<void> => inTurn(async () => {
    const items = await stockStore.load();
    await stockStore.save(items.map(i => (i.id === id ? { ...i, quantity: Math.max(0, Math.min(i.quantity + by, MAX_QUANTITY)) } : i)));
  }),
  remove: (id: string): Promise<void> => inTurn(async () => stockStore.save((await stockStore.load()).filter(i => i.id !== id))),
};

/** The item on the shelf a spoken or typed name means: the same name, or one that contains the other. */
export function findItem(items: StockItem[], name: string): StockItem | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  return items.find(i => i.name.toLowerCase() === want)
    ?? items.find(i => i.name.toLowerCase().includes(want) || want.includes(i.name.toLowerCase()))
    ?? null;
}

export interface Sale { item: string | null; amountNgnMinor: number | null; at: string }
const MAX_SALES = 500;

/** Sales recorded by voice or typing, kept on the phone for the day's total. */
export const salesStore = {
  list: async (): Promise<Sale[]> => (await store.getMeta<Sale[]>(SALES)) ?? [],
  /** Records one sale and takes one off the shelf when the item is known. Returns the item, with what is left. */
  record: (item: string | null, amountNgnMinor: number | null, at: Date): Promise<StockItem | null> => inTurn(async () => {
    const sales = await salesStore.list();
    await store.setMeta(SALES, [...sales, { item, amountNgnMinor, at: at.toISOString() }].slice(-MAX_SALES));
    if (!item) return null;
    const items = await stockStore.load();
    const found = findItem(items, item);
    if (!found) return null;
    const left = Math.max(0, found.quantity - 1);
    await stockStore.save(items.map(i => (i.id === found.id ? { ...i, quantity: left } : i)));
    return { ...found, quantity: left };
  }),
};

/** Today's sales, by the phone's own day. */
export function salesToday(sales: Sale[], now: Date): { count: number; totalNgnMinor: number } {
  const today = sales.filter(s => {
    const at = new Date(s.at);
    return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  });
  return { count: today.length, totalNgnMinor: today.reduce((sum, s) => sum + (s.amountNgnMinor ?? 0), 0) };
}

/** The most a business plans to spend in a month, in kobo. Null until it sets one. */
export const budgetStore = {
  load: async (): Promise<number | null> => (await store.getMeta<number>(BUDGET)) ?? null,
  save: (kobo: number | null) => store.setMeta(BUDGET, kobo),
};

/** Re-reads whenever the phone's database changes, like the rest of the app's state. */
function useStored<T>(read: () => Promise<T>, empty: T): T {
  const [value, setValue] = useState<T>(empty);
  useEffect(() => {
    let alive = true;
    const load = () => { void read().then(v => { if (alive) setValue(v); }).catch(() => undefined); };
    load();
    const off = store.onChange(load);
    return () => { alive = false; off(); };
  }, []);
  return value;
}

export const useStock = () => useStored(stockStore.load, [] as StockItem[]);
export const useBudget = () => useStored(budgetStore.load, null as number | null);
export const useSales = () => useStored(salesStore.list, [] as Sale[]);
