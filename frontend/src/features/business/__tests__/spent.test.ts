import { spentThisMonth } from '../spent';
import type { Entry } from '../../../state/appState';

const entry = (over: Partial<Entry>): Entry => ({ id: 'x', who: 'Shop', amount: 100_00, dir: 'out', status: 'paid', at: '2026-11-10T10:00:00Z', ref: 'r', ...over });
const now = new Date('2026-11-20T12:00:00Z');

describe('spentThisMonth', () => {
  it('adds this month\'s payments out', () => {
    expect(spentThisMonth([entry({}), entry({ amount: 50_00 })], now)).toBe(150_00);
  });

  it('ignores money in, refused payments and other months', () => {
    const rows = [entry({ dir: 'in' }), entry({ status: 'refused' }), entry({ at: '2026-10-28T10:00:00Z' }), entry({ dir: 'withdraw' })];
    expect(spentThisMonth(rows, now)).toBe(0);
  });
});
