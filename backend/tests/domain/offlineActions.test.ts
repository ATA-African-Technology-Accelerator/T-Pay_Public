import { describe, expect, it } from 'vitest';
import { parseOfflineIntent } from '@tpay/shared/domain/offlineIntent';

// Everything a person can do with their hands can be asked for by voice, offline too.
describe('offline rules: the app\'s other actions', () => {
  it.each([
    ['withdraw 5000', 'WITHDRAW', 500_000],
    ['send 2000 to my paypal', 'WITHDRAW', 200_000],
    ['cash out', 'WITHDRAW', null],
    ['add money', 'ADD_MONEY', null],
    ['top up my wallet with 10k', 'ADD_MONEY', 1_000_000],
    ['lock 3000', 'LOCK_MONEY', 300_000],
    ['add 2000 to my vault', 'LOCK_MONEY', 200_000],
    ['fund the vault', 'LOCK_MONEY', null],
    ['unlock my money', 'UNLOCK_MONEY', null],
    ['close the vault', 'UNLOCK_MONEY', null],
    ['share my pay link', 'SHARE_PAY_LINK', null],
    ['set my budget to 50000', 'SET_BUDGET', 5_000_000],
    ['what is my budget', 'CHECK_BUDGET', null],
    ['collect 1k', 'CREATE_PAYMENT_REQUEST', 100_000],
    ['pay 2000', 'PAY_AMOUNT', 200_000],
  ])('"%s" is %s', (said, intent, amount) => {
    expect(parseOfflineIntent(said, 'en')).toMatchObject({ intent, amountNgnMinor: amount });
  });

  it('reads what came into stock and how many', () => {
    expect(parseOfflineIntent('add 10 coke to stock', 'en')).toMatchObject({ intent: 'ADD_STOCK', itemName: 'coke', quantity: 10, amountNgnMinor: null });
    expect(parseOfflineIntent('I bought 5 bags of rice', 'en')).toMatchObject({ intent: 'ADD_STOCK', itemName: 'bags of rice', quantity: 5 });
    expect(parseOfflineIntent('restock milo twenty', 'en')).toMatchObject({ intent: 'ADD_STOCK', itemName: 'milo', quantity: 20 });
  });

  it('answers how many are left, never as a help question', () => {
    expect(parseOfflineIntent('how many coke do I have', 'en')).toMatchObject({ intent: 'CHECK_STOCK', itemName: 'coke' });
    expect(parseOfflineIntent('how much rice is left in stock', 'en')).toMatchObject({ intent: 'CHECK_STOCK', itemName: 'rice' });
    expect(parseOfflineIntent('check my stock', 'en')).toMatchObject({ intent: 'CHECK_STOCK', itemName: null });
  });

  it.each([
    ['open my activity', 'ACTIVITY'],
    ['show me my transactions', 'ACTIVITY'],
    ['go to settings', 'SETTINGS'],
    ['open the vault', 'VAULT'],
    ['take me home', 'HOME'],
    ['show my wallet', 'WALLET'],
  ])('"%s" opens %s', (said, screen) => {
    expect(parseOfflineIntent(said, 'en')).toMatchObject({ intent: 'OPEN_SCREEN', screen });
  });

  it('reads "show my balance" as a balance, not a screen', () => {
    expect(parseOfflineIntent('show my balance', 'en').intent).toBe('CHECK_BALANCE');
  });

  it('still answers questions about these as help', () => {
    expect(parseOfflineIntent('how do I withdraw', 'en')).toMatchObject({ intent: 'HELP', helpTopic: 'WITHDRAW' });
  });

  it('never acts on a negated request', () => {
    expect(parseOfflineIntent("don't withdraw", 'en').intent).toBe('UNKNOWN');
  });

  it('understands Pidgin', () => {
    expect(parseOfflineIntent('comot my money 2000', 'pcm')).toMatchObject({ intent: 'WITHDRAW', amountNgnMinor: 200_000 });
    expect(parseOfflineIntent('carry me go my activity', 'pcm')).toMatchObject({ intent: 'OPEN_SCREEN', screen: 'ACTIVITY' });
  });
});
