import type { AppDependencies } from '../app';
import { ApplyPayPalEvent } from '../services/ApplyPayPalEvent';
import { MeltVault } from '../services/MeltVault';
import { SubmitVoucher } from '../services/SubmitVoucher';
import { VaultRelease } from '../services/VaultRelease';
import { VoucherSettlement } from '../services/VoucherSettlement';
import { WithdrawToPayPal } from '../services/WithdrawToPayPal';




export function createServices(dependencies: AppDependencies) {
  const vaultRelease = new VaultRelease(dependencies);
  const settlement = new VoucherSettlement(dependencies, vaultRelease);
  return {
    vaultRelease,
    settlement,
    meltVault: new MeltVault(dependencies, vaultRelease),
    withdrawToPayPal: new WithdrawToPayPal(dependencies),
    submitVoucher: new SubmitVoucher(dependencies, settlement),
    applyPayPalEvent: new ApplyPayPalEvent(dependencies.vaults, dependencies.vouchers, settlement, vaultRelease),
  };
}
