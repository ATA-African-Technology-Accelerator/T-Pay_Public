import type { IVaultRepository, IVoucherRepository, Voucher } from './ports';
import type { VaultRelease } from './VaultRelease';
import type { VoucherSettlement } from './VoucherSettlement';




export interface PayPalEvent {
  id: string;
  event_type: string;
  resource: Record<string, unknown>;
}


interface ResourceLink {
  rel: string;
  href: string;
}


const CAPTURE_LINK_RELATION = 'up';


export class ApplyPayPalEvent {
  constructor(
    private readonly vaults: IVaultRepository,
    private readonly vouchers: IVoucherRepository,
    private readonly settlement: VoucherSettlement,
    private readonly vaultRelease: VaultRelease,
  ) {}

  public async execute(event: PayPalEvent): Promise<void> {
    const isNew = await this.vouchers.rememberEvent({ id: event.id, type: event.event_type, payload: event });
    if (!isNew) {
      return;
    }
    try {
      await this.apply(event);
    } catch (error) {
      await this.vouchers.forgetEvent(event.id);
      throw error;
    }
  }


  private apply({ event_type: type, resource }: PayPalEvent): Promise<void> {
    switch (type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        return this.withVoucher(resource, (voucher) =>
          this.settlement.markCompleted(voucher, String(resource.id)));
      case 'PAYMENT.CAPTURE.PENDING':
        return this.withVoucher(resource, (voucher) =>
          this.settlement.markPending(voucher, String(resource.id)));
      case 'PAYMENT.CAPTURE.DECLINED':
      case 'PAYMENT.CAPTURE.DENIED':
        return this.withVoucher(resource, (voucher) => this.settlement.markBlocked(voucher, type));
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED':
        return this.withVoucher(resource, (voucher) => this.settlement.markReversed(voucher, type));
      case 'PAYMENT.AUTHORIZATION.VOIDED':
        return this.closeVoided(String(resource.id));
      case 'CHECKOUT.PAYMENT-APPROVAL.REVERSED':
        return this.abandonOrder(String(resource.order_id ?? resource.id));
      default:
        console.warn(`Ignoring PayPal event ${type}`);
        return Promise.resolve();
    }
  }


  private async withVoucher(
    resource: Record<string, unknown>,
    apply: (voucher: Voucher) => Promise<void>,
  ): Promise<void> {
    const voucher = await this.findVoucher(resource);
    if (voucher) {
      await apply(voucher);
    } else {
      console.warn(`PayPal event ${String(resource.id)} matches no voucher`);
    }
  }


  private async findVoucher(resource: Record<string, unknown>): Promise<Voucher | null> {
    const { vouchers } = this;
    const invoiced = typeof resource.invoice_id === 'string' ? await vouchers.findById(resource.invoice_id) : null;
    if (invoiced) {
      return invoiced;
    }
    const links = (resource.links ?? []) as ResourceLink[];
    const captureLink = links.find(({ rel }) => rel === CAPTURE_LINK_RELATION);
    const captureId = captureLink?.href.split('/').at(-1) ?? String(resource.id);
    return vouchers.findByCaptureId(captureId);
  }


  private async closeVoided(authorizationId: string): Promise<void> {
    const vault = await this.vaults.findByAuthorizationId(authorizationId);
    if (vault) {
      await this.vaultRelease.close(vault.id);
    }
  }


  private async abandonOrder(orderId: string): Promise<void> {
    const vault = await this.vaults.findByOrderId(orderId);
    if (vault) {
      await this.vaults.abandon(vault.id);
    }
  }
}
