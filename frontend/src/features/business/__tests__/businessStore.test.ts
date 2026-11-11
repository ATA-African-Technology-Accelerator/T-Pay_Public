/// <reference types="jest" />
// A shop's shelves live on the phone only. These are the ways a shelf can go wrong:
// counts below zero, duplicates, runaway numbers, and losing items between sessions.
import { MemoryKv } from '../../../adapters/storage/kvCore';
import { LocalStore } from '../../../adapters/storage/localStore';

const mockStore = new LocalStore(Promise.resolve(new MemoryKv()));
let mockId = 0;
jest.mock('../../../composition', () => ({ store: mockStore, random: { uuid: () => `item-${++mockId}` } }));
jest.mock('react', () => ({ useEffect: () => undefined, useState: (v: unknown) => [v, () => undefined] }));

const { stockStore, budgetStore, MAX_ITEMS, MAX_QUANTITY } = require('../businessStore') as typeof import('../businessStore');

describe('stock', () => {
  beforeEach(async () => { await stockStore.save([]); });

  it('adds an item and lists it', async () => {
    await stockStore.add('Coke', 12);
    expect(await stockStore.load()).toEqual([{ id: expect.any(String), name: 'Coke', quantity: 12 }]);
  });

  it('adds to an item that is already there, whatever the capitals or spaces', async () => {
    await stockStore.add('Coke', 12);
    await stockStore.add('  coke ', 3);
    const items = await stockStore.load();
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(15);
  });

  it('never goes below zero', async () => {
    await stockStore.add('Bread', 1);
    const [item] = await stockStore.load();
    await stockStore.change((item as { id: string }).id, -1);
    await stockStore.change((item as { id: string }).id, -1);
    await stockStore.change((item as { id: string }).id, -50);
    expect((await stockStore.load())[0]?.quantity).toBe(0);
  });

  it('never goes above the limit', async () => {
    await stockStore.add('Sand', MAX_QUANTITY);
    await stockStore.add('Sand', 500);
    expect((await stockStore.load())[0]?.quantity).toBe(MAX_QUANTITY);
  });

  it('ignores a change to an item that is gone', async () => {
    await stockStore.add('Bread', 2);
    await stockStore.change('nope', 5);
    expect((await stockStore.load())[0]?.quantity).toBe(2);
  });

  it('removes one item and keeps the rest', async () => {
    await stockStore.add('A', 1); await stockStore.add('B', 1);
    const [a] = await stockStore.load();
    await stockStore.remove((a as { id: string }).id);
    expect((await stockStore.load()).map(i => i.name)).toEqual(['B']);
  });

  it('stops at the item limit', async () => {
    for (let i = 0; i < MAX_ITEMS + 5; i += 1) await stockStore.add(`item ${i}`, 1);
    expect(await stockStore.load()).toHaveLength(MAX_ITEMS);
  });

  it('keeps a very long or odd name as plain text, cut to a sensible length', async () => {
    await stockStore.add(`<b>${'x'.repeat(500)}</b>`, 1);
    const [item] = await stockStore.load();
    expect((item as { name: string }).name.length).toBeLessThanOrEqual(60);
  });

  it('survives two quick changes without losing one', async () => {
    await stockStore.add('Race', 10);
    const [item] = await stockStore.load();
    const id = (item as { id: string }).id;
    await Promise.all([stockStore.change(id, -1), stockStore.change(id, -1), stockStore.change(id, -1)]);
    expect((await stockStore.load())[0]?.quantity).toBe(7);
  });
});

describe('budget', () => {
  it('starts empty, saves, and clears', async () => {
    expect(await budgetStore.load()).toBeNull();
    await budgetStore.save(500_000);
    expect(await budgetStore.load()).toBe(500_000);
    await budgetStore.save(null);
    expect(await budgetStore.load()).toBeNull();
  });
});
