// ACT-10: whichever phone has network uploads what it holds, then learns the outcome.
// It runs on app open, on reconnect, after every payment and every half minute while
// something is still settling. Nobody presses sync (FR-24, FR-44). Only a backend
// answer ever sets SETTLED (FR-23).
import type { ActiveWalletResponse, TransactionView, VoucherView } from '@tpay/shared/contracts/api';
import type { ErrorCode } from '@tpay/shared/contracts/errors';
import { AppState } from 'react-native';
import { ApiRequestError } from '../adapters/api/httpApi';
import { isTerminal, type AppVoucher } from '../adapters/storage/localStore';
import { api, clock, connectivity, store } from '../composition';
import { DeviceRevoked, renewCertificateIfDue, withSession } from '../session/guard';
import { sessionStore } from '../session/sessionStore';
import { autoMeltIfDue, refreshVault } from '../features/vault/vaultActivities';

export const WALLET = 'cache.wallet';
export const TRANSACTIONS = 'cache.transactions';
export const LAST_SYNC = 'cache.lastSync';
const REPEAT_MS = 30_000;
const MAX_PAGES = 10;

// Contract section 6: these mean the voucher will never be accepted as sent.
const STOP: Partial<Record<ErrorCode, AppVoucher['status']>> = {
  INVALID_SIGNATURE: 'REJECTED_CONFLICT',
  INVALID_CERTIFICATE: 'REJECTED_CONFLICT',
  VOUCHER_EXPIRED: 'SETTLEMENT_BLOCKED',
  NOT_A_PARTY: 'REJECTED_CONFLICT',
  VALIDATION_FAILED: 'REJECTED_CONFLICT',
};

let running: Promise<void> | null = null;
let again = false;

/** One pass at a time; a request during a pass runs one more pass after it. */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = pass().finally(() => {
    running = null;
    if (again) { again = false; void syncNow(); }
  });
  return running;
}

async function pass(): Promise<void> {
  if (!(await sessionStore.load()) || !(await connectivity.isOnline())) return;
  try {
    await renewCertificateIfDue().catch(ignoreOffline);
    await uploadVouchers();
    await readVouchers().catch(ignoreOffline);
    await refreshVault().catch(ignoreOffline);
    await autoMeltIfDue().catch(ignoreOffline);
    await refreshWallet().catch(ignoreOffline);
    await store.setMeta(LAST_SYNC, clock.now().toISOString());
  } catch (e) {
    if (e instanceof DeviceRevoked) return;
    ignoreOffline(e);
  }
}

function ignoreOffline(e: unknown) {
  if (e instanceof ApiRequestError || e instanceof DeviceRevoked) return;
  console.warn('Sync step failed', e);
}

async function uploadVouchers() {
  for (const v of await store.vouchers.listUnsettled()) {
    try {
      const result = await withSession(() => api.submitVoucher({
        voucher: v.voucher, vaultCertificate: v.vaultCertificate, ...(v.receipt ? { receipt: v.receipt } : {}),
      }));
      await update(v, { status: result.status, voucherId: result.voucherId, paypalCaptureId: result.paypalCaptureId ?? v.paypalCaptureId });
    } catch (e) {
      if (!(e instanceof ApiRequestError)) throw e;
      const status = STOP[e.code as ErrorCode];
      if (status) { await update(v, { status, stopped: e.code }); continue; }
      // Network, rate limits and 5xx: keep it and try on the next pass.
      if (e.code === 'NETWORK') return;
    }
  }
}

/**
 * Statuses from the backend for both views. The cursor pages towards older vouchers,
 * so each pass starts from the newest and stops once every voucher still settling here
 * has been seen.
 */
async function readVouchers() {
  const local = await store.vouchers.list();
  const open = new Set(local.filter(v => !isTerminal(v.status)).map(v => `${v.view}:${v.voucher.payload.vaultId}:${v.voucher.payload.sequence}`));
  if (!open.size) return;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES && open.size; page++) {
    const { items, nextCursor } = await withSession(() => api.listVouchers(cursor));
    for (const item of items) {
      open.delete(`${item.view}:${item.vaultId}:${item.sequence}`);
      await apply(item, local);
    }
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }
}

async function apply(item: VoucherView, local: AppVoucher[]) {
  const mine = local.find(v => v.view === item.view && v.voucher.payload.vaultId === item.vaultId && v.voucher.payload.sequence === item.sequence);
  if (!mine) return;
  if (isTerminal(mine.status) && mine.status === item.status) return;
  await update(mine, { status: item.status, voucherId: item.voucherId, paypalCaptureId: item.paypalCaptureId, counterparty: mine.counterparty || item.counterpartyName });
}

async function update(v: AppVoucher, change: Partial<AppVoucher>) {
  const latest = (await store.vouchers.find(v.id)) ?? v;
  await store.vouchers.save({ ...latest, ...change, updatedAt: clock.now().toISOString() });
}

export async function refreshWallet() {
  const wallet = await withSession(() => api.getActiveWallet());
  await store.setMeta(WALLET, wallet satisfies ActiveWalletResponse);
  const items: TransactionView[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await withSession(() => api.listTransactions(cursor));
    items.push(...result.items);
    if (!result.nextCursor || result.nextCursor === cursor) break;
    cursor = result.nextCursor;
  }
  await store.setMeta(TRANSACTIONS, items);
}

async function hasWork(): Promise<boolean> {
  if ((await store.vouchers.listUnsettled()).length) return true;
  const vault = await store.vaults.findCurrent();
  return !!vault && vault.view?.status !== 'CLOSED';
}

/** Starts the triggers. Returns a function that stops them. */
export function startSync(): () => void {
  void syncNow();
  const offReconnect = connectivity.onReconnect(() => { void syncNow(); });
  const appState = AppState.addEventListener('change', s => { if (s === 'active') void syncNow(); });
  const timer = setInterval(() => { void hasWork().then(work => { if (work) void syncNow(); }); }, REPEAT_MS);
  return () => { offReconnect(); appState.remove(); clearInterval(timer); };
}
