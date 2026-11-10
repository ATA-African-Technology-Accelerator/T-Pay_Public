import { describe, expect, it } from 'vitest';
import { Money } from '@tpay/shared/shared/domain/Money';
import { convertNgnToUsd } from '@tpay/shared/domain/convertNgnToUsd';



const naira = (minor: number) => Money.fromMinor(minor, 'NGN').getValue();


describe('convertNgnToUsd', () => {
  it('converts kobo to rounded US cents', () => {
    expect(convertNgnToUsd(naira(1_000_000), '1500.00').getValue().minor).toBe(667);
    expect(convertNgnToUsd(naira(200_000), '1500.00').getValue().minor).toBe(133);
  });

  it('returns a US dollar amount', () => {
    expect(convertNgnToUsd(naira(150_000), '1500.00').getValue().currency).toBe('USD');
  });

  it('rejects an amount that is not in naira', () => {
    const dollars = Money.fromMinor(100, 'USD').getValue();

    expect(convertNgnToUsd(dollars, '1500.00').isFailure).toBe(true);
  });

  it.each(['', '0', '0.00', '-1500.00', '1500', '1500.5', 'abc'])('rejects the rate %j', (rate) => {
    expect(convertNgnToUsd(naira(100), rate).isFailure).toBe(true);
  });
});