// What the assistant does when asked by voice. Anything that moves no money (reading a balance,
// opening a screen, putting stock on the shelf, setting a budget) is done at once and said out
// loud. Anything that moves money is asked first ("Withdraw five thousand naira?") and then opens
// its normal screen, where the PIN, fingerprint or PayPal sign-in still has to be given by the
// person. The assistant never enters a PIN or password, and never skips that step.
import { Share } from 'react-native';
import type { AssistantScreen } from '@tpay/shared/contracts/api';
import type { Route } from '../../nav';
import { money, when } from '../../components/ui';
import { t } from '../../i18n';
import { api } from '../../composition';
import { withSession } from '../../session/guard';
import type { Entry } from '../../state/appState';
import { budgetStore, stockStore, type StockItem, LOW_STOCK, MAX_QUANTITY } from '../business/businessStore';
import { spentThisMonth } from '../business/spent';
import type { Proposal } from './assistant';

/** What the phone knows that the answer depends on. */
export interface ActionState {
  vaultOpen: boolean;
  canSpend: boolean;
  leftNgn: number;
  spendBy: string | null;
  walletKnown: boolean;
  walletNgn: number;
  online: boolean;
  name: string;
  history: Entry[];
}

/** Done at once: what to say, and where to go afterwards (null stays in the conversation). */
export interface DoneNow { say: string; to: Route | null }

/** Asked first: what to ask, and the screen a "yes" opens. */
export interface AskFirst { ask: string; to: Route }

const SCREENS: Record<AssistantScreen, { route: Route; name: () => string }> = {
  HOME: { route: { name: 'home' }, name: () => t.home },
  ACTIVITY: { route: { name: 'activity' }, name: () => t.activity },
  WALLET: { route: { name: 'ledger' }, name: () => t.walletActive },
  VAULT: { route: { name: 'vault' }, name: () => t.vaultTitle },
  STOCK: { route: { name: 'stock' }, name: () => t.stockInventory },
  BUDGET: { route: { name: 'budget' }, name: () => t.personalBudget },
  SETTINGS: { route: { name: 'settings' }, name: () => t.profile },
  HELP: { route: { name: 'help' }, name: () => t.help },
};

/** Intents done at once, with no "yes" needed. */
export const AT_ONCE: Proposal['intent'][] = ['CHECK_BALANCE', 'CHECK_STOCK', 'ADD_STOCK', 'SET_BUDGET', 'CHECK_BUDGET', 'OPEN_SCREEN', 'SHARE_PAY_LINK'];
/** Intents that move money, so they are asked first. Their amount is asked for when missing. */
export const NEEDS_AMOUNT: Proposal['intent'][] = ['CREATE_PAYMENT_REQUEST', 'PAY_AMOUNT', 'LOCK_MONEY', 'ADD_MONEY', 'WITHDRAW', 'SET_BUDGET'];

const singular = (name: string) => name.toLowerCase().trim().replace(/(es|s)$/, '');

/** The shelf item someone named, matched loosely: "cokes" is "Coke". */
export function findItem(items: StockItem[], named: string): StockItem | null {
  const want = singular(named);
  return items.find(i => singular(i.name) === want)
    ?? items.find(i => singular(i.name).includes(want) || want.includes(singular(i.name)))
    ?? null;
}

