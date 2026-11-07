import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayPalGateway } from '../../src/adapters/paypal/PayPalGateway';







const BASE_URL = 'https://api-m.sandbox.paypal.com';
const ORDER_URL = `${BASE_URL}/v2/checkout/orders`;
const CREATE_INPUT = {
  requestId: 'vlt_1-order',
  vaultId: 'vlt_1',
  amountUsdMinor: 667,
  returnUrl: 'https://tpay.test/return',
  cancelUrl: 'https://tpay.test/cancel',
};
const AUTHORIZE_INPUT = { requestId: 'vlt_1-authorize', orderId: 'ORDER-1' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const authorizedOrder = (status = 'CREATED') => ({
  id: 'ORDER-1',
  status: 'COMPLETED',
  purchase_units: [
    { payments: { authorizations: [{ id: 'AUTH-1', status, amount: { currency_code: 'USD', value: '6.67' } }] } },
  ],
});
const issue = (name: string) => json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: name }] });

describe('PayPalGateway', () => {
  type Route = (url: string, init: RequestInit) => Response | Promise<Response>;
  let route: Route;
  const fetchMock = vi.fn<typeof fetch>();
  let gateway: PayPalGateway;

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/v1/oauth2/token')) {
        return json(200, { access_token: 'token-1', expires_in: 3600 });
      }
      return route(String(url), init as RequestInit);
    });
    gateway = new PayPalGateway(
      { clientId: 'client', clientSecret: 'secret', baseUrl: BASE_URL },
      fetchMock,
    );
  });

  describe('createOrder', () => {
    beforeEach(() => {
      route = () =>
        json(200, {
          id: 'ORDER-1',
          status: 'PAYER_ACTION_REQUIRED',
          links: [
            { rel: 'self', href: `${ORDER_URL}/ORDER-1` },
            { rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1' },
          ],
        });
    });

    it('creates an AUTHORIZE order in US dollars', async () => {
      await gateway.createOrder(CREATE_INPUT);

      const { url, init, headers } = lastCall();
      expect(url).toBe(ORDER_URL);
      expect(headers).toMatchObject({
        Authorization: 'Bearer token-1',
        'PayPal-Request-Id': 'vlt_1-order',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(init.body as string)).toEqual({
        intent: 'AUTHORIZE',
        purchase_units: [
          { reference_id: 'vlt_1', custom_id: 'vlt_1', amount: { currency_code: 'USD', value: '6.67' } },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'T-Pay',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: 'https://tpay.test/return',
              cancel_url: 'https://tpay.test/cancel',
            },
          },
        },
      });
    });

    it.each([
      [5, '0.05'],
      [100, '1.00'],
      [123_456, '1234.56'],
    ])('formats %i cents exactly as %s', async (amountUsdMinor, value) => {
      await gateway.createOrder({ ...CREATE_INPUT, amountUsdMinor });

      const body = JSON.parse(lastCall().init.body as string);
      expect(body.purchase_units[0].amount.value).toBe(value);
    });

    it('returns the order id and approval link', async () => {
      expect(await gateway.createOrder(CREATE_INPUT)).toEqual({
        orderId: 'ORDER-1',
        approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1',
      });
    });

    it('fails clearly when PayPal sends no approval link', async () => {
      route = () => json(200, { id: 'ORDER-1', links: [] });

      await expect(gateway.createOrder(CREATE_INPUT)).rejects.toMatchObject({ code: 'PAYPAL_UNAVAILABLE' });
    });

    it.each([500, 503, 429, 400])('reports PayPal status %i as unavailable', async (status) => {
      route = () => json(status, { name: 'ERROR' });

      await expect(gateway.createOrder(CREATE_INPUT)).rejects.toMatchObject({ code: 'PAYPAL_UNAVAILABLE' });
    });

    it('reports a network failure as unavailable', async () => {
      route = () => Promise.reject(new TypeError('fetch failed'));

      await expect(gateway.createOrder(CREATE_INPUT)).rejects.toMatchObject({ code: 'PAYPAL_UNAVAILABLE' });
    });
  });

  describe('access token', () => {
    beforeEach(() => {
      route = () => json(200, { id: 'ORDER-1', links: [{ rel: 'payer-action', href: 'https://paypal.test' }] });
    });

    it('logs in with the client id and secret', async () => {
      await gateway.createOrder(CREATE_INPUT);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/v1/oauth2/token`);
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('client:secret').toString('base64')}`,
      );
      expect(init.body).toBe('grant_type=client_credentials');
    });

    it('reuses the token between calls', async () => {
      await gateway.createOrder(CREATE_INPUT);
      await gateway.createOrder(CREATE_INPUT);

      const logins = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/v1/oauth2/token'));
      expect(logins).toHaveLength(1);
    });

    it('logs in again when the token is about to expire', async () => {
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValue(0);
      await gateway.createOrder(CREATE_INPUT);
      now.mockReturnValue(3_590_000);
      await gateway.createOrder(CREATE_INPUT);
      now.mockRestore();

      const logins = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/v1/oauth2/token'));
      expect(logins).toHaveLength(2);
    });

    it('reports refused credentials as unavailable and is unreachable for health', async () => {
      fetchMock.mockImplementation(async () => json(401, { error: 'invalid_client' }));

      await expect(gateway.createOrder(CREATE_INPUT)).rejects.toMatchObject({ code: 'PAYPAL_UNAVAILABLE' });
      expect(await gateway.isReachable()).toBe(false);
    });

    it('is reachable when it can log in', async () => {
      expect(await gateway.isReachable()).toBe(true);
    });
  });

  describe('authorizeOrder', () => {
    it('authorizes with a stable request id', async () => {
      route = () => json(201, authorizedOrder());

      const result = await gateway.authorizeOrder(AUTHORIZE_INPUT);

      const { url, headers } = lastCall();
      expect(url).toBe(`${ORDER_URL}/ORDER-1/authorize`);
      expect(headers).toMatchObject({ 'PayPal-Request-Id': 'vlt_1-authorize', Prefer: 'return=representation' });
      expect(result).toEqual({ authorizationId: 'AUTH-1', amountUsdMinor: 667 });
    });

    it('returns null when the payer has not approved', async () => {
      route = () => issue('ORDER_NOT_APPROVED');

      expect(await gateway.authorizeOrder(AUTHORIZE_INPUT)).toBeNull();
    });

    it('reads the order back when it was already authorized', async () => {
      route = (url, init) => {
        if (url.endsWith('/authorize')) {
          return issue('ORDER_ALREADY_AUTHORIZED');
        }
        expect(url).toBe(`${ORDER_URL}/ORDER-1`);
        expect(init.method).toBe('GET');
        return json(200, authorizedOrder());
      };

      expect(await gateway.authorizeOrder(AUTHORIZE_INPUT)).toEqual({
        authorizationId: 'AUTH-1',
        amountUsdMinor: 667,
      });
    });

    it('never treats a denied authorization as locked funds', async () => {
      route = () => json(201, authorizedOrder('DENIED'));

      expect(await gateway.authorizeOrder(AUTHORIZE_INPUT)).toBeNull();
    });

    it('reports an unknown failure as unavailable', async () => {
      route = () => issue('SOMETHING_ELSE');

      await expect(gateway.authorizeOrder(AUTHORIZE_INPUT)).rejects.toMatchObject({ code: 'PAYPAL_UNAVAILABLE' });
    });
  });

  describe('voidAuthorization', () => {
    it('voids the authorization once', async () => {
      route = () => new Response(null, { status: 204 });

      await gateway.voidAuthorization('AUTH-1');

      const { url, headers, init } = lastCall();
      expect(url).toBe(`${BASE_URL}/v2/payments/authorizations/AUTH-1/void`);
      expect(init.method).toBe('POST');
      expect(headers['PayPal-Request-Id']).toBe('AUTH-1-void');
    });

    it('reports a hold that has really been voided', async () => {
      route = () => new Response(null, { status: 204 });

      expect(await gateway.voidAuthorization('AUTH-1')).toBe('VOIDED');
    });

    it('treats an already voided authorization as done', async () => {
      route = () => issue('PREVIOUSLY_VOIDED');

      expect(await gateway.voidAuthorization('AUTH-1')).toBe('VOIDED');
    });

    it('says when PayPal will not void a captured authorization', async () => {
      route = () => issue('PREVIOUSLY_CAPTURED');

      expect(await gateway.voidAuthorization('AUTH-1')).toBe('ALREADY_CAPTURED');
    });

    it('fails when PayPal is down', async () => {
      route = () => json(503, {});

      await expect(gateway.voidAuthorization('AUTH-1')).rejects.toMatchObject({ code: 'PAYPAL_UNAVAILABLE' });
    });
  });

  describe('capture', () => {
    const INPUT = { authorizationId: 'AUTH-1', requestId: 'vch_1-capture', invoiceId: 'vch_1', amountUsdMinor: 133 };
    const captureReply = (status: string) => json(201, { id: 'CAPTURE-1', status });

    it('captures part of the hold, naming the voucher as the invoice', async () => {
      route = () => captureReply('COMPLETED');

      await gateway.capture(INPUT);

      const { url, headers, init } = lastCall();
      expect(url).toBe(`${BASE_URL}/v2/payments/authorizations/AUTH-1/capture`);
      expect(headers['PayPal-Request-Id']).toBe('vch_1-capture');
      expect(JSON.parse(init.body as string)).toEqual({
        amount: { currency_code: 'USD', value: '1.33' },
        invoice_id: 'vch_1',
        final_capture: false,
      });
    });

    it.each([
      ['COMPLETED', { outcome: 'COMPLETED', captureId: 'CAPTURE-1' }],
      ['PENDING', { outcome: 'PENDING', captureId: 'CAPTURE-1' }],
      ['DECLINED', { outcome: 'BLOCKED', reason: 'CAPTURE_DECLINED' }],
      ['FAILED', { outcome: 'BLOCKED', reason: 'CAPTURE_FAILED' }],
    ])('maps capture status %s', async (status, expected) => {
      route = () => captureReply(status);

      expect(await gateway.capture(INPUT)).toEqual(expected);
    });

    it.each([
      'AUTHORIZATION_EXPIRED', 'AUTHORIZATION_VOIDED', 'AUTHORIZATION_DENIED', 'AUTHORIZATION_ALREADY_CAPTURED',
      'MAX_CAPTURE_AMOUNT_EXCEEDED', 'MAX_CAPTURE_COUNT_EXCEEDED', 'TRANSACTION_REFUSED', 'PAYER_CANNOT_PAY',
    ])('never retries %s', async (name) => {
      route = () => issue(name);

      expect(await gateway.capture(INPUT)).toEqual({ outcome: 'BLOCKED', reason: name });
    });

    it.each([
      ['a duplicate invoice', () => issue('DUPLICATE_INVOICE_ID')],
      ['a rate limit', () => json(429, {})],
      ['a conflict', () => json(409, {})],
      ['a server error', () => json(500, {})],
      ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
      ['an unreadable reply', () => new Response('<html>', { status: 200 })],
    ])('asks for a read-back after %s', async (_name, reply) => {
      route = reply as Route;

      expect(await gateway.capture(INPUT)).toEqual({ outcome: 'RETRY' });
    });

    it('blocks any other client error instead of retrying forever', async () => {
      route = () => json(400, { name: 'INVALID_REQUEST' });

      expect(await gateway.capture(INPUT)).toEqual({ outcome: 'BLOCKED', reason: 'INVALID_REQUEST' });
    });
  });

  describe('findCapture', () => {
    const order = {
      purchase_units: [
        {
          payments: {
            captures: [
              { id: 'CAPTURE-0', status: 'COMPLETED', invoice_id: 'vch_0' },
              { id: 'CAPTURE-1', status: 'COMPLETED', invoice_id: 'vch_1' },
            ],
          },
        },
      ],
    };

    it('finds a capture on the order by invoice', async () => {
      route = () => json(200, order);

      const found = await gateway.findCapture({ orderId: 'ORDER-1', invoiceId: 'vch_1' });

      expect(lastCall().url).toBe(`${ORDER_URL}/ORDER-1`);
      expect(found).toEqual({ outcome: 'COMPLETED', captureId: 'CAPTURE-1' });
    });

    it('returns null when no capture exists', async () => {
      route = () => json(200, order);

      expect(await gateway.findCapture({ orderId: 'ORDER-1', invoiceId: 'vch_9' })).toBeNull();
    });
  });

  describe('createPayout', () => {
    const INPUT = { senderBatchId: 'wdr_1', receiverEmail: 'seller@example.com', amountUsdMinor: 133 };

    it('sends one payout, using the withdrawal as the batch id', async () => {
      route = () => json(201, { batch_header: { payout_batch_id: 'BATCH-1', batch_status: 'PENDING' } });

      const result = await gateway.createPayout(INPUT);

      const { url, init } = lastCall();
      expect(url).toBe(`${BASE_URL}/v1/payments/payouts`);
      expect(JSON.parse(init.body as string)).toEqual({
        sender_batch_header: {
          sender_batch_id: 'wdr_1',
          recipient_type: 'EMAIL',
          email_subject: 'Your T-Pay withdrawal',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            receiver: 'seller@example.com',
            sender_item_id: 'wdr_1',
            amount: { currency: 'USD', value: '1.33' },
          },
        ],
      });
      expect(result).toEqual({ outcome: 'ACCEPTED', batchId: 'BATCH-1' });
    });

    it('recovers the batch when PayPal says the id was already used', async () => {
      route = () => json(400, {
        name: 'USER_BUSINESS_ERROR',
        links: [{ rel: 'self', href: `${BASE_URL}/v1/payments/payouts/BATCH-OLD` }],
      });

      expect(await gateway.createPayout(INPUT)).toEqual({ outcome: 'ACCEPTED', batchId: 'BATCH-OLD' });
    });

    it.each([
      ['a server error', () => json(500, {})],
      ['a rate limit', () => json(429, {})],
      ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    ])('retries after %s', async (_name, reply) => {
      route = reply as Route;

      expect(await gateway.createPayout(INPUT)).toEqual({ outcome: 'RETRY' });
    });

    it('rejects a refused payout', async () => {
      route = () => json(422, { name: 'INSUFFICIENT_FUNDS' });

      expect(await gateway.createPayout(INPUT)).toEqual({ outcome: 'REJECTED', reason: 'INSUFFICIENT_FUNDS' });
    });
  });

  describe('getPayoutStatus', () => {
    const batch = (status: string, items: object[] = []) => () =>
      json(200, { batch_header: { batch_status: status }, items });

    it.each([
      ['SUCCESS', 'SUCCESS', 'COMPLETED'],
      ['SUCCESS', 'UNCLAIMED', 'PENDING'],
      ['SUCCESS', 'FAILED', 'FAILED'],
      ['SUCCESS', 'RETURNED', 'FAILED'],
      ['PROCESSING', 'PENDING', 'PENDING'],
    ])('maps batch %s with item %s to %s', async (batchStatus, itemStatus, expected) => {
      route = batch(batchStatus, [{ transaction_status: itemStatus }]);

      expect(await gateway.getPayoutStatus('BATCH-1')).toBe(expected);
      expect(lastCall().url).toBe(`${BASE_URL}/v1/payments/payouts/BATCH-1`);
    });

    it.each(['DENIED', 'CANCELED'])('fails a %s batch', async (status) => {
      route = batch(status);

      expect(await gateway.getPayoutStatus('BATCH-1')).toBe('FAILED');
    });

    it('stays pending while the batch has no item yet', async () => {
      route = batch('PENDING');

      expect(await gateway.getPayoutStatus('BATCH-1')).toBe('PENDING');
    });
  });

  describe('verifyWebhook', () => {
    const rawBody = '{"id":"WH-1","event_type":"PAYMENT.CAPTURE.COMPLETED"}';
    const headers = {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/cert',
      'paypal-transmission-id': 'tx-1',
      'paypal-transmission-sig': 'sig',
      'paypal-transmission-time': '2026-11-06T10:00:00Z',
    };
    const verified = (status: string) => () => json(200, { verification_status: status });
    const withWebhook = () => new PayPalGateway(
      { clientId: 'client', clientSecret: 'secret', baseUrl: BASE_URL, webhookId: 'WEBHOOK-1' },
      fetchMock,
    );

    it('asks PayPal to check the original bytes of the event', async () => {
      route = verified('SUCCESS');

      expect(await withWebhook().verifyWebhook({ headers, rawBody })).toBe(true);

      const { url, init } = lastCall();
      expect(url).toBe(`${BASE_URL}/v1/notifications/verify-webhook-signature`);
      expect(init.body).toContain(`"webhook_event":${rawBody}`);
      expect(JSON.parse(init.body as string)).toMatchObject({
        auth_algo: 'SHA256withRSA',
        cert_url: 'https://api.sandbox.paypal.com/cert',
        transmission_id: 'tx-1',
        transmission_sig: 'sig',
        transmission_time: '2026-11-06T10:00:00Z',
        webhook_id: 'WEBHOOK-1',
      });
    });

    it('refuses a failed verification', async () => {
      route = verified('FAILURE');

      expect(await withWebhook().verifyWebhook({ headers, rawBody })).toBe(false);
    });

    it('refuses everything when no webhook id is configured', async () => {
      route = verified('SUCCESS');

      expect(await gateway.verifyWebhook({ headers, rawBody })).toBe(false);
    });
  });
});
