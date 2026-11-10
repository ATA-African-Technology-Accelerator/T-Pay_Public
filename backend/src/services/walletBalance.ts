import type { LedgerRecord } from './ports';




const SIGN: Record<LedgerRecord['type'], number> = {
  CREDIT: 1,
  WITHDRAWAL_RETURNED: 1,
  WITHDRAWAL: -1,
  REVERSAL: -1,
};


export const balanceUsd = (ledger: LedgerRecord[]) =>
  ledger.reduce((total, entry) => total + SIGN[entry.type] * entry.amountUsdMinor, 0);

export const balanceNgn = (ledger: LedgerRecord[]) =>
  ledger.reduce((total, entry) => total + SIGN[entry.type] * entry.amountNgnMinor, 0);
