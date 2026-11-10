// What every screen reads. Nothing here is a second copy of a domain fact (FR-35): the
// phone's database and the last backend answers own the state, and this reloads from
// them whenever the database changes. Screens never keep their own balance.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveWalletResponse, LedgerEntry, TransactionView } from '@tpay/shared/contracts/api';
import type { Language, VaultStatus, VoucherStatus } from '@tpay/shared/contracts/statuses';
import type { AppVault, AppVoucher, PendingVault } from '../adapters/storage/localStore';
import { api, connectivity, store } from '../composition';
import { setCatalogue } from '../i18n';
import { profileStore, type LocalProfile } from '../session/profileStore';
import { sessionStore, type DeviceSession } from '../session/sessionStore';
import { withSession } from '../session/guard';
import { LAST_SYNC, TRANSACTIONS, WALLET, syncNow } from '../sync/syncCoordinator';
import { canSign, isOpen, loadPending } from '../features/vault/vaultActivities';
import { loadWithdrawal, withdrawalOpen, type PendingWithdrawal } from '../features/ledger/walletActivities';

export type Status = 'paid' | 'locked' | 'pending' | 'sent' | 'refused' | 'blocked';
export type Dir = 'in' | 'out' | 'lock' | 'release' | 'withdraw';
export type Wallet = 'active' | 'offline';

/** One line of history. Amounts are in kobo. */
export type Entry = {
  id: string; who: string; amount: number; dir: Dir; status: Status; at: string; ref: string; capture?: string;
  voucher?: AppVoucher; transaction?: TransactionView;
};

export interface OfflineSummary {
  /** PayPal still holds money for this vault. */
  open: boolean;
  /** A voucher can be signed now. */
  canSpend: boolean;
  status: VaultStatus | null;
  lockedNgn: number;
  leftNgn: number;
  spentNgn: number;
  pendingOutNgn: number;
  incomingNgn: number;
  spendBy: string | null;
  settleBy: string | null;
  authorizationId: string | null;
  fxRate: string | null;
  melted: boolean;
  releaseAt: string | null;
  blocking: string[];
}

export interface ActiveSummary {
  known: boolean;
  balanceNgn: number;
  balanceUsd: number;
  pendingNgn: number;
  payoutEmail: string;
  entries: LedgerEntry[];
}

export interface Draft { displayName: string; payoutEmail: string; language: Language }

type AppStateValue = {
  ready: boolean;
  online: boolean;
  session: DeviceSession | null;
  profile: LocalProfile | null;
  name: string;
  language: Language;
  setLanguage(language: Language): Promise<void>;
  draft: Draft;
  setDraft(change: Partial<Draft>): void;
  vault: AppVault | null;
  pendingVault: PendingVault | null;
  vouchers: AppVoucher[];
  offline: OfflineSummary;
  active: ActiveSummary;
  transactions: TransactionView[];
  withdrawal: PendingWithdrawal | null;
  withdrawalOpen: boolean;
  history: Entry[];
  lastSyncAt: string | null;
  wallet: Wallet;
  setWallet(wallet: Wallet): void;
  hidden: boolean;
  toggleHidden(): void;
  reload(): Promise<void>;
  sync(): Promise<void>;
};

const Ctx = createContext<AppStateValue | null>(null);

/** How a backend or local status reads to a person. */
export function statusOf(status: VoucherStatus): Status {
  switch (status) {
    case 'SETTLED': return 'paid';
    case 'DRAFT': case 'SIGNED': return 'sent';
    case 'SETTLEMENT_BLOCKED': return 'blocked';
    case 'REJECTED_CONFLICT': case 'REJECTED_OVERSPEND': return 'refused';
    default: return 'pending';
  }
}

const sum = (list: AppVoucher[]) => list.reduce((t, v) => t + v.voucher.payload.amountNgnMinor, 0);
const failed = (v: AppVoucher) => v.status === 'REJECTED_CONFLICT' || v.status === 'REJECTED_OVERSPEND' || v.status === 'SETTLEMENT_BLOCKED';

