// Small stack navigator for the design pass. Expo Router replaces it during the app restructure.
import React, { createContext, useContext } from 'react';
import { Contact } from './demo/store';

export type Route =
  | { name: 'splash' } | { name: 'language' } | { name: 'details' } | { name: 'lock' }
  | { name: 'home' } | { name: 'activity' } | { name: 'vault' } | { name: 'speak' } | { name: 'settings' } | { name: 'help' } | { name: 'ledger' }
  | { name: 'receipt'; id: string }
  | { name: 'amount'; mode: 'lock' | 'collect' | 'send'; to?: Contact }
  | { name: 'sendTo' } | { name: 'sendReview'; amount: number; to: Contact } | { name: 'sendDone'; amount: number; to: Contact; id: string } | { name: 'receive' }
  | { name: 'vaultReview'; amount: number; hours: number } | { name: 'vaultActive'; amount: number; hours: number } | { name: 'melt' }
  | { name: 'scan'; kind?: 'request' | 'voucher' | 'receipt'; amount?: number }
  | { name: 'review'; amount: number } | { name: 'refused'; amount: number }
  | { name: 'voucher'; amount: number } | { name: 'delivered'; amount: number }
  | { name: 'request'; amount: number } | { name: 'credit'; amount: number; again?: boolean }
  | { name: 'tampered'; amount: number } | { name: 'duplicate'; amount: number }
  | { name: 'proposal'; amount: number; offline?: boolean } | { name: 'assist' };

export type Nav = { go(r: Route): void; reset(r: Route): void; back(): void; openMenu(): void };
export const NavCtx = createContext<Nav | null>(null);
export const useNav = () => {
  const n = useContext(NavCtx);
  if (!n) throw new Error('useNav needs NavCtx');
  return n;
};
