// The app's stack navigator. Payment screens hand signed requests and vouchers to the
// next screen in memory; they never travel in a URL, where a deep link could expose or
// replay them. That is why this is a typed stack and not file-based routes.
import { createContext, useContext } from 'react';
import type { Proposal } from './features/assistant/assistant';
import type { OpenRequest, PaymentRefusal, ScannedRequest } from './features/payment/payments';

export type Side = 'merchant' | 'customer';

export type Route =
  | { name: 'splash' } | { name: 'language'; edit?: boolean } | { name: 'details'; edit?: boolean } | { name: 'createPin' } | { name: 'lock' }
  | { name: 'home' } | { name: 'activity' } | { name: 'vault' } | { name: 'speak'; auto?: boolean; attempt?: number } | { name: 'settings' } | { name: 'help' }
  | { name: 'ledger' } | { name: 'withdraw' } | { name: 'addMoney' } | { name: 'offlineAi' } | { name: 'stock' } | { name: 'budget' }
  | { name: 'receipt'; id: string }
  | { name: 'amount'; mode: 'lock' | 'collect' }
  | { name: 'vaultReview'; amount: number; hours: number } | { name: 'vaultActive' } | { name: 'melt' }
  | { name: 'request'; amount: number; handsFree?: boolean }
  | { name: 'scan'; kind: 'request'; expected?: number; handsFree?: boolean }
  | { name: 'scan'; kind: 'voucher'; open: OpenRequest }
  | { name: 'scan'; kind: 'receipt'; voucherId: string }
  | { name: 'review'; scanned: ScannedRequest; expected?: number; handsFree?: boolean }
  | { name: 'voucher'; voucherId: string }
  | { name: 'delivered'; voucherId: string }
  | { name: 'credit'; voucherId: string; bluetooth: boolean; again?: boolean }
  | { name: 'refusal'; code: PaymentRefusal; side: Side; amount?: number; existingId?: string }
  | { name: 'proposal'; proposal: Proposal; handsFree?: boolean; attempt?: number } | { name: 'assist' };

export type Nav = { go(r: Route): void; reset(r: Route): void; back(): void; openMenu(): void };
export const NavCtx = createContext<Nav | null>(null);
export const useNav = () => {
  const n = useContext(NavCtx);
  if (!n) throw new Error('useNav needs NavCtx');
  return n;
};
