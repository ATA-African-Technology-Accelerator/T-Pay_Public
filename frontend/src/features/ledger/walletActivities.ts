// ACT-13 and ACT-14. The Main wallet is money collected from customers, held by
// T-Pay and sent to the account's PayPal email on request.
import * as WebBrowser from 'expo-web-browser';
import type { CompleteDepositResponse, TransactionView, WithdrawResponse } from '@tpay/shared/contracts/api';
import { api, clock, random, store } from '../../composition';
import { withSession } from '../../session/guard';
import { refreshWallet } from '../../sync/syncCoordinator';
import { DEPOSIT, DEPOSIT_KEY, forgetDeposit, loadDeposit, type PendingDeposit } from './pendingDeposit';

export { forgetDeposit, loadDeposit, type PendingDeposit };

const PENDING = 'wallet.withdrawal';

export interface PendingWithdrawal {
  key: string;
  amountUsdMinor: number;
  amountNgnMinor: number;
  /** Null when it goes to the account's own PayPal email. */
  recipientEmail: string | null;
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

/**
 * ACT-14. Pays out to the account's own PayPal email, or to any other email. Repeating this
 * after a lost answer sends the same key, so PayPal pays once. A different amount or
 * recipient is a new payment and gets a new key.
 */
export async function withdraw(amountUsdMinor: number, amountNgnMinor: number, recipientEmail: string | null = null): Promise<WithdrawResponse> {
  const saved = await loadWithdrawal();
  const reuse = saved && !saved.response && saved.amountUsdMinor === amountUsdMinor && (saved.recipientEmail ?? null) === recipientEmail;
  const pending: PendingWithdrawal = reuse
    ? saved
    : { key: random.uuid(), amountUsdMinor, amountNgnMinor, recipientEmail, response: null, createdAt: clock.now().toISOString() };
  await store.setMeta(PENDING, pending);
  const response = await withSession(() => api.withdraw({ amountUsdMinor, ...(recipientEmail ? { recipientEmail } : {}) }, { idempotencyKey: pending.key }));
  await store.setMeta(PENDING, { ...pending, response });
  await refreshWallet().catch(() => undefined);
  return response;
}


// ---- Add money (a PayPal checkout that lands in the Main wallet) ----------------------

export const DEPOSIT_RETURN = 'tpay://wallet/return';

/** A checkout the person has started. Kept so a closed app can finish it from the PayPal link. */


/** Creates the PayPal checkout. A retry for the same amount reuses its key, so it makes one checkout. */
export async function startDeposit(amountNgnMinor: number): Promise<PendingDeposit> {
  const saved = await store.getMeta<{ amountNgnMinor: number; key: string }>(DEPOSIT_KEY);
  const key = saved && saved.amountNgnMinor === amountNgnMinor ? saved.key : random.uuid();
  await store.setMeta(DEPOSIT_KEY, { amountNgnMinor, key });
  const order = await withSession(() => api.createDeposit({ amountNgnMinor }, { idempotencyKey: key }));
  const pending: PendingDeposit = {
    depositId: order.depositId,
    approvalUrl: order.approvalUrl,
    amountNgnMinor: order.amountNgnMinor,
    amountUsdMinor: order.amountUsdMinor,
    fxRate: order.fxRate,
    completeKey: random.uuid(),
    createdAt: clock.now().toISOString(),
  };
  await store.setMeta(DEPOSIT, pending);
  return pending;
}

/** Reads tpay://wallet/return?depositId=…&outcome=… */
export function readDepositReturn(url: string): { depositId: string; outcome: 'approved' | 'cancelled' } | null {
  if (!url.startsWith(DEPOSIT_RETURN)) return null;
  const params = Object.fromEntries((url.split('?')[1] ?? '').split('&').filter(Boolean).map(p => {
    const [k, v = ''] = p.split('=');
    return [decodeURIComponent(k as string), decodeURIComponent(v.replace(/\+/g, ' '))];
  }));
  const { depositId, outcome } = params;
  if (!depositId || (outcome !== 'approved' && outcome !== 'cancelled')) return null;
  return { depositId, outcome };
}

export type DepositApproval = 'approved' | 'cancelled' | 'dismissed';

/** PayPal in an in-app browser, back through the tpay:// link. */
export async function openDepositApproval(pending: PendingDeposit): Promise<DepositApproval> {
  const result = await WebBrowser.openAuthSessionAsync(pending.approvalUrl, DEPOSIT_RETURN);
  if (result.type !== 'success') return 'dismissed';
  const back = readDepositReturn(result.url);
  if (!back || back.depositId !== pending.depositId) return 'dismissed';
  if (back.outcome === 'cancelled') await forgetDeposit();
  return back.outcome;
}


/** Captures the approved payment and credits the wallet. Safe to repeat: the backend credits once. */
export async function completeDeposit(depositId: string): Promise<CompleteDepositResponse> {
  const pending = await loadDeposit();
  const key = pending?.depositId === depositId ? pending.completeKey : random.uuid();
  const result = await withSession(() => api.completeDeposit(depositId, { idempotencyKey: key }));
  if (result.status === 'COMPLETED') {
    await forgetDeposit();
    await refreshWallet().catch(() => undefined);
  }
  return result;
}
