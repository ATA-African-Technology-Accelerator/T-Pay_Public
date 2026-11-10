import { ApiError } from '../../services/ApiError';
import type {
  AuthorizeOrderInput, CaptureInput, CaptureOrderInput, CaptureResult, CreateCaptureOrderInput, CreateOrderInput,
  FindCaptureInput, IPaymentGateway, OrderCaptureResult, PaymentAuthorization, PaymentOrder, PayoutInput, PayoutResult, PayoutStatus,
  ReauthorizeInput, ReauthorizeResult, VoidResult, WebhookNotification,
} from '../../services/ports';






const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
// The first call after the server has been idle is the slowest: a cold connection and a
// fresh login. One quick retry turns that into a short wait instead of a failed screen.
const RETRY_DELAY_MS = 700;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const CENTS_PER_DOLLAR = 100;
const USD_VALUE_PATTERN = /^\d+\.\d{2}$/;
const ALREADY_VOIDED_ISSUES = ['PREVIOUSLY_VOIDED', 'AUTHORIZATION_VOIDED'];
const RETRY_STATUSES = [408, 409, 429];
const SERVER_ERROR_STATUS = 500;
const DUPLICATE_INVOICE_ISSUE = 'DUPLICATE_INVOICE_ID';
const PAYOUTS_PATH = '/v1/payments/payouts';
const FAILED_BATCHES = ['DENIED', 'CANCELED'];
const FAILED_ITEMS = ['FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED'];


export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webhookId?: string;
}


interface PayPalReply {
  ok: boolean;
  status: number;
  body: any;
}


interface RequestOptions {
  method: 'GET' | 'POST';
  body?: unknown;
  rawBody?: string;
  requestId?: string;
}


const toUsdValue = (cents: number) => {
  const dollars = Math.floor(cents / CENTS_PER_DOLLAR);
  return `${dollars}.${String(cents % CENTS_PER_DOLLAR).padStart(2, '0')}`;
};


const unavailable = (detail: string) => {
  console.error(`PayPal request failed: ${detail}`);
  return new ApiError('PAYPAL_UNAVAILABLE', 'PayPal could not complete the request');
};


const firstIssue = (reply: PayPalReply): string | undefined => reply.body?.details?.[0]?.issue;


const toCaptureResult = ({ id, status }: { id: string; status: string }): CaptureResult => {
  if (status === 'COMPLETED' || status === 'PENDING') {
    return { outcome: status, captureId: id };
  }
  return { outcome: 'BLOCKED', reason: `CAPTURE_${status}` };
};

export class PayPalGateway implements IPaymentGateway {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: PayPalConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public createOrder(input: CreateOrderInput): Promise<PaymentOrder> {
    return this.placeOrder('AUTHORIZE', input.vaultId, input);
  }


  // Add money: the payer pays at once and the money is captured, with no hold in between.
  public createCaptureOrder(input: CreateCaptureOrderInput): Promise<PaymentOrder> {
    return this.placeOrder('CAPTURE', input.depositId, input);
  }


  public async captureOrder({ orderId, requestId }: CaptureOrderInput): Promise<OrderCaptureResult> {
    try {
      const reply = await this.request(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        requestId,
        body: {},
      });
      if (reply.ok) {
        return this.toOrderCapture(reply.body);
      }
      const issue = firstIssue(reply);
      if (issue === 'ORDER_NOT_APPROVED') {
        return { outcome: 'NOT_APPROVED' };
      }
      if (issue === 'ORDER_ALREADY_CAPTURED') {
        // A repeat of a capture that already worked: read it back instead of failing.
        const existing = await this.request(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
        return existing.ok ? this.toOrderCapture(existing.body) : { outcome: 'RETRY' };
      }
      if (RETRY_STATUSES.includes(reply.status) || reply.status >= SERVER_ERROR_STATUS) {
        return { outcome: 'RETRY' };
      }
      return { outcome: 'BLOCKED', reason: issue ?? reply.body?.name ?? `HTTP_${reply.status}` };
    } catch {
      return { outcome: 'RETRY' };
    }
  }


  private toOrderCapture(order: any): OrderCaptureResult {
    const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
    if (capture?.id && (capture.status === 'COMPLETED' || capture.status === 'PENDING')) {
      return { outcome: capture.status, captureId: capture.id };
    }
    return capture ? { outcome: 'BLOCKED', reason: `CAPTURE_${capture.status}` } : { outcome: 'NOT_APPROVED' };
  }


