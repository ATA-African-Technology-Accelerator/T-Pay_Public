import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import type {
  CompleteDepositResponse, CreateDepositRequest, CreateDepositResponse,
} from '@tpay/shared/contracts/api';
import { convertNgnToUsd, convertUsdToNgn } from '@tpay/shared/domain/convertNgnToUsd';
import { Money } from '@tpay/shared/shared/domain/Money';
import { ApiError } from './ApiError';
import type { Deposit, DepositSource, Device, IPaymentGateway, IWalletRepository, OrderCaptureResult } from './ports';




// A deposit below one dollar isn't worth a PayPal checkout; above this it is likely a typo.
const MIN_DEPOSIT_USD_MINOR = 100;
const MAX_DEPOSIT_NGN_MINOR = 1_000_000_000;
// A public pay link takes smaller amounts than a person adding to their own wallet.
export const MAX_LINK_PAYMENT_USD_MINOR = 50_000;


export interface DepositDependencies {
  wallet: IWalletRepository;
  gateway: IPaymentGateway;
  clock: IClock;
  random: IRandom;
  fxRate: string;
  publicBaseUrl: string;
}

export interface LinkCheckout {
  depositId: string;
  approvalUrl: string;
}

export type LinkReturn = 'COMPLETED' | 'PENDING' | 'NOT_APPROVED' | 'UNAVAILABLE' | 'UNKNOWN';


// Money in through PayPal. The payer approves a checkout, the dollars are captured into
// T-Pay's PayPal account, and the owner's Online wallet is credited once. The owner is the
// person adding to their own wallet (SELF) or whoever a pay link belongs to (LINK).
export class Deposits {
  constructor(private readonly dependencies: DepositDependencies) {}

  // ---- Adding to your own wallet, from the app ----

  public async create(device: Device, { amountNgnMinor }: CreateDepositRequest): Promise<CreateDepositResponse> {
    const { fxRate } = this.dependencies;
    const amount = Money.fromMinor(amountNgnMinor, 'NGN');
    const usd = amount.isSuccess && amountNgnMinor <= MAX_DEPOSIT_NGN_MINOR
      ? convertNgnToUsd(amount.getValue(), fxRate)
      : null;
    if (!usd || usd.isFailure || usd.getValue().minor < MIN_DEPOSIT_USD_MINOR) {
      throw new ApiError('VALIDATION_FAILED', 'This amount can not be added');
    }
    // PayPal takes whole cents, so what is credited is what those cents are worth, not the exact
    // naira typed. The two can differ by a few naira, and the reply says which it is.
    const amountUsdMinor = usd.getValue().minor;
    const worth = convertUsdToNgn(Money.fromMinor(amountUsdMinor, 'USD').getValue(), fxRate).getValue().minor;
    const { depositId, approvalUrl } = await this.checkout(device.id, 'SELF', amountUsdMinor, worth, (id, outcome) =>
      `${this.dependencies.publicBaseUrl}/api/paypal/return?${new URLSearchParams({ depositId: id, outcome })}`);
    return { depositId, amountNgnMinor: worth, amountUsdMinor, fxRate, approvalUrl };
  }


  public async complete(device: Device, depositId: string): Promise<CompleteDepositResponse> {
    const deposit = await this.dependencies.wallet.findDeposit(depositId);
    if (deposit?.deviceId !== device.id || deposit.source !== 'SELF') {
      throw new ApiError('VAULT_NOT_FOUND', 'This deposit does not exist');
    }
    if (deposit.status === 'COMPLETED') {
      return this.present(deposit);
    }
    if (deposit.status === 'CANCELLED') {
      throw new ApiError('ORDER_NOT_APPROVED', 'This deposit was cancelled');
    }
    const result = await this.capture(deposit);
    switch (result.outcome) {
      case 'NOT_APPROVED':
        throw new ApiError('ORDER_NOT_APPROVED', 'The payment has not been approved in PayPal yet');
      case 'RETRY':
      case 'BLOCKED':
        throw new ApiError('PAYPAL_UNAVAILABLE', 'PayPal could not complete the payment');
      case 'PENDING':
        return this.present(deposit, result.captureId, 'PENDING');
      default:
        return this.present(await this.credit(deposit, result.captureId));
    }
  }


  // ---- Someone paying through a pay link, with no T-Pay on their side ----

  /** The owner's name and device for a link, or null for a link that does not exist. */
  public async linkOwner(token: string): Promise<string | null> {
    return this.dependencies.wallet.findPayLinkOwner(token);
  }


  public async createForLink(token: string, ownerDeviceId: string, amountUsdMinor: number): Promise<LinkCheckout> {
    const { fxRate } = this.dependencies;
    if (!Number.isInteger(amountUsdMinor) || amountUsdMinor < MIN_DEPOSIT_USD_MINOR || amountUsdMinor > MAX_LINK_PAYMENT_USD_MINOR) {
      throw new ApiError('VALIDATION_FAILED', 'This amount can not be paid');
    }
    const amountNgnMinor = convertUsdToNgn(Money.fromMinor(amountUsdMinor, 'USD').getValue(), fxRate).getValue().minor;
    return this.checkout(ownerDeviceId, 'LINK', amountUsdMinor, amountNgnMinor, (id, outcome) =>
      `${this.dependencies.publicBaseUrl}/pay/${encodeURIComponent(token)}/return?${new URLSearchParams({ depositId: id, outcome })}`);
  }


