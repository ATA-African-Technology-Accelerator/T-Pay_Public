// ACT-03, ACT-04, ACT-05 and ACT-12. One open vault at a time; PayPal holds the money,
// so lock amounts come from PayPal, not from the Main wallet.
import * as WebBrowser from 'expo-web-browser';
import { createSpendStatement } from '@tpay/shared/application/use-cases/createSpendStatement';
import type { MeltVaultResponse, VaultView } from '@tpay/shared/contracts/api';
import { VaultCapacity } from '@tpay/shared/domain/VaultCapacity';
import { Money } from '@tpay/shared/shared/domain/Money';
import { ApiRequestError } from '../../adapters/api/httpApi';
import type { AppVault, AppVoucher, PendingVault } from '../../adapters/storage/localStore';
import { api, clock, keyStore, random, signer, store } from '../../composition';
import { withSession } from '../../session/guard';

export const RETURN_URL = 'tpay://vault/return';
const PENDING = 'vault.pending';
const CREATE_KEY = 'vault.createKey';
const meltKey = (vaultId: string) => `vault.meltKey.${vaultId}`;

/** Statuses that still hold money at PayPal. The backend allows no new vault while one exists. */
export const isOpen = (vault: AppVault | null) => !!vault && vault.view?.status !== 'CLOSED';

/** Authorised minus everything this phone has signed: settled or not, nothing is signed twice over. */
export function capacityOf(vault: AppVault, vouchers: AppVoucher[]): VaultCapacity {
  const mine = vouchers.filter(v => v.view === 'PAYER' && v.voucher.payload.vaultId === vault.vaultId);
  const usd = (n: number) => Money.fromMinor(n, 'USD').getValue();
  const settled = mine.filter(v => v.status === 'SETTLED').reduce((t, v) => t + v.voucher.payload.amountUsdMinor, 0);
  const reserved = mine.reduce((t, v) => t + v.voucher.payload.amountUsdMinor, 0) - settled;
  const authorised = vault.certificate.payload.authorisedUsdMinor;
  return VaultCapacity.create(usd(authorised), usd(Math.min(reserved, authorised - settled)), usd(settled)).getValue();
}

/** Signing is allowed only before spend-by, and never after the spend statement went out. */
export function canSign(vault: AppVault | null, now = clock.now()): vault is AppVault {
  return !!vault && !vault.melt && vault.view?.status !== 'CLOSED' && vault.view?.status !== 'BLOCKED'
    && new Date(vault.certificate.payload.spendBy) > now;
}

export const loadPending = () => store.getMeta<PendingVault>(PENDING);

/** ACT-04. Creates the PayPal order. A retry with the same amount and hours reuses its key. */
export async function startVault(amountNgnMinor: number, durationHours: number): Promise<PendingVault> {
  const saved = await store.getMeta<{ amountNgnMinor: number; durationHours: number; key: string }>(CREATE_KEY);
  const key = saved && saved.amountNgnMinor === amountNgnMinor && saved.durationHours === durationHours ? saved.key : random.uuid();
  await store.setMeta(CREATE_KEY, { amountNgnMinor, durationHours, key });
  const order = await withSession(() => api.createVault({ amountNgnMinor, durationHours }, { idempotencyKey: key }));
  const pending: PendingVault = {
    vaultId: order.vaultId,
    approvalUrl: order.approvalUrl,
    amountNgnMinor: order.amountNgnMinor,
    amountUsdMinor: order.amountUsdMinor,
    fxRate: order.fxRate,
    durationHours,
    authorizeKey: random.uuid(),
    createdAt: clock.now().toISOString(),
  };
  await store.setMeta(PENDING, pending);
  return pending;
}

export type ApprovalOutcome = 'approved' | 'cancelled' | 'dismissed';

/** Reads tpay://vault/return?vaultId=…&outcome=… */
export function readReturn(url: string): { vaultId: string; outcome: 'approved' | 'cancelled' } | null {
  if (!url.startsWith(RETURN_URL)) return null;
  const params = Object.fromEntries((url.split('?')[1] ?? '').split('&').filter(Boolean).map(p => {
    const [k, v = ''] = p.split('=');
    return [decodeURIComponent(k as string), decodeURIComponent(v.replace(/\+/g, ' '))];
  }));
  const outcome = params.outcome;
  if (!params.vaultId || (outcome !== 'approved' && outcome !== 'cancelled')) return null;
  return { vaultId: params.vaultId, outcome };
}

/** ACT-05, first half: PayPal in an in-app browser, back through the tpay:// link. */
export async function openApproval(pending: PendingVault): Promise<ApprovalOutcome> {
  const result = await WebBrowser.openAuthSessionAsync(pending.approvalUrl, RETURN_URL);
  if (result.type !== 'success') return 'dismissed';
  const back = readReturn(result.url);
  if (!back || back.vaultId !== pending.vaultId) return 'dismissed';
  if (back.outcome === 'cancelled') await cancelPending();
  return back.outcome;
}

/** A cancelled return closes the order at the backend, so the person can start again. */
export async function cancelPending() {
  await store.setMeta(PENDING, null);
  await store.setMeta(CREATE_KEY, null);
}

