// Money boundaries: the dollar minimum, rounding at the edges, and rates that should be refused.
import { describe, expect, it } from 'vitest';
import { convertNgnToUsd, convertUsdToNgn } from '@tpay/shared/domain/convertNgnToUsd';
import { Money } from '@tpay/shared/shared/domain/Money';

const kobo = (n: number) => Money.fromMinor(n, 'NGN').getValue();
const cents = (n: number) => Money.fromMinor(n, 'USD').getValue();

describe('naira to dollars at 1500.00', () => {
  it.each([
    [150_000, 100], // N1,500 is exactly $1.00
    [149_999, 100], // one kobo short rounds to the same cent
    [149_250, 100], // 99.5 cents rounds up
    [149_249, 99],
    [1, 0], // a kobo is worth no cents
    [75_000, 50],
    [1_000_000_000, 666_667], // N10,000,000
  ])('%i kobo is %i cents', (amount, expected) => {
    expect(convertNgnToUsd(kobo(amount), '1500.00').getValue().minor).toBe(expected);
  });

  it.each(['1500', '1500.0', '1,500.00', ' 1500.00', '1500.000', 'abc', '', '-1500.00', '0.00', '.50'])('refuses the rate %j', (rate) => {
    expect(convertNgnToUsd(kobo(100_000), rate).isFailure).toBe(true);
  });

  it('is never off by more than half a cent', () => {
    for (let amount = 1; amount < 400_000; amount += 997) {
      const usd = convertNgnToUsd(kobo(amount), '1500.00').getValue();
      const back = convertUsdToNgn(usd, '1500.00').getValue().minor;
      expect(Math.abs(back - amount)).toBeLessThanOrEqual(750);
    }
  });

  it('is stable: converting what the cents are worth gives the same cents', () => {
    for (let amount = 1; amount < 400_000; amount += 1013) {
      const usd = convertNgnToUsd(kobo(amount), '1500.00').getValue();
      const worth = convertUsdToNgn(usd, '1500.00').getValue();
      expect(convertNgnToUsd(worth, '1500.00').getValue().minor).toBe(usd.minor);
    }
  });

  it('works at other rates', () => {
    expect(convertNgnToUsd(kobo(160_000), '1600.00').getValue().minor).toBe(100);
    expect(convertNgnToUsd(kobo(100_000), '1234.56').getValue().minor).toBe(81);
  });
});

describe('Money', () => {
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('refuses %s minor units', (value) => {
    expect(Money.fromMinor(value, 'NGN').isFailure).toBe(true);
  });

  it('refuses mixing currencies', () => {
    expect(convertNgnToUsd(cents(100), '1500.00').isFailure).toBe(true);
    expect(convertUsdToNgn(kobo(100), '1500.00').isFailure).toBe(true);
  });
});
