import { ApiError } from '../../src/services/ApiError';
import type {
  AuthorizeOrderInput, CaptureInput, CaptureOrderInput, CaptureResult, CreateCaptureOrderInput, CreateOrderInput,
  FindCaptureInput, OrderCaptureResult,
  IPaymentGateway, PaymentAuthorization, PaymentOrder, PayoutInput, PayoutResult, PayoutStatus,
  ReauthorizeInput, ReauthorizeResult, VoidResult, WebhookNotification,
} from '../../src/services/ports';

export interface RecordedCapture extends CaptureInput {
  captureId: string;
}

export class FakePaymentGateway implements IPaymentGateway {
  public readonly orders: CreateOrderInput[] = [];
  public readonly authorizeCalls: AuthorizeOrderInput[] = [];
  public readonly voidedAuthorizations: string[] = [];
  public readonly captures: RecordedCapture[] = [];
  public readonly captureCalls: CaptureInput[] = [];
  public readonly plannedCaptures: Array<CaptureResult | 'TIMEOUT_AFTER_CAPTURE'> = [];
  public readonly webhooks: WebhookNotification[] = [];
  public readonly payouts: PayoutInput[] = [];
  public readonly plannedPayouts: PayoutResult[] = [];
  public payoutStatus: PayoutStatus = 'PENDING';
  public unavailable = false;
  public webhookIsValid = true;
  public voidResult: VoidResult = 'VOIDED';
  public authorizationExpiresAt: Date | null = null;
  public readonly reauthorizeCalls: ReauthorizeInput[] = [];
  public readonly plannedReauthorizations: ReauthorizeResult[] = [];
  private readonly approved = new Set<string>();

  public approve(orderId: string): void {
    this.approved.add(orderId);
  }

  public async createOrder(input: CreateOrderInput): Promise<PaymentOrder> {
    this.assertAvailable();
    this.orders.push(input);
    const orderId = `ORDER-${this.orders.length}`;
    return { orderId, approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}` };
  }

  public readonly captureOrders: CreateCaptureOrderInput[] = [];
  public readonly orderCaptureCalls: CaptureOrderInput[] = [];
  public readonly plannedOrderCaptures: OrderCaptureResult[] = [];
  private readonly orderCaptures = new Map<string, string>();
  // Counts every order ever made, so an id is never reused even when a test empties captureOrders.
  private ordersMade = 0;

  public async createCaptureOrder(input: CreateCaptureOrderInput): Promise<PaymentOrder> {
    this.assertAvailable();
    this.captureOrders.push(input);
    this.ordersMade += 1;
    const orderId = `DEP-ORDER-${this.ordersMade}`;
    return { orderId, approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}` };
  }

  // A repeat of the same order returns the capture it already made, as PayPal does.
  public async captureOrder(input: CaptureOrderInput): Promise<OrderCaptureResult> {
    this.orderCaptureCalls.push(input);
    const planned = this.plannedOrderCaptures.shift();
    if (planned) {
      return planned;
    }
    if (!this.approved.has(input.orderId)) {
      return { outcome: 'NOT_APPROVED' };
    }
    const captureId = this.orderCaptures.get(input.orderId) ?? `DEP-CAPTURE-${this.orderCaptures.size + 1}`;
    this.orderCaptures.set(input.orderId, captureId);
    return { outcome: 'COMPLETED', captureId };
  }

  public async authorizeOrder(input: AuthorizeOrderInput): Promise<PaymentAuthorization | null> {
    this.assertAvailable();
    this.authorizeCalls.push(input);
    if (!this.approved.has(input.orderId)) {
      return null;
    }
    const position = Number(input.orderId.replace('ORDER-', '')) - 1;
    return {
      authorizationId: `AUTH-${input.orderId}`,
      amountUsdMinor: (this.orders[position] as CreateOrderInput).amountUsdMinor,
      expiresAt: this.authorizationExpiresAt,
    };
  }

  public async reauthorize(input: ReauthorizeInput): Promise<ReauthorizeResult> {
    this.reauthorizeCalls.push(input);
    return this.plannedReauthorizations.shift()
      ?? { outcome: 'REAUTHORIZED', authorizationId: `${input.authorizationId}-R${this.reauthorizeCalls.length}` };
  }

  public async capture(input: CaptureInput): Promise<CaptureResult> {
    this.captureCalls.push(input);
    const planned = this.plannedCaptures.shift();
    if (planned && planned !== 'TIMEOUT_AFTER_CAPTURE') {
      return planned;
    }
    const known = this.captures.find(({ invoiceId }) => invoiceId === input.invoiceId);
    const captureId = known?.captureId ?? `CAPTURE-${this.captures.length + 1}`;
    if (!known) {
      this.captures.push({ ...input, captureId });
    }
    return planned ? { outcome: 'RETRY' } : { outcome: 'COMPLETED', captureId };
  }

  public async findCapture({ invoiceId }: FindCaptureInput): Promise<CaptureResult | null> {
    this.assertAvailable();
    const known = this.captures.find((capture) => capture.invoiceId === invoiceId);
    return known ? { outcome: 'COMPLETED', captureId: known.captureId } : null;
  }

  public async voidAuthorization(authorizationId: string): Promise<VoidResult> {
    this.assertAvailable();
    this.voidedAuthorizations.push(authorizationId);
    return this.voidResult;
  }

  public async createPayout(input: PayoutInput): Promise<PayoutResult> {
    this.payouts.push(input);
    return this.plannedPayouts.shift() ?? { outcome: 'ACCEPTED', batchId: `BATCH-${this.payouts.length}` };
  }

  public async getPayoutStatus(): Promise<PayoutStatus> {
    this.assertAvailable();
    return this.payoutStatus;
  }

  public async verifyWebhook(notification: WebhookNotification): Promise<boolean> {
    this.webhooks.push(notification);
    return this.webhookIsValid;
  }

  public async isReachable(): Promise<boolean> {
    return !this.unavailable;
  }

  private assertAvailable(): void {
    if (this.unavailable) {
      throw new ApiError('PAYPAL_UNAVAILABLE', 'PayPal could not be reached');
    }
  }
}
