// ACT-13 and ACT-14. The Active wallet is money collected from customers, held by
// T-Pay and sent to the account's PayPal email on request.
import type { TransactionView, WithdrawResponse } from '@tpay/shared/contracts/api';
import { api, clock, random, store } from '../../composition';
import { withSession } from '../../session/guard';
import { refreshWallet } from '../../sync/syncCoordinator';

const PENDING = 'wallet.withdrawal';

export interface PendingWithdrawal {
  key: string;
  amountUsdMinor: number;
  amountNgnMinor: number;
  response: WithdrawResponse | null;
  createdAt: string;
}

export const loadWithdrawal = () => store.getMeta<PendingWithdrawal>(PENDING);

/**
 * A withdrawal is open until the backend's history shows it finished. While it is
 * open the backend keeps retrying the same payout, so no new one may start.
 */
export function withdrawalOpen(pending: PendingWithdrawal | null, transactions: TransactionView[]): boolean {
  if (!pending) return false;
  if (pending.response?.status === 'FAILED') return false;
  const after = new Date(pending.createdAt).getTime();
  return !transactions.some(t => (t.type === 'WITHDRAWAL_COMPLETED' || t.type === 'WITHDRAWAL_FAILED') && new Date(t.occurredAt).getTime() >= after);
}

/** ACT-14. Repeating this after a lost answer sends the same key, so PayPal pays once. */
export async function withdraw(amountUsdMinor: number, amountNgnMinor: number): Promise<WithdrawResponse> {
  const saved = await loadWithdrawal();
  const reuse = saved && !saved.response && saved.amountUsdMinor === amountUsdMinor;
  const pending: PendingWithdrawal = reuse
    ? saved
    : { key: random.uuid(), amountUsdMinor, amountNgnMinor, response: null, createdAt: clock.now().toISOString() };
  await store.setMeta(PENDING, pending);
  const response = await withSession(() => api.withdraw({ amountUsdMinor }, { idempotencyKey: pending.key }));
  await store.setMeta(PENDING, { ...pending, response });
  await refreshWallet().catch(() => undefined);
  return response;
}
