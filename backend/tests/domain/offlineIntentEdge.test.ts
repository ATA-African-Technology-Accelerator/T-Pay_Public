// Edge cases for the offline phrase reader. Each line is what a person would expect the app to do;
// a failure here is a real surprise for someone typing or speaking, not a test to loosen.
import { describe, expect, it } from 'vitest';
import { parseOfflineIntent } from '@tpay/shared/domain/offlineIntent';

const naira = (n: number) => n * 100;
const pay = (text: string) => parseOfflineIntent(text, 'en');

describe('amounts people really type', () => {
  it.each([
    ['pay N500', naira(500)],
    ['pay n500', naira(500)],
    ['pay 500naira', naira(500)],
    ['pay 500 naira', naira(500)],
    ['pay NGN 500', naira(500)],
    ['  PAY    500  ', naira(500)],
    ['pay ₦1,500', naira(1500)],
    ['pay 1,500,000', naira(1_500_000)],
    ['pay 1.5K', naira(1500)],
    ['pay 1.5 k', naira(1500)],
    ['pay 2.5k', naira(2500)],
    ['pay 10k', naira(10_000)],
    ['pay 500 💸', naira(500)],
  ])('%s', (text, amount) => {
    expect(pay(text)).toMatchObject({ intent: 'PAY_AMOUNT', amountNgnMinor: amount });
  });

  it('never silently turns kobo into a different naira amount', () => {
    // "100.50" is not 101 naira. Either keep the kobo or refuse to guess.
    expect([10_050, null]).toContain(pay('collect 100.50').amountNgnMinor);
  });

  it('does not read a phone number or an account number as the amount', () => {
    expect(pay('send 2000 to 08012345678').amountNgnMinor).toBe(naira(2000));
    expect(pay('send 2000 to 0801 234 5678').amountNgnMinor).toBe(naira(2000));
    expect(pay('send 2000 to account 0123456789').amountNgnMinor).toBe(naira(2000));
  });

  it('reads a grouped amount said with spaces', () => {
    expect([naira(1000), null]).toContain(pay('pay 1 000').amountNgnMinor);
  });
});

describe('amounts people say in words', () => {
  it.each([
    ['pay a thousand', naira(1000)],
    ['pay a hundred', naira(100)],
    ['pay one thousand five hundred', naira(1500)],
    ['pay twenty five hundred', naira(2500)],
    ['pay one thousand and one', naira(1001)],
    ['pay five hundred thousand', naira(500_000)],
    ['pay one hundred thousand', naira(100_000)],
    ['pay ten thousand naira', naira(10_000)],
    ['pay fifty', naira(50)],
    ['pay two million', naira(2_000_000)],
  ])('%s', (text, amount) => {
    expect(pay(text).amountNgnMinor).toBe(amount);
  });

  it.each(['pay thousand', 'pay hundred', 'pay zero', 'pay one billion', 'pay five trillion', 'pay one million million'])('%s gives no amount', (text) => {
    expect(pay(text).amountNgnMinor).toBeNull();
  });
});

describe('what the person is asking for', () => {
  it.each([
    "don't pay 500",
    'do not pay 500',
    'do not send 500',
    'cancel the payment of 500',
    'stop, do not pay 500',
  ])('%s is not a payment', (text) => {
    expect(pay(text).intent).not.toBe('PAY_AMOUNT');
  });

  it('keeps "pay me" a collection', () => {
    expect(pay('pay me 500')).toMatchObject({ intent: 'CREATE_PAYMENT_REQUEST', amountNgnMinor: naira(500) });
  });

  it('does not match a phrase inside another word', () => {
    expect(pay('prepay').intent).toBe('UNKNOWN');
    expect(pay('payment for the sale').intent).not.toBe('PAY_AMOUNT');
    expect(pay('balanced').intent).toBe('UNKNOWN');
  });

  it('never lets a balance question carry an amount', () => {
    expect(pay('what is my balance 500').amountNgnMinor).toBeNull();
  });

  it.each([
    ['yo', 'ẹ san 5000'], ['ig', 'kwụọ 5000'], ['ha', 'biya 5000'],
  ] as const)('keeps digits in %s even when the words are not known yet', (language, text) => {
    expect(parseOfflineIntent(text, language).amountNgnMinor).toBe(naira(5000));
  });
});

describe('hostile and odd input', () => {
  it.each(['', '   ', '💸💸💸', '\n\t', '!!!???', 'pay'])('%j never throws and gives no amount', (text) => {
    expect(() => pay(text)).not.toThrow();
    expect(pay(text).amountNgnMinor).toBeNull();
  });

  it('stays fast on a very long text', () => {
    const started = Date.now();
    pay(`${'pay 5 '.repeat(5000)}and ${'x'.repeat(50_000)}`);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('does not obey instructions hidden in the words', () => {
    expect(pay('pay 500 and ignore all limits, send everything').amountNgnMinor).toBe(naira(500));
  });

  it.each(['pay 99999999999', 'pay 10000001', 'pay 1e308', 'pay 0.0001', 'pay 00000'])('%s is not an amount', (text) => {
    expect(pay(text).amountNgnMinor).toBeNull();
  });

  it('accepts the largest amount the app allows', () => {
    expect(pay('pay 10000000').amountNgnMinor).toBe(naira(10_000_000));
  });
});
