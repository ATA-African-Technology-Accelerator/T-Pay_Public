/// <reference types="jest" />
import { spentThisMonth } from '../spent';
import type { Entry } from '../../../state/appState';

const entry = (over: Partial<Entry>): Entry => ({ id: 'x', who: 'Shop', amount: 100_00, dir: 'out', status: 'paid', at: '2026-11-10T10:00:00Z', ref: 'r', ...over });

describe('spentThisMonth edges', () => {
  it('counts the first and last moment of the month, not the neighbours', () => {
    const now = new Date(2026, 10, 15, 12, 0, 0);
    const rows = [
      entry({ at: new Date(2026, 10, 1, 0, 0, 0).toISOString(), amount: 1 }),
      entry({ at: new Date(2026, 10, 30, 23, 59, 59).toISOString(), amount: 10 }),
      entry({ at: new Date(2026, 9, 31, 23, 59, 59).toISOString(), amount: 100 }),
      entry({ at: new Date(2026, 11, 1, 0, 0, 0).toISOString(), amount: 1000 }),
    ];
    expect(spentThisMonth(rows, now)).toBe(11);
  });

  it('is not fooled by the same month in another year', () => {
    expect(spentThisMonth([entry({ at: '2025-11-10T10:00:00Z' })], new Date('2026-11-20T12:00:00Z'))).toBe(0);
  });

  it('skips an entry with a broken date instead of counting it or crashing', () => {
    expect(spentThisMonth([entry({ at: 'not a date' }), entry({ at: '' })], new Date('2026-11-20T12:00:00Z'))).toBe(0);
  });

  it('counts pending and queued payments, which have already left the vault', () => {
    expect(spentThisMonth([entry({ status: 'pending' }), entry({ status: 'sent' })], new Date('2026-11-20T12:00:00Z'))).toBe(200_00);
  });

  it('does not count refused payments, which never moved money', () => {
    expect(spentThisMonth([entry({ status: 'refused' })], new Date('2026-11-20T12:00:00Z'))).toBe(0);
  });

  it('copes with an empty history and with a large one', () => {
    expect(spentThisMonth([], new Date())).toBe(0);
    const many = Array.from({ length: 20_000 }, () => entry({}));
    expect(spentThisMonth(many, new Date('2026-11-20T12:00:00Z'))).toBe(20_000 * 100_00);
  });
});
