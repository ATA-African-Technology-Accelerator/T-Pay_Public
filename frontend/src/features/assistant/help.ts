import type { HelpTopic } from '@tpay/shared/contracts/api';
import type { Route } from '../../nav';
import { money, when } from '../../components/ui';
import { t } from '../../i18n';

/** What the phone knows that changes the answer. */
export interface HelpState {
  vaultOpen: boolean;
  canSpend: boolean;
  leftNgn: number;
  spendBy: string | null;
  walletKnown: boolean;
  walletNgn: number;
}

export interface HelpAnswer {
  /** Read out, and shown. Always ends in a question when there is something to do next. */
  say: string;
  /** What a "yes" does. Null when the answer is the whole help. */
  action: { label: string; route: Route } | null;
}

const lock = (prefill?: number): Route => ({ name: 'amount', mode: 'lock', ...(prefill ? { prefill } : {}) });

/**
 * A question about the app, answered from the app's own words and what this phone knows right now,
 * never from the model's words. Each answer says what to do and offers to take the person there.
 */
export function helpAnswer(topic: HelpTopic, s: HelpState): HelpAnswer {
  const wallet = s.walletKnown && s.walletNgn > 0 ? money(s.walletNgn) : null;
  switch (topic) {
    case 'PAY':
      if (s.canSpend) return { say: t.helpPayReady(money(s.leftNgn)), action: { label: t.pay, route: { name: 'scan', kind: 'request' } } };
      if (s.vaultOpen) return { say: t.helpPayEnded, action: { label: t.vault, route: { name: 'vault' } } };
      return { say: t.helpPayNoVault(wallet), action: { label: t.lockMoneyNow, route: lock() } };
    case 'GET_PAID':
      return { say: t.helpGetPaid, action: { label: t.getPaid, route: { name: 'amount', mode: 'collect' } } };
    case 'LOCK':
      if (s.vaultOpen) return { say: t.helpLockOpen(money(s.leftNgn), s.spendBy ? when(s.spendBy) : null), action: { label: t.vault, route: { name: 'vault' } } };
      return { say: t.helpLock(wallet), action: { label: t.lockMoneyNow, route: lock() } };
    case 'WITHDRAW':
      return { say: t.helpWithdraw, action: { label: t.withdraw, route: { name: 'withdraw' } } };
    case 'SAFETY':
      return { say: t.helpSafety, action: null };
    default:
      return { say: t.helpWhatICanDo, action: null };
  }
}

/** Asked to pay with no money to pay from: say why, and offer to lock that amount. */
export function payNeedsVault(amountNgnMinor: number | null, s: HelpState): HelpAnswer {
  if (s.vaultOpen) return { say: t.helpPayEnded, action: { label: t.vault, route: { name: 'vault' } } };
  return { say: t.payNeedsVault(amountNgnMinor ? money(amountNgnMinor) : null), action: { label: t.lockMoneyNow, route: lock(amountNgnMinor ?? undefined) } };
}

/** The Pay button with nothing to pay from: the assistant says why, and offers to lock money. */
export const payHelp = (): Route => ({ name: 'proposal' as const, proposal: {
  intent: 'HELP' as const, helpTopic: 'PAY' as const, amountNgnMinor: null, transcript: '', spokenReply: null, offline: false, onDevice: false, overCapacity: false,
} });
