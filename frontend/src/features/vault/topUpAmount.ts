import type { AppVoucher } from '../../adapters/storage/localStore';

export interface TopUpFacts {
  vouchers: AppVoucher[];
  /** When the last vault was locked, if any. */
  lockedAt: string | null;
  /** When the person last said "Not now", if ever. */
  dismissedAt: string | null;
  vaultOpen: boolean;
  lockWaitingForPayPal: boolean;
  /** Received money goes on to PayPal by itself. */
  cashOut: boolean;
  walletKnown: boolean;
  walletNgnMinor: number;
}

/**
 * How much received-offline money to offer to lock again, in kobo, rounded down to whole naira.
 * Zero means no offer. Only settled payments count: one still queued can be refused.
 */
export function topUpKobo(f: TopUpFacts): number {
  if (f.vaultOpen || f.lockWaitingForPayPal || f.cashOut || !f.walletKnown) return 0;
  const since = [f.lockedAt, f.dismissedAt].filter((x): x is string => !!x).sort().pop() ?? '';
  const received = f.vouchers
    .filter(v => v.view === 'PAYEE' && v.status === 'SETTLED' && v.updatedAt > since)
    .reduce((total, v) => total + v.voucher.payload.amountNgnMinor, 0);
  return Math.floor(Math.max(0, Math.min(received, f.walletNgnMinor)) / 100) * 100;
}