/** Does the request now. Null when this intent isn't one done at once. */
export async function doNow(p: Proposal, s: ActionState): Promise<DoneNow | null> {
  switch (p.intent) {
    case 'CHECK_BALANCE': {
      const vault = s.vaultOpen ? t.askBalance(money(s.leftNgn)) : t.noVaultOpenSay;
      const wallet = s.walletKnown ? ` ${t.walletHasSay(money(s.walletNgn))}` : '';
      return { say: `${vault}${wallet}`, to: null };
    }
    case 'OPEN_SCREEN': {
      const screen = p.screen ? SCREENS[p.screen] : null;
      return screen ? { say: t.openingSay(screen.name()), to: screen.route } : null;
    }
    case 'ADD_STOCK': {
      const item = p.itemName?.trim();
      const count = p.quantity ?? null;
      if (!item) return { say: t.stockWhichItem, to: null };
      if (!count || count < 1 || count > MAX_QUANTITY) return { say: t.stockHowMany(item), to: null };
      // "Cokes" goes on the "Coke" already on the shelf, not on a second line of its own.
      const name = findItem(await stockStore.load(), item)?.name ?? item;
      await stockStore.add(name, count);
      const now = findItem(await stockStore.load(), name);
      return { say: t.stockAddedSay(count, now?.name ?? item, now?.quantity ?? count), to: null };
    }
    case 'CHECK_STOCK': {
      const items = await stockStore.load();
      if (p.itemName) {
        const item = findItem(items, p.itemName);
        return { say: item ? t.stockCountSay(item.name, item.quantity) : t.stockNotFoundSay(p.itemName), to: null };
      }
      if (!items.length) return { say: t.stockEmptySay, to: { name: 'stock' } };
      const low = items.filter(i => i.quantity <= LOW_STOCK).map(i => i.name);
      return { say: t.stockSummarySay(items.length, low), to: { name: 'stock' } };
    }
    case 'SET_BUDGET': {
      if (!p.amountNgnMinor) return null; // asked for by voice first
      await budgetStore.save(p.amountNgnMinor);
      return { say: t.budgetSavedSay(money(p.amountNgnMinor)), to: null };
    }
    case 'CHECK_BUDGET': {
      const limit = await budgetStore.load();
      if (limit === null) return { say: t.budgetNoneSay, to: null };
      const spent = spentThisMonth(s.history);
      return { say: spent > limit ? t.budgetOver(money(spent - limit)) : t.budgetLeft(money(limit - spent), money(limit)), to: null };
    }
    case 'SHARE_PAY_LINK': {
      if (!s.online) return { say: t.needsInternetSay, to: null };
      try {
        const { url } = await withSession(() => api.getPayLink());
        // Choosing who to send it to is the person's own tap: the assistant never picks a contact.
        void Share.share({ message: `${t.payLinkMessage(s.name)} ${url}` }).catch(() => undefined);
        return { say: t.payLinkReadySay, to: null };
      } catch {
        return { say: t.payLinkFailed, to: null };
      }
    }
    default:
      return null;
  }
}

/**
 * The question asked before a request that moves money, and the screen a "yes" opens. A reply that
 * explains why it can't be done (no vault to close, nothing to withdraw) has no screen: say it.
 */
export function askFirst(p: Proposal, s: ActionState): AskFirst | { say: string } | null {
  const amount = p.amountNgnMinor;
  switch (p.intent) {
    case 'CREATE_PAYMENT_REQUEST':
      return amount ? { ask: t.askCollect(money(amount)), to: { name: 'request', amount, handsFree: true } } : null;
    case 'PAY_AMOUNT':
      return amount ? { ask: t.askPay(money(amount)), to: { name: 'scan', kind: 'request', expected: amount, handsFree: true } } : null;
    case 'LOCK_MONEY':
      if (s.vaultOpen) return { say: t.helpLockOpen(money(s.leftNgn), s.spendBy ? when(s.spendBy) : null) };
      return amount ? { ask: t.askLockSay(money(amount)), to: { name: 'vaultReview', amount, hours: 24, handsFree: true } } : null;
    case 'UNLOCK_MONEY':
      if (!s.vaultOpen) return { say: t.noVaultToUnlockSay };
      return { ask: t.askUnlockSay(money(s.leftNgn)), to: { name: 'melt', handsFree: true } };
    case 'ADD_MONEY':
      if (!s.online) return { say: t.needsInternetSay };
      return amount ? { ask: t.askAddMoneySay(money(amount)), to: { name: 'addMoney', prefill: amount, handsFree: true } } : null;
    case 'WITHDRAW':
      if (!s.online) return { say: t.needsInternetSay };
      if (s.walletKnown && s.walletNgn <= 0) return { say: t.nothingToWithdrawSay };
      if (!amount) return null;
      if (s.walletKnown && amount > s.walletNgn) return { say: t.withdrawTooMuchSay(money(s.walletNgn)) };
      return { ask: t.askWithdrawSay(money(amount)), to: { name: 'withdraw', prefill: amount, handsFree: true } };
    default:
      return null;
  }
}

/** The question asked when the amount is missing. */
export function askAmountFor(intent: Proposal['intent']): string {
  switch (intent) {
    case 'LOCK_MONEY': return t.howMuchLockSay;
    case 'ADD_MONEY': return t.howMuchAddSay;
    case 'WITHDRAW': return t.howMuchWithdrawSay;
    case 'SET_BUDGET': return t.howMuchBudgetSay;
    default: return t.askAmount;
  }
}

// Ending the conversation: "that's all", "nothing", "bye", "no thanks", "stop".
const DONE = ['thats all', 'that s all', 'that is all', 'nothing', 'nothing else', 'no thanks', 'no thank you', 'bye', 'goodbye', 'bye bye', 'stop', 'stop listening', 'never mind', 'nevermind', 'i m done', 'im done', 'i am done', 'na im be that', 'e don do', 'thank you', 'thanks'];

/** True when what was said only ends the conversation. */
export function isDone(text: string): boolean {
  const said = text.toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(no|okay|ok|alright|that s it)\s+/, '').trim();
  return DONE.includes(said);
}