function summarise(vault: AppVault | null, vouchers: AppVoucher[]): OfflineSummary {
  const open = isOpen(vault);
  const mine = vault ? vouchers.filter(v => v.view === 'PAYER' && v.voucher.payload.vaultId === vault.vaultId) : [];
  const incoming = vouchers.filter(v => v.view === 'PAYEE' && v.status !== 'SETTLED' && !failed(v));
  const c = vault?.certificate.payload;
  const view = vault?.view ?? null;
  return {
    open,
    canSpend: canSign(vault),
    status: view?.status ?? (vault ? 'ACTIVE' : null),
    lockedNgn: open && c ? c.amountNgnMinor : 0,
    leftNgn: open && c ? Math.max(0, c.amountNgnMinor - sum(mine)) : 0,
    spentNgn: sum(mine.filter(v => v.status === 'SETTLED')),
    pendingOutNgn: sum(mine.filter(v => v.status !== 'SETTLED' && !failed(v))),
    incomingNgn: sum(incoming),
    spendBy: c?.spendBy ?? null,
    settleBy: view?.settleBy ?? c?.settleBy ?? null,
    authorizationId: view?.paypalAuthorizationId || null,
    fxRate: c?.fxRate ?? null,
    melted: !!vault?.melt,
    releaseAt: vault?.melt?.releasedAt ?? vault?.melt?.releaseScheduledFor ?? null,
    blocking: vault?.melt?.blockingVoucherIds ?? [],
  };
}

function historyOf(vouchers: AppVoucher[], transactions: TransactionView[], words: HistoryWords): Entry[] {
  const fromVouchers: Entry[] = vouchers.map(v => ({
    id: v.id,
    who: v.counterparty || (v.view === 'PAYER' ? words.merchant : words.customer),
    amount: v.voucher.payload.amountNgnMinor,
    dir: v.view === 'PAYER' ? 'out' : 'in',
    status: statusOf(v.status),
    at: v.createdAt,
    ref: v.voucherId ?? `${v.voucher.payload.vaultId} · ${v.voucher.payload.sequence}`,
    capture: v.paypalCaptureId ?? undefined,
    voucher: v,
  }));
  const fromTransactions: Entry[] = transactions.flatMap((tx): Entry[] => {
    const base = { id: tx.transactionId, amount: tx.amountNgnMinor ?? 0, at: tx.occurredAt, ref: tx.vaultId ?? tx.transactionId, capture: tx.paypalReferenceId ?? undefined, transaction: tx };
    switch (tx.type) {
      case 'VAULT_LOCKED': return [{ ...base, who: words.locked, dir: 'lock', status: 'locked' }];
      case 'VAULT_RELEASED': return [{ ...base, who: words.released, dir: 'release', status: 'paid' }];
      case 'WITHDRAWAL_REQUESTED': return [{ ...base, who: words.withdrawal, dir: 'withdraw', status: 'pending', ref: tx.transactionId }];
      case 'WITHDRAWAL_COMPLETED': return [{ ...base, who: words.withdrawn, dir: 'withdraw', status: 'paid', ref: tx.transactionId }];
      case 'WITHDRAWAL_FAILED': return [{ ...base, who: words.withdrawalFailed, dir: 'withdraw', status: 'refused', ref: tx.transactionId }];
      default: return [];
    }
  });
  return [...fromVouchers, ...fromTransactions].sort((a, b) => b.at.localeCompare(a.at));
}

export type HistoryWords = { merchant: string; customer: string; locked: string; released: string; withdrawal: string; withdrawn: string; withdrawalFailed: string };

const EMPTY_ACTIVE: ActiveSummary = { known: false, balanceNgn: 0, balanceUsd: 0, pendingNgn: 0, payoutEmail: '', entries: [] };