/** ACT-05, second half: authorise and keep the vault certificate. Safe to repeat. */
export async function completeVault(vaultId: string): Promise<AppVault> {
  const pending = await loadPending();
  const key = pending?.vaultId === vaultId ? pending.authorizeKey : random.uuid();
  const { vault, vaultCertificate } = await withSession(() => api.authorizeVault(vaultId, { idempotencyKey: key }));
  return keepVault(vault, vaultCertificate);
}

/**
 * Locks money from the Main wallet: the money is already collected, so there is no PayPal step and
 * the vault is ready at once. The key is kept for a retry so a lost answer never locks twice.
 */
export async function lockFromWallet(amountNgnMinor: number, durationHours: number, idempotencyKey: string): Promise<AppVault> {
  const { vault, vaultCertificate } = await withSession(() => api.lockFromWallet({ amountNgnMinor, durationHours }, { idempotencyKey }));
  // The wallet's new balance arrives with Home's next sync, which runs as soon as Home opens.
  return keepVault(vault, vaultCertificate);
}

async function keepVault(vault: VaultView, vaultCertificate: AppVault['certificate']): Promise<AppVault> {
  const local: AppVault = {
    vaultId: vault.vaultId,
    certificate: vaultCertificate,
    reservedUsdMinor: 0,
    settledUsdMinor: 0,
    nextSequence: 1,
    view: vault,
    lockedAt: clock.now().toISOString(),
    melt: null,
  };
  const existing = await store.vaults.findCurrent();
  // Authorising again after a lost answer must never reset the sequence of a vault in use.
  await store.vaults.save(existing?.vaultId === vault.vaultId ? { ...existing, certificate: vaultCertificate, view: vault } : local);
  await cancelPending();
  return (await store.vaults.findCurrent()) as AppVault;
}

/**
 * ACT-03 refresh. The backend view replaces ours, except what only this phone knows:
 * its sequence and the vouchers not yet uploaded. A vault authorised at the backend
 * but missing here (an answer lost before it was saved) is recovered by authorising again.
 */
export async function refreshVault(): Promise<void> {
  const { vault } = await withSession(() => api.getCurrentVault());
  const local = await store.vaults.findCurrent();
  if (!vault) {
    if (local && local.view?.status !== 'CLOSED') {
      await store.vaults.save({ ...local, view: { ...(local.view ?? viewFrom(local)), status: 'CLOSED' } });
    }
    return;
  }
  if (local?.vaultId === vault.vaultId) {
    await store.vaults.save({ ...local, view: vault, settledUsdMinor: vault.settledUsdMinor });
    return;
  }
  if (vault.status === 'ACTIVE' || vault.status === 'SPEND_CLOSED' || vault.status === 'BLOCKED') {
    await completeVault(vault.vaultId);
  }
}

function viewFrom(vault: AppVault): VaultView {
  const c = vault.certificate.payload;
  return {
    vaultId: vault.vaultId, status: 'ACTIVE', amountNgnMinor: c.amountNgnMinor, fxRate: c.fxRate, authorisedUsdMinor: c.authorisedUsdMinor,
    reservedUsdMinor: 0, settledUsdMinor: 0, remainingUsdMinor: c.authorisedUsdMinor, spendBy: c.spendBy, settleBy: c.settleBy, paypalAuthorizationId: '',
  };
}

/** ACT-12. Stops signing first, then declares every voucher this phone signed. */
export async function meltVault(): Promise<MeltVaultResponse> {
  const vault = await store.vaults.findCurrent();
  if (!vault) throw new ApiRequestError('VAULT_NOT_FOUND', 'No vault on this phone', 404);
  const handle = await keyStore.loadPrivateKey();
  if (!handle) throw new ApiRequestError('UNAUTHENTICATED', 'No device key', 401);

  const issued = (await store.vouchers.list())
    .filter(v => v.view === 'PAYER' && v.voucher.payload.vaultId === vault.vaultId)
    .map(v => v.voucher.payload);
  const statement = await createSpendStatement({ vaultId: vault.vaultId, issued, customerPrivateKey: handle }, { signer, clock });
  if (statement.isFailure) throw new Error(statement.error as string);

  const key = (await store.getMeta<string>(meltKey(vault.vaultId))) ?? random.uuid();
  await store.setMeta(meltKey(vault.vaultId), key);
  const melt = await withSession(() => api.meltVault(vault.vaultId, { spendStatement: statement.getValue() }, { idempotencyKey: key }));
  const latest = (await store.vaults.findCurrent()) ?? vault;
  await store.vaults.save({ ...latest, melt, view: latest.view ? { ...latest.view, status: melt.status } : latest.view });
  return melt;
}

/**
 * After spend-by the hold stays until this phone reports everything (up to settle-by,
 * about 28 days). So once every voucher it signed is uploaded, it melts with no tap.
 */
export async function autoMeltIfDue(): Promise<boolean> {
  const vault = await store.vaults.findCurrent();
  if (!vault || vault.melt || vault.view?.status === 'CLOSED') return false;
  if (new Date(vault.certificate.payload.spendBy) > clock.now()) return false;
  const waiting = (await store.vouchers.listUnsettled())
    .filter(v => v.view === 'PAYER' && v.voucher.payload.vaultId === vault.vaultId && !v.voucherId);
  if (waiting.length) return false;
  await meltVault();
  return true;
}
