import { describe, expect, it } from 'vitest';
import { parseOfflineIntent } from '@tpay/shared/domain/offlineIntent';

// A question about the app is answered, not acted on. Asked with an amount, it is a request.
describe('help questions', () => {
  const cases: [string, 'en' | 'pcm', string][] = [
    ['How do I pay?', 'en', 'PAY'],
    ["Why can't I see the send button", 'en', 'PAY'],
    ['Where is the pay button', 'en', 'PAY'],
    ['How do I get paid', 'en', 'GET_PAID'],
    ['How do I collect money from a customer', 'en', 'GET_PAID'],
    ['What is the offline vault', 'en', 'LOCK'],
    ['How do I add money to my vault', 'en', 'LOCK'],
    ['How do I send money to PayPal', 'en', 'WITHDRAW'],
    ['Is my money safe', 'en', 'SAFETY'],
    ['What can you do', 'en', 'WHAT_CAN_YOU_DO'],
    ['help', 'en', 'WHAT_CAN_YOU_DO'],
    ['Wetin be offline vault', 'pcm', 'LOCK'],
    ['How I go pay', 'pcm', 'PAY'],
    ['I no see where to send money', 'pcm', 'PAY'],
  ];
  it.each(cases)('%s', (text, language, topic) => {
    expect(parseOfflineIntent(text, language)).toEqual({ intent: 'HELP', amountNgnMinor: null, helpTopic: topic });
  });

  it('keeps requests as requests', () => {
    expect(parseOfflineIntent('pay 2000', 'en').intent).toBe('PAY_AMOUNT');
    expect(parseOfflineIntent('can I pay 500', 'en').intent).toBe('PAY_AMOUNT');
    expect(parseOfflineIntent('collect two thousand naira', 'en').intent).toBe('CREATE_PAYMENT_REQUEST');
    expect(parseOfflineIntent('how much do I have', 'en').intent).toBe('CHECK_BALANCE');
    expect(parseOfflineIntent('how much is in my vault', 'en').intent).not.toBe('HELP');
    expect(parseOfflineIntent('what is my balance', 'en').intent).toBe('CHECK_BALANCE');
    expect(parseOfflineIntent('I want to pay', 'en').intent).toBe('PAY_AMOUNT');
    expect(parseOfflineIntent("don't pay", 'en').intent).toBe('UNKNOWN');
  });
});
