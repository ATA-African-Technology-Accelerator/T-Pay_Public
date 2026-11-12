// The Add money checkout waiting for the person to approve it in PayPal. Kept apart from the rest of
// the wallet code so the sync pass can finish it without importing screens' code.
import { store } from '../../composition';

export const DEPOSIT = 'wallet.deposit';
export const DEPOSIT_KEY = 'wallet.depositKey';

export interface PendingDeposit {
  depositId: string;
  approvalUrl: string;
  amountNgnMinor: number;
  amountUsdMinor: number;
  fxRate: string;
  /** For the complete call, so a retry after a lost answer can't credit twice. */
  completeKey: string;
  createdAt: string;
}

export const loadDeposit = () => store.getMeta<PendingDeposit>(DEPOSIT);

export async function forgetDeposit() {
  await store.setMeta(DEPOSIT, null);
  await store.setMeta(DEPOSIT_KEY, null);
}
