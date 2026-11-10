import type { ActiveWalletResponse, LedgerEntry } from '@tpay/shared/contracts/api';
import type { Device, IVoucherRepository, LedgerRecord } from './ports';
import { balanceNgn, balanceUsd } from './walletBalance';




const RECENT_ENTRIES = 50;


const toLedgerEntry = (entry: LedgerRecord): LedgerEntry => ({
  entryId: entry.id,
  type: entry.type,
  amountUsdMinor: entry.amountUsdMinor,
  amountNgnMinor: entry.amountNgnMinor,
  voucherId: entry.voucherId,
  paypalCaptureId: entry.paypalCaptureId,
  createdAt: entry.createdAt.toISOString(),
});


export class GetActiveWallet {
  constructor(private readonly vouchers: IVoucherRepository, private readonly fxRate: string) {}

  public async execute(device: Device): Promise<ActiveWalletResponse> {
    const ledger = await this.vouchers.listLedgerForDevice(device.id);
    return {
      balanceUsdMinor: balanceUsd(ledger),
      balanceNgnMinor: balanceNgn(ledger),
      pendingNgnMinor: await this.vouchers.pendingNgnForPayee(device.id),
      payoutEmail: device.payoutEmail,
      fxRate: this.fxRate,
      entries: ledger.slice(0, RECENT_ENTRIES).map(toLedgerEntry),
    };
  }
}
