import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../services/ApiError';
import type { Deposits, LinkReturn } from '../services/Deposits';
import { MAX_LINK_PAYMENT_USD_MINOR } from '../services/Deposits';
import type { IDeviceRepository } from '../services/ports';




const PAY_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// "12", "12.5" or "12.50" dollars, never more than two decimals, as whole cents.
const toCents = (text: unknown): number | null => {
  if (typeof text !== 'string' || !/^\d{1,4}(\.\d{1,2})?$/.test(text.trim())) {
    return null;
  }
  return Math.round(Number(text.trim()) * 100);
};

const PAGE = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050608; color: #f3f5f9; font: 16px/1.5 system-ui, sans-serif; }
  main { width: min(92vw, 420px); background: #111317; border-radius: 24px; padding: 28px; }
  h1 { font-size: 22px; margin: 0 0 6px; } p { color: #9aa6b8; margin: 0 0 18px; }
  label { display: block; font-weight: 600; margin-bottom: 6px; }
  input { box-sizing: border-box; width: 100%; font: inherit; color: inherit; background: #1a1e24; border: 1px solid #262b33; border-radius: 16px; padding: 14px 16px; }
  button { width: 100%; margin-top: 18px; font: inherit; font-weight: 600; color: #07090d; background: #f3f5f9; border: 0; border-radius: 16px; padding: 16px; cursor: pointer; }
  small { display: block; color: #9aa6b8; margin-top: 14px; }
  .ok { color: #6fd98c; } .warn { color: #f0b64a; }
</style></head><body><main>${body}</main></body></html>`;

// The page loads nothing from anywhere and can only send its form to this site or PayPal.
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://www.sandbox.paypal.com https://www.paypal.com; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

const RESULT_COPY: Record<LinkReturn, { title: string; body: string }> = {
  COMPLETED: { title: 'Payment sent', body: '<p class="ok">Thank you. Your payment went through.</p>' },
  PENDING: { title: 'Payment processing', body: '<p class="warn">PayPal is still confirming your payment. It will reach them once it does.</p>' },
  NOT_APPROVED: { title: 'Nothing was paid', body: '<p>The payment was cancelled or not approved, so nothing was taken. You can go back and try again.</p>' },
  UNAVAILABLE: { title: 'Please try again', body: '<p class="warn">PayPal could not finish the payment. Check your PayPal account before paying again.</p>' },
  UNKNOWN: { title: 'Link not found', body: '<p>This payment link does not exist.</p>' },
};


// The public page behind a pay link: anyone can open it and pay the account's owner by PayPal,
// with no T-Pay on their side. Every name shown is escaped, and the owner's email is never shown.
export class PayPageController {
  constructor(private readonly deposits: Deposits, private readonly devices: IDeviceRepository) {}

  private send(response: Response, status: number, title: string, body: string) {
    response.set(SECURITY_HEADERS).status(status).type('html').send(PAGE(title, body));
  }

  private async owner(token: string) {
    // Links are made from base64url nonces. Anything else (a null byte, a 5,000-character path)
    // is unknown without asking the database, which would refuse some of it with an error.
    if (!PAY_TOKEN.test(token)) {
      return null;
    }
    const deviceId = await this.deposits.linkOwner(token);
    const device = deviceId ? await this.devices.findById(deviceId) : null;
    return device && !device.revokedAt ? { deviceId: device.id, name: device.displayName } : null;
  }

  public form = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const token = String(request.params.token);
      const owner = await this.owner(token);
      if (!owner) {
        return this.send(response, 404, RESULT_COPY.UNKNOWN.title, RESULT_COPY.UNKNOWN.body);
      }
      this.send(response, 200, `Pay ${owner.name}`, `
        <h1>Pay ${escape(owner.name)}</h1>
        <p>Pay by PayPal. They do not need to be on your phone, and you do not need T-Pay.</p>
        <form method="post" action="/pay/${encodeURIComponent(token)}">
          <label for="amount">Amount in US dollars</label>
          <input id="amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="10.00" required>
          <button type="submit">Continue to PayPal</button>
        </form>
        <small>PayPal sandbox. No real money moves. Up to $${MAX_LINK_PAYMENT_USD_MINOR / 100} a payment.</small>`);
    } catch (error) {
      next(error);
    }
  };

  public pay = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const token = String(request.params.token);
      const owner = await this.owner(token);
      if (!owner) {
        return this.send(response, 404, RESULT_COPY.UNKNOWN.title, RESULT_COPY.UNKNOWN.body);
      }
      const cents = toCents((request.body as Record<string, unknown> | undefined)?.amount);
      if (cents === null || cents < 100 || cents > MAX_LINK_PAYMENT_USD_MINOR) {
        return this.send(response, 400, 'Check the amount', `
          <h1>Check the amount</h1><p>Enter an amount from $1 to $${MAX_LINK_PAYMENT_USD_MINOR / 100}, like 10 or 10.50.</p>
          <a href="/pay/${encodeURIComponent(token)}" style="color:#8fb4f0">Go back</a>`);
      }
      const { approvalUrl } = await this.deposits.createForLink(token, owner.deviceId, cents);
      response.set(SECURITY_HEADERS).redirect(303, approvalUrl);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PAYPAL_UNAVAILABLE') {
        return this.send(response, 503, RESULT_COPY.UNAVAILABLE.title, RESULT_COPY.UNAVAILABLE.body);
      }
      next(error);
    }
  };

  public back = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { depositId, outcome, token } = request.query as Record<string, string | undefined>;
      if (!depositId || (outcome !== 'approved' && outcome !== 'cancelled')) {
        return this.send(response, 400, RESULT_COPY.UNKNOWN.title, RESULT_COPY.UNKNOWN.body);
      }
      const result = await this.deposits.finishLink(depositId, token, outcome);
      const copy = RESULT_COPY[result];
      this.send(response, result === 'UNKNOWN' ? 404 : 200, copy.title, `<h1>${escape(copy.title)}</h1>${copy.body}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PAYPAL_UNAVAILABLE') {
        return this.send(response, 503, RESULT_COPY.UNAVAILABLE.title, RESULT_COPY.UNAVAILABLE.body);
      }
      next(error);
    }
  };
}
