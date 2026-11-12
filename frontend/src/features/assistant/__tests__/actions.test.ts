/// <reference types="jest" />
// Asked by voice: money-moving requests are asked first and open their own screen (where the PIN,
// fingerprint or PayPal sign-in is still needed); everything else is done at once.
jest.mock('../../../components/ui', () => ({
  money: (kobo: number) => `₦${(kobo / 100).toLocaleString('en-US')}`,
  when: (iso: string) => iso.slice(0, 10),
}));
const shelf: { id: string; name: string; quantity: number }[] = [];
jest.mock('../../business/businessStore', () => ({
  LOW_STOCK: 3, MAX_QUANTITY: 100_000,
  stockStore: {
    load: async () => shelf.map(i => ({ ...i })),
    add: async (name: string, quantity: number) => {
      const found = shelf.find(i => i.name.toLowerCase() === name.toLowerCase());
      if (found) found.quantity += quantity; else shelf.push({ id: String(shelf.length), name, quantity });
    },
  },
  budgetStore: { load: async () => null, save: async () => undefined },
}));
jest.mock('../../../composition', () => ({ api: {} }));
jest.mock('../../../session/guard', () => ({ withSession: jest.fn() }));
jest.mock('react-native', () => ({ Share: { share: jest.fn() } }));
import { askFirst, doNow, findItem, isDone, type ActionState } from '../actions';
import type { Proposal } from '../assistant';

const base: ActionState = { vaultOpen: false, canSpend: false, leftNgn: 0, spendBy: null, walletKnown: true, walletNgn: 1_000_000, online: true, name: 'Ada', history: [] };
const asked = (intent: Proposal['intent'], amountNgnMinor: number | null, extra: Partial<Proposal> = {}): Proposal =>
  ({ intent, amountNgnMinor, transcript: '', spokenReply: null, offline: false, onDevice: false, overCapacity: false, ...extra });

describe('voice actions', () => {
  it('opens the withdraw screen hands free, never sending by itself', () => {
    expect(askFirst(asked('WITHDRAW', 500_000), base)).toEqual({ ask: expect.stringMatching(/₦5,000.*PayPal/), to: { name: 'withdraw', prefill: 500_000, handsFree: true } });
  });

  it('says why when the wallet can\'t cover a withdrawal, or there is no network', () => {
    expect(askFirst(asked('WITHDRAW', 5_000_000), base)).toEqual({ say: expect.stringMatching(/₦10,000/) });
    expect(askFirst(asked('WITHDRAW', 500_000), { ...base, walletNgn: 0 })).toEqual({ say: expect.stringMatching(/empty/) });
    expect(askFirst(asked('ADD_MONEY', 500_000), { ...base, online: false })).toEqual({ say: expect.stringMatching(/internet/) });
  });

  it('locks only when no vault is open, and unlocks only when one is', () => {
    expect(askFirst(asked('LOCK_MONEY', 200_000), base)).toMatchObject({ to: { name: 'vaultReview', amount: 200_000, handsFree: true } });
    expect(askFirst(asked('LOCK_MONEY', 200_000), { ...base, vaultOpen: true, leftNgn: 100_000 })).toHaveProperty('say');
    expect(askFirst(asked('UNLOCK_MONEY', null), base)).toHaveProperty('say');
    expect(askFirst(asked('UNLOCK_MONEY', null), { ...base, vaultOpen: true })).toMatchObject({ to: { name: 'melt', handsFree: true } });
  });

  it('asks for a missing amount instead of guessing one', () => {
    expect(askFirst(asked('ADD_MONEY', null), base)).toBeNull();
    expect(askFirst(asked('WITHDRAW', null), base)).toBeNull();
  });

  it('puts stock on the shelf at once and says the new total', async () => {
    shelf.splice(0, shelf.length, { id: '0', name: 'Coke', quantity: 4 });
    const done = await doNow(asked('ADD_STOCK', null, { itemName: 'cokes', quantity: 10 }), base);
    expect(done?.say).toMatch(/Added 10 Coke\. You now have 14/);
    expect((await doNow(asked('CHECK_STOCK', null, { itemName: 'coke' }), base))?.say).toMatch(/14 Coke left/);
  });

  it('opens a screen by name', async () => {
    expect(await doNow(asked('OPEN_SCREEN', null, { screen: 'ACTIVITY' }), base)).toEqual({ say: expect.stringMatching(/^Opening/), to: { name: 'activity' } });
  });

  it('matches shelf items loosely', () => {
    expect(findItem([{ id: '1', name: 'Bags of rice', quantity: 2 }], 'bags of rice')?.id).toBe('1');
    expect(findItem([{ id: '1', name: 'Milo', quantity: 2 }], 'milos')?.id).toBe('1');
    expect(findItem([{ id: '1', name: 'Milo', quantity: 2 }], 'bread')).toBeNull();
  });

  it.each(["that's all", 'no thanks', 'bye', 'Thank you', 'okay that is all'])('ends the conversation on "%s"', said => {
    expect(isDone(said)).toBe(true);
  });

  it.each(['withdraw all', 'stop the payment to Musa', 'nothing to pay'])('keeps going on "%s"', said => {
    expect(isDone(said)).toBe(false);
  });
});
