import type { CurrentVaultResponse } from '@tpay/shared/contracts/api';
import type { Device, IVaultRepository, IVoucherRepository } from './ports';
import { toVaultView } from './vaultView';




export class GetCurrentVault {
  constructor(
    private readonly vaults: IVaultRepository,
    private readonly vouchers: IVoucherRepository,
  ) {}

  public async execute(device: Device): Promise<CurrentVaultResponse> {
    const vault = await this.vaults.findOpenForDevice(device.id);
    if (!vault || vault.status === 'PENDING_APPROVAL') {
      return { vault: null };
    }
    return { vault: toVaultView(vault, await this.vouchers.listForVault(vault.id)) };
  }
}
