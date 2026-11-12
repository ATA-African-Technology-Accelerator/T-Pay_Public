import type { AppVoucher } from '../../../adapters/storage/localStore';
import { topUpKobo, type TopUpFacts } from '../topUpAmount';

const received = (amountNgnMinor: number, updatedAt: string, status = 'SETTLED', view: 'PAYEE' | 'PAYER' = 'PAYEE') =>
  ({ view, status, updatedAt, voucher: { payload: { amountNgnMinor } } }) as unknown as AppVoucher;

const base: TopUpFacts = {
  vouchers: [received(500_00, '2026-11-12T10:00:00Z')],
  lockedAt: null, dismissedAt: null, vaultOpen: false, lockWaitingForPayPal: false,
  cashOut: false, walletKnown: true, walletNgnMinor: 2000_00,
};

describe('top up the Offline vault from money received offline', () => {
  it('offers money that settled into the Wallet', () => {
    expect(topUpKobo(base)).toBe(500_00);
  });
  it('never counts a payment that is still queued or was refused', () => {
    expect(topUpKobo({ ...base, vouchers: [received(500_00, '2026-11-12T10:00:00Z', 'SUBMITTED'), received(300_00, '2026-11-12T10:00:00Z', 'REJECTED_CONFLICT')] })).toBe(0);
  });
  it('never counts money this phone paid out', () => {
    expect(topUpKobo({ ...base, vouchers: [received(500_00, '2026-11-12T10:00:00Z', 'SETTLED', 'PAYER')] })).toBe(0);
  });
  it('offers nothing while a vault is open, since locked money stays locked', () => {
    expect(topUpKobo({ ...base, vaultOpen: true })).toBe(0);
    expect(topUpKobo({ ...base, lockWaitingForPayPal: true })).toBe(0);
  });
  it('offers nothing when received money goes on to PayPal by itself', () => {
    expect(topUpKobo({ ...base, cashOut: true })).toBe(0);
  });
  it('only counts money that settled after the last lock and after Not now', () => {
    expect(topUpKobo({ ...base, lockedAt: '2026-11-12T11:00:00Z' })).toBe(0);
    expect(topUpKobo({ ...base, dismissedAt: '2026-11-12T11:00:00Z' })).toBe(0);
    expect(topUpKobo({ ...base, lockedAt: '2026-11-12T09:00:00Z' })).toBe(500_00);
  });
  it('never offers more than the Wallet holds, in whole naira', () => {
    expect(topUpKobo({ ...base, walletNgnMinor: 250_50 })).toBe(250_00);
    expect(topUpKobo({ ...base, walletNgnMinor: 0 })).toBe(0);
    expect(topUpKobo({ ...base, walletKnown: false })).toBe(0);
  });
});