  private async placeOrder(
    intent: 'AUTHORIZE' | 'CAPTURE',
    reference: string,
    input: { requestId: string; amountUsdMinor: number; returnUrl: string; cancelUrl: string },
  ): Promise<PaymentOrder> {
    const reply = await this.request('/v2/checkout/orders', {
      method: 'POST',
      requestId: input.requestId,
      body: {
        intent,
        purchase_units: [
          {
            reference_id: reference,
            custom_id: reference,
            amount: { currency_code: 'USD', value: toUsdValue(input.amountUsdMinor) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'T-Pay',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      },
    });
    this.assertOk(reply, 'create order');

    const link = reply.body.links?.find(({ rel }: { rel: string }) => rel === 'payer-action' || rel === 'approve');
    if (!reply.body.id || !link?.href) {
      throw unavailable('create order returned no approval link');
    }
    return { orderId: reply.body.id, approvalUrl: link.href };
  }


  public async authorizeOrder({ orderId, requestId }: AuthorizeOrderInput): Promise<PaymentAuthorization | null> {
    const path = `/v2/checkout/orders/${encodeURIComponent(orderId)}`;
    const reply = await this.request(`${path}/authorize`, { method: 'POST', requestId, body: {} });

    if (firstIssue(reply) === 'ORDER_NOT_APPROVED') {
      return null;
    }
    if (firstIssue(reply) === 'ORDER_ALREADY_AUTHORIZED') {
      const order = await this.request(path, { method: 'GET' });
      this.assertOk(order, 'read order');
      return this.readAuthorization(order);
    }
    this.assertOk(reply, 'authorize order');
    return this.readAuthorization(reply);
  }


  public async capture(input: CaptureInput): Promise<CaptureResult> {
    try {
      const reply = await this.request(
        `/v2/payments/authorizations/${encodeURIComponent(input.authorizationId)}/capture`,
        {
          method: 'POST',
          requestId: input.requestId,
          body: {
            amount: { currency_code: 'USD', value: toUsdValue(input.amountUsdMinor) },
            invoice_id: input.invoiceId,
            final_capture: false,
          },
        },
      );
      return this.classifyCapture(reply);
    } catch {
      return { outcome: 'RETRY' };
    }
  }


  public async findCapture({ invoiceId, orderId }: FindCaptureInput): Promise<CaptureResult | null> {
    const reply = await this.request(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
    this.assertOk(reply, 'read order');
    const captures: Array<{ id: string; status: string; invoice_id?: string }> =
      reply.body.purchase_units?.[0]?.payments?.captures ?? [];
    const capture = captures.find((candidate) => candidate.invoice_id === invoiceId);
    return capture ? toCaptureResult(capture) : null;
  }


  public async voidAuthorization(authorizationId: string): Promise<VoidResult> {
    const reply = await this.request(
      `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
      { method: 'POST', requestId: `${authorizationId}-void` },
    );
    const issue = firstIssue(reply) ?? '';
    if (issue === 'PREVIOUSLY_CAPTURED') {
      return 'ALREADY_CAPTURED';
    }
    if (!ALREADY_VOIDED_ISSUES.includes(issue)) {
      this.assertOk(reply, 'void authorization');
    }
    return 'VOIDED';
  }


  // PayPal guarantees an authorisation only for its three-day honor period.
  // Reauthorising gives a new authorisation ID with a fresh honor period, so a
  // vault can wait for its customer without the money becoming spendable.
  public async reauthorize({ amountUsdMinor, authorizationId, requestId }: ReauthorizeInput): Promise<ReauthorizeResult> {
    try {
      const reply = await this.request(
        `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/reauthorize`,
        {
          method: 'POST',
          requestId,
          body: { amount: { currency_code: 'USD', value: toUsdValue(amountUsdMinor) } },
        },
      );
      if (reply.ok && reply.body?.id) {
        return { outcome: 'REAUTHORIZED', authorizationId: reply.body.id };
      }
      if (reply.ok || RETRY_STATUSES.includes(reply.status) || reply.status >= SERVER_ERROR_STATUS) {
        return { outcome: 'RETRY' };
      }
      return { outcome: 'REFUSED', reason: firstIssue(reply) ?? reply.body?.name ?? `HTTP_${reply.status}` };
    } catch {
      return { outcome: 'RETRY' };
    }
  }


  public async createPayout({ amountUsdMinor, receiverEmail, senderBatchId }: PayoutInput): Promise<PayoutResult> {
    try {
      // PayPal asks for an idempotency key on payouts as well as a unique batch id: a repeat of the
      // same payout, after a timeout or a 5xx, then returns the first one's state instead of paying twice.
      const reply = await this.request(PAYOUTS_PATH, {
        method: 'POST',
        requestId: senderBatchId,
        body: {
          sender_batch_header: {
            sender_batch_id: senderBatchId,
            recipient_type: 'EMAIL',
            email_subject: 'Your T-Pay withdrawal',
          },
          items: [
            {
              recipient_type: 'EMAIL',
              receiver: receiverEmail,
              sender_item_id: senderBatchId,
              amount: { currency: 'USD', value: toUsdValue(amountUsdMinor) },
            },
          ],
        },
      });
      return this.classifyPayout(reply);
    } catch {
      return { outcome: 'RETRY' };
    }
  }


  public async getPayoutStatus(batchId: string): Promise<PayoutStatus> {
    const reply = await this.request(`${PAYOUTS_PATH}/${encodeURIComponent(batchId)}`, { method: 'GET' });
    this.assertOk(reply, 'read payout');
    const item: string | undefined = reply.body.items?.[0]?.transaction_status;
    if (FAILED_BATCHES.includes(reply.body.batch_header?.batch_status) || FAILED_ITEMS.includes(item ?? '')) {
      return 'FAILED';
    }
    return item === 'SUCCESS' ? 'COMPLETED' : 'PENDING';
  }


  public async verifyWebhook({ headers, rawBody }: WebhookNotification): Promise<boolean> {
    const { webhookId } = this.config;
    if (!webhookId) {
      return false;
    }
    const fields = JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
    });
    const reply = await this.request('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      rawBody: `${fields.slice(0, -1)},"webhook_event":${rawBody}}`,
    });
    this.assertOk(reply, 'verify webhook');
    return reply.body?.verification_status === 'SUCCESS';
  }


  public async isReachable(): Promise<boolean> {
    try {
      await this.accessToken();
      return true;
    } catch {
      return false;
    }
  }


  private classifyPayout(reply: PayPalReply): PayoutResult {
    const links: Array<{ href: string }> = reply.body?.links ?? [];
    const original = links.map(({ href }) => href).find((href) => href.includes(`${PAYOUTS_PATH}/`));
    const batchId = reply.ok ? reply.body?.batch_header?.payout_batch_id : original?.split('/').at(-1);
    if (batchId) {
      return { outcome: 'ACCEPTED', batchId };
    }
    if (reply.ok || RETRY_STATUSES.includes(reply.status) || reply.status >= SERVER_ERROR_STATUS) {
      return { outcome: 'RETRY' };
    }
    return { outcome: 'REJECTED', reason: reply.body?.name ?? `HTTP_${reply.status}` };
  }


  private classifyCapture(reply: PayPalReply): CaptureResult {
    const issue = firstIssue(reply);
    if (reply.ok) {
      return toCaptureResult(reply.body);
    }
    if (
      issue === DUPLICATE_INVOICE_ISSUE
      || RETRY_STATUSES.includes(reply.status)
      || reply.status >= SERVER_ERROR_STATUS
    ) {
      return { outcome: 'RETRY' };
    }
    return { outcome: 'BLOCKED', reason: issue ?? reply.body?.name ?? `HTTP_${reply.status}` };
  }


  private readAuthorization(reply: PayPalReply): PaymentAuthorization | null {
    const authorization = reply.body.purchase_units?.[0]?.payments?.authorizations?.[0];
    const value: unknown = authorization?.amount?.value;
    if (!authorization?.id || typeof value !== 'string' || !USD_VALUE_PATTERN.test(value)) {
      throw unavailable('authorization is missing from the PayPal reply');
    }
    if (authorization.status !== 'CREATED') {
      return null;
    }
    const expiresAt = new Date(authorization.expiration_time ?? Number.NaN);
    return {
      authorizationId: authorization.id,
      amountUsdMinor: Number(value.replace('.', '')),
      expiresAt: Number.isNaN(expiresAt.getTime()) ? null : expiresAt,
    };
  }

  private assertOk(reply: PayPalReply, action: string): void {
    if (!reply.ok) {
      throw unavailable(
        `${action} returned ${reply.status} ${reply.body?.name ?? ''} ${firstIssue(reply) ?? ''} ${reply.body?.debug_id ?? ''}`,
      );
    }
  }


  private async request(path: string, { method, body, rawBody, requestId }: RequestOptions): Promise<PayPalReply> {
    return this.send(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(rawBody === undefined ? {} : { body: rawBody }),
      // Only a call PayPal can recognise as a repeat (same PayPal-Request-Id) is retried,
      // so a retry can never create a second order, capture or payout.
    }, Boolean(requestId));
  }


  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) {
      return this.token.value;
    }
    const { clientId, clientSecret, baseUrl } = this.config;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const reply = await this.send(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }, true);
    if (!reply.ok || !reply.body?.access_token) {
      throw unavailable(`login returned ${reply.status}`);
    }
    this.token = {
      value: reply.body.access_token,
      expiresAt: Date.now() + Number(reply.body.expires_in) * 1000 - TOKEN_EXPIRY_MARGIN_MS,
    };
    return this.token.value;
  }

  
  private async send(url: string, init: RequestInit, retry = false): Promise<PayPalReply> {
    const attempts = retry ? 2 : 1;
    let failure: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.fetcher(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        const text = await response.text();
        const reply = { ok: response.ok, status: response.status, body: text ? JSON.parse(text) : null };
        if (attempt < attempts && TRANSIENT_STATUSES.has(response.status)) {
          await pause(RETRY_DELAY_MS);
          continue;
        }
        return reply;
      } catch (error) {
        failure = error;
        if (attempt < attempts) await pause(RETRY_DELAY_MS);
      }
    }
    throw unavailable(failure instanceof Error ? failure.message : 'unknown error');
  }
}
