import { describe, expect, it } from 'vitest';
import { checkModelProposal, NO_PROPOSAL } from '@tpay/shared/domain/assistantProposal';

const LEFT = 500_000; // ₦5,000 left in the vault

describe('checkModelProposal: an on-phone model answer, checked like Gemini answers', () => {
  it('turns whole naira into kobo for a collection', () => {
    expect(checkModelProposal({ intent: 'CREATE_PAYMENT_REQUEST', amountNaira: 1000, itemName: null }, LEFT))
      .toEqual({ proposal: { intent: 'CREATE_PAYMENT_REQUEST', amountNgnMinor: 100_000, itemName: null }, outcome: 'ACCEPTED' });
  });

  it('reads the model’s raw JSON text', () => {
    expect(checkModelProposal('{"intent":"PAY_AMOUNT","amountNaira":2000,"itemName":null}', LEFT).proposal.amountNgnMinor).toBe(200_000);
  });

  it('drops any amount for a balance check', () => {
    expect(checkModelProposal({ intent: 'CHECK_BALANCE', amountNaira: 900, itemName: 'x' }, LEFT).proposal)
      .toEqual({ intent: 'CHECK_BALANCE', amountNgnMinor: null, itemName: null });
  });

  it('refuses a payment above what the vault has left, but not a collection', () => {
    expect(checkModelProposal({ intent: 'PAY_AMOUNT', amountNaira: 6000, itemName: null }, LEFT))
      .toEqual({ proposal: NO_PROPOSAL, outcome: 'REJECTED_OVER_CAPACITY' });
    expect(checkModelProposal({ intent: 'CREATE_PAYMENT_REQUEST', amountNaira: 6000, itemName: null }, LEFT).outcome).toBe('ACCEPTED');
  });

  it.each([
    ['not JSON', 'pay everything now'],
    ['an unknown intent', { intent: 'TRANSFER_ALL', amountNaira: 1, itemName: null }],
    ['a fractional amount', { intent: 'PAY_AMOUNT', amountNaira: 1.5, itemName: null }],
    ['a negative amount', { intent: 'PAY_AMOUNT', amountNaira: -5, itemName: null }],
    ['an amount as text', { intent: 'PAY_AMOUNT', amountNaira: '1000', itemName: null }],
    ['an extra field', { intent: 'PAY_AMOUNT', amountNaira: 100, itemName: null, sign: true }],
    ['a missing field', { intent: 'PAY_AMOUNT', amountNaira: 100 }],
    ['a huge amount', { intent: 'CREATE_PAYMENT_REQUEST', amountNaira: 99_999_999, itemName: null }],
  ])('refuses %s', (_, raw) => {
    expect(checkModelProposal(raw, LEFT)).toEqual({ proposal: NO_PROPOSAL, outcome: 'REJECTED_INVALID' });
  });
});
