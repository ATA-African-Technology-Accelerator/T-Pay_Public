import { useEffect, useState } from 'react';
import { store } from '../../composition';
import { useApp } from '../../state/appState';
import { topUpKobo } from './topUpAmount';

export const CASH_OUT = 'ui.autoCashOut';
const DISMISSED = 'vault.topUpDismissedAt';

/**
 * Money received offline settles into the Wallet, never into the Offline vault: a payment
 * still waiting to settle can be refused, so it is never spent again offline. Once it has
 * settled it is real Wallet money, and this offers to lock it into a new vault in one tap
 * (Lock from Wallet, no PayPal step).
 *
 * Offered only when no vault is open (one vault at a time), when the person has turned off
 * sending received money on to PayPal (otherwise it leaves the Wallet within a minute), and
 * only for money that settled after the last vault was locked and after the last "Not now".
 * Never more than the Wallet holds.
 */
export function useTopUp(): { kobo: number; dismiss(): Promise<void> } {
  const { vault, vouchers, offline, pendingVault, active } = useApp();
  const cashOut = useCashOut();
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => { void store.getMeta<string>(DISMISSED).then(at => { if (alive) setDismissedAt(at); }).catch(() => undefined); };
    load();
    const off = store.onChange(load);
    return () => { alive = false; off(); };
  }, []);

  const kobo = topUpKobo({
    vouchers, lockedAt: vault?.lockedAt ?? null, dismissedAt, vaultOpen: offline.open, lockWaitingForPayPal: !!pendingVault,
    cashOut, walletKnown: active.known, walletNgnMinor: active.balanceNgn,
  });
  return { kobo, dismiss: () => store.setMeta(DISMISSED, new Date().toISOString()) };
}

/** Whether received money goes on to PayPal by itself. The server's answer, as the phone last saw it. */
export function useCashOut(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = () => { void store.getMeta<boolean>(CASH_OUT).then(v => { if (alive) setOn(v ?? true); }).catch(() => undefined); };
    load();
    const off = store.onChange(load);
    return () => { alive = false; off(); };
  }, []);
  return on;
}
