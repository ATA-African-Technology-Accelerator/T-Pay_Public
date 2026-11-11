import { describe, expect, it } from 'vitest';
import { Money } from '@tpay/shared/shared/domain/Money';
import { convertNgnToUsd, convertUsdToNgn } from '@tpay/shared/domain/convertNgnToUsd';



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


describe('convertUsdToNgn', () => {
  const usd = (cents: number) => Money.fromMinor(cents, 'USD').getValue();

  it('turns cents back into kobo at the same rate', () => {
    expect(convertUsdToNgn(usd(667), '1500.00').getValue().minor).toBe(1_000_500);
    expect(convertUsdToNgn(usd(100), '1500.00').getValue().minor).toBe(150_000);
    expect(convertUsdToNgn(usd(0), '1500.00').getValue().minor).toBe(0);
  });

  it('shows what a naira amount really is once PayPal has rounded it to cents', () => {
    const cents = convertNgnToUsd(naira(500_000), '1500.00').getValue();

    expect(cents.minor).toBe(333);
    expect(convertUsdToNgn(cents, '1500.00').getValue().minor).toBe(499_500);
  });

  it.each(['1500', 'abc', '0.00', '-1.00'])('refuses the rate %j', (rate) => {
    expect(convertUsdToNgn(usd(100), rate).isFailure).toBe(true);
  });

  it('refuses an amount that is not in dollars', () => {
    expect(convertUsdToNgn(naira(100), '1500.00').isFailure).toBe(true);
  });
});
