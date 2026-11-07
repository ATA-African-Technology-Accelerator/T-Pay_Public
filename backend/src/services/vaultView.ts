import type { VaultView } from '@tpay/shared/contracts/api';
import type { StoredVoucherStatus, Vault, Voucher } from './ports';




const IN_PROGRESS: StoredVoucherStatus[] = ['SETTLING', 'RETRYABLE_FAILURE'];


export const isInProgress = (voucher: Voucher) => IN_PROGRESS.includes(voucher.status);


const totalUsd = (vouchers: Voucher[]) =>
  vouchers.reduce((total, voucher) => total + voucher.amountUsdMinor, 0);


export const reservedUsd = (vouchers: Voucher[]) => totalUsd(vouchers.filter(isInProgress));

export const settledUsd = (vouchers: Voucher[]) =>
  totalUsd(vouchers.filter(({ status }) => status === 'SETTLED'));


export function toVaultView(vault: Vault, vouchers: Voucher[]): VaultView {
  const reservedUsdMinor = reservedUsd(vouchers);
  const settledUsdMinor = settledUsd(vouchers);
  return {
    vaultId: vault.id,
    status: vault.status,
    amountNgnMinor: vault.amountNgnMinor,
    fxRate: vault.fxRate,
    authorisedUsdMinor: vault.authorisedUsdMinor,
    reservedUsdMinor,
    settledUsdMinor,
    remainingUsdMinor: vault.authorisedUsdMinor - reservedUsdMinor - settledUsdMinor,
    spendBy: (vault.spendBy as Date).toISOString(),
    settleBy: (vault.settleBy as Date).toISOString(),
    paypalAuthorizationId: vault.paypalAuthorizationId as string,
  };
}