  /**
   * PayPal sends the payer back here. The order token PayPal adds must match, so nobody can
   * trigger or cancel a payment just by guessing a deposit id.
   */
  public async finishLink(depositId: string, orderToken: string | undefined, outcome: 'approved' | 'cancelled'): Promise<LinkReturn> {
    const { clock, wallet } = this.dependencies;
    const deposit = await wallet.findDeposit(depositId);
    if (!deposit || deposit.source !== 'LINK' || deposit.orderId !== orderToken) {
      return 'UNKNOWN';
    }
    if (outcome === 'cancelled') {
      if (deposit.status === 'PENDING') {
        await wallet.withWalletLock(deposit.deviceId, (session) =>
          session.updateDeposit(deposit.id, { status: 'CANCELLED', updatedAt: clock.now() }));
      }
      return 'NOT_APPROVED';
    }
    if (deposit.status === 'COMPLETED') {
      return 'COMPLETED';
    }
    if (deposit.status === 'CANCELLED') {
      return 'NOT_APPROVED';
    }
    const result = await this.capture(deposit);
    switch (result.outcome) {
      case 'NOT_APPROVED': return 'NOT_APPROVED';
      case 'RETRY':
      case 'BLOCKED': return 'UNAVAILABLE';
      case 'PENDING': return 'PENDING';
      default:
        await this.credit(deposit, result.captureId);
        return 'COMPLETED';
    }
  }


  // ---- Shared ----

  // Called when PayPal sends the app's payer back after cancelling. The order id must match.
  public async cancel(depositId: string, orderToken: string | undefined): Promise<void> {
    const { clock, wallet } = this.dependencies;
    const deposit = await wallet.findDeposit(depositId);
    if (deposit?.status === 'PENDING' && deposit.source === 'SELF' && deposit.orderId === orderToken) {
      await wallet.withWalletLock(deposit.deviceId, (session) =>
        session.updateDeposit(deposit.id, { status: 'CANCELLED', updatedAt: clock.now() }));
    }
  }


  private async checkout(
    deviceId: string,
    source: DepositSource,
    amountUsdMinor: number,
    amountNgnMinor: number,
    returnUrl: (depositId: string, outcome: 'approved' | 'cancelled') => string,
  ): Promise<LinkCheckout> {
    const { clock, gateway, random, wallet } = this.dependencies;
    const id = `dep_${random.uuid()}`;
    const order = await gateway.createCaptureOrder({
      requestId: `${id}-order`,
      depositId: id,
      amountUsdMinor,
      returnUrl: returnUrl(id, 'approved'),
      cancelUrl: returnUrl(id, 'cancelled'),
    });
    const now = clock.now();
    await wallet.withWalletLock(deviceId, (session) => session.insertDeposit({
      id,
      deviceId,
      source,
      orderId: order.orderId,
      amountUsdMinor,
      amountNgnMinor,
      status: 'PENDING',
      paypalCaptureId: null,
      createdAt: now,
      updatedAt: now,
    }));
    return { depositId: id, approvalUrl: order.approvalUrl };
  }


  private capture(deposit: Deposit): Promise<OrderCaptureResult> {
    return this.dependencies.gateway.captureOrder({ requestId: `${deposit.id}-capture`, orderId: deposit.orderId });
  }


  // The status is read again inside the lock, so two calls at once credit the wallet once.
  // The database also allows one credit per deposit, as a second line of defence.
  private credit(deposit: Deposit, captureId: string): Promise<Deposit> {
    const { clock, random, wallet } = this.dependencies;
    return wallet.withWalletLock(deposit.deviceId, async (session) => {
      const current = (await wallet.findDeposit(deposit.id)) as Deposit;
      if (current.status === 'COMPLETED') {
        return current;
      }
      const now = clock.now();
      const viaLink = current.source === 'LINK';
      await session.addLedgerEntry({
        id: `led_${random.uuid()}`,
        deviceId: current.deviceId,
        type: viaLink ? 'PAYMENT_LINK' : 'DEPOSIT',
        amountUsdMinor: current.amountUsdMinor,
        amountNgnMinor: current.amountNgnMinor,
        voucherId: null,
        withdrawalId: null,
        depositId: current.id,
        paypalCaptureId: captureId,
        createdAt: now,
      });
      await session.addEvent({
        id: `txn_${current.id}_completed`,
        deviceId: current.deviceId,
        type: viaLink ? 'PAYMENT_LINK_RECEIVED' : 'DEPOSIT_COMPLETED',
        amountNgnMinor: current.amountNgnMinor,
        amountUsdMinor: current.amountUsdMinor,
        vaultId: null,
        voucherId: null,
        paypalReferenceId: captureId,
        occurredAt: now,
      });
      return session.updateDeposit(current.id, { status: 'COMPLETED', paypalCaptureId: captureId, updatedAt: now });
    });
  }


  private present(deposit: Deposit, captureId = deposit.paypalCaptureId, status: 'COMPLETED' | 'PENDING' = 'COMPLETED'): CompleteDepositResponse {
    return {
      depositId: deposit.id,
      status,
      amountNgnMinor: deposit.amountNgnMinor,
      amountUsdMinor: deposit.amountUsdMinor,
      paypalCaptureId: captureId,
    };
  }
}