export function AppStateProvider({ children, words }: { children: React.ReactNode; words: HistoryWords }) {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [session, setSession] = useState<DeviceSession | null>(null);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [draft, setDraftState] = useState<Draft>({ displayName: '', payoutEmail: '', language: 'en' });
  const [vault, setVault] = useState<AppVault | null>(null);
  const [pendingVault, setPendingVault] = useState<PendingVault | null>(null);
  const [vouchers, setVouchers] = useState<AppVoucher[]>([]);
  const [walletCache, setWalletCache] = useState<ActiveWalletResponse | null>(null);
  const [transactions, setTransactions] = useState<TransactionView[]>([]);
  const [withdrawal, setWithdrawal] = useState<PendingWithdrawal | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet>('offline');
  const [hidden, setHidden] = useState(false);
  const loading = useRef<Promise<void> | null>(null);
  const stale = useRef(false);

  const reload = useCallback((): Promise<void> => {
    // A change while reading means what was read may be old, so read once more after.
    if (loading.current) { stale.current = true; return loading.current; }
    loading.current = (async () => {
      const [s, p, v, pv, list, w, tx, wd, last] = await Promise.all([
        sessionStore.load(), profileStore.load(), store.vaults.findCurrent(), loadPending(), store.vouchers.list(),
        store.getMeta<ActiveWalletResponse>(WALLET), store.getMeta<TransactionView[]>(TRANSACTIONS), loadWithdrawal(), store.getMeta<string>(LAST_SYNC),
      ]);
      setSession(s); setProfile(p); setVault(v); setPendingVault(pv); setVouchers(list);
      setWalletCache(w); setTransactions(tx ?? []); setWithdrawal(wd); setLastSyncAt(last);
      if (p) setCatalogue(p.language);
      setReady(true);
    })().finally(() => {
      loading.current = null;
      if (stale.current) { stale.current = false; void reload(); }
    });
    return loading.current;
  }, []);

  useEffect(() => {
    void reload();
    const off = store.onChange(() => { void reload(); });
    const offNet = connectivity.watch(setOnline);
    return () => { off(); offNet(); };
  }, [reload]);

  const setLanguage = useCallback(async (language: Language) => {
    setCatalogue(language);
    setDraftState(d => ({ ...d, language }));
    const saved = await profileStore.load();
    if (!saved) return;
    await profileStore.save({ ...saved, language });
    setProfile({ ...saved, language });
    // Keep the backend in step for spoken replies; offline it catches up at the next change.
    void withSession(() => api.updateProfile({ language })).catch(() => undefined);
  }, []);

  const value = useMemo<AppStateValue>(() => {
    const offline = summarise(vault, vouchers);
    const active: ActiveSummary = walletCache
      ? { known: true, balanceNgn: walletCache.balanceNgnMinor, balanceUsd: walletCache.balanceUsdMinor, pendingNgn: walletCache.pendingNgnMinor, payoutEmail: walletCache.payoutEmail, entries: walletCache.entries }
      : EMPTY_ACTIVE;
    return {
      ready, online, session, profile,
      name: profile?.displayName ?? session?.deviceCertificate.payload.displayName ?? draft.displayName,
      language: profile?.language ?? draft.language,
      setLanguage,
      draft, setDraft: change => setDraftState(d => ({ ...d, ...change })),
      vault, pendingVault, vouchers, offline, active, transactions,
      withdrawal, withdrawalOpen: withdrawalOpen(withdrawal, transactions),
      history: historyOf(vouchers, transactions, words),
      lastSyncAt,
      wallet, setWallet, hidden, toggleHidden: () => setHidden(x => !x),
      reload, sync: syncNow,
    };
  }, [ready, online, session, profile, draft, vault, pendingVault, vouchers, walletCache, transactions, withdrawal, lastSyncAt, wallet, hidden, words, reload, setLanguage]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useApp needs AppStateProvider');
  return s;
}
