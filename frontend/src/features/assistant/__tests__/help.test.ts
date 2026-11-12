/// <reference types="jest" />
// Each answer says what to do next, from what the phone knows, and offers to go there.
jest.mock('../../../components/ui', () => ({
  money: (kobo: number) => `₦${(kobo / 100).toLocaleString('en-US')}`,
  when: (iso: string) => iso.slice(0, 10),
}));
import { helpAnswer, payNeedsVault, type HelpState } from '../help';

const none: HelpState = { vaultOpen: false, canSpend: false, leftNgn: 0, spendBy: null, walletKnown: true, walletNgn: 500_000 };
const ready: HelpState = { ...none, vaultOpen: true, canSpend: true, leftNgn: 300_000, spendBy: '2026-11-20T10:00:00Z' };

describe('help answers', () => {
  it('with no vault, explains that paying needs locked money and offers to lock it', () => {
    const a = helpAnswer('PAY', none);
    expect(a.say).toMatch(/first lock money/);
    expect(a.say).toMatch(/5,000/);
    expect(a.action?.route).toEqual({ name: 'amount', mode: 'lock' });
  });

  it('with a vault, says how to pay and offers to scan', () => {
    const a = helpAnswer('PAY', ready);
    expect(a.say).toMatch(/3,000/);
    expect(a.action?.route).toEqual({ name: 'scan', kind: 'request' });
  });

  it('offers to lock the very amount asked for', () => {
    expect(payNeedsVault(200_000, none).action?.route).toEqual({ name: 'amount', mode: 'lock', prefill: 200_000 });
  });

  it('answers safety with no action, so the conversation carries on', () => {
    expect(helpAnswer('SAFETY', ready).action).toBeNull();
  });
});
