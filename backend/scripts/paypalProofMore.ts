// The sandbox checks paypalProof.ts does not cover: reauthorizing a hold (twice), taking a payment
// in one step the way Add money and pay links do, and following a payout to its end.
// Sandbox only. It prints what PayPal really answered, so a surprise is visible and not hidden.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { PayPalGateway } from '../src/adapters/paypal/PayPalGateway';

const HOLD_USD_MINOR = 300;
const DEPOSIT_USD_MINOR = 150;
const PAYOUT_USD_MINOR = 50;
const POLL_SECONDS = 5;
const POLL_TRIES = 12;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from backend/.env`);
  return value;
}

const baseUrl = required('PAYPAL_BASE_URL');
if (!baseUrl.includes('sandbox')) throw new Error('This proof only runs against the PayPal sandbox');

const gateway = new PayPalGateway({ clientId: required('PAYPAL_CLIENT_ID'), clientSecret: required('PAYPAL_CLIENT_SECRET'), baseUrl });
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const id = `proof_${randomUUID()}`;
const wait = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

console.log('\n== A. Reauthorize a hold, twice ==');
console.log('PayPal guarantees a hold for 3 days. T-Pay keeps a vault open for about 28 days by reauthorizing.');
console.log('PayPal\'s own docs disagree on whether that can be done more than once, so this asks PayPal directly.\n');
const hold = await gateway.createOrder({ requestId: `${id}-order`, vaultId: id, amountUsdMinor: HOLD_USD_MINOR, returnUrl: 'https://example.com/approved', cancelUrl: 'https://example.com/cancelled' });
console.log(`Approve this hold with your sandbox PERSONAL account:\n\n${hold.approvalUrl}\n`);
await prompt.question('Press Enter after you approve it... ');
const held = await gateway.authorizeOrder({ requestId: `${id}-authorize`, orderId: hold.orderId });
if (!held) throw new Error('PayPal says the order is not approved yet');
console.log(`Held: ${held.authorizationId}, expires ${held.expiresAt?.toISOString() ?? 'not stated'}`);

const first = await gateway.reauthorize({ authorizationId: held.authorizationId, requestId: `${id}-re1`, amountUsdMinor: HOLD_USD_MINOR });
console.log('First reauthorize:', first);
if (first.outcome === 'REAUTHORIZED') {
  const second = await gateway.reauthorize({ authorizationId: first.authorizationId, requestId: `${id}-re2`, amountUsdMinor: HOLD_USD_MINOR });
  console.log('Second reauthorize:', second);
}
console.log('Note: PayPal may refuse before the 3-day honor period ends. A refusal here means "too early", not "only once".');
console.log('If it refuses with a reason, send it to the developer. To prove the real limit, repeat this after day 3.');
const open = first.outcome === 'REAUTHORIZED' ? first.authorizationId : held.authorizationId;
console.log('Release:', await gateway.voidAuthorization(open));

console.log('\n== B. Pay in one step (Add money and pay links) ==');
const deposit = await gateway.createCaptureOrder({ requestId: `${id}-dep-order`, depositId: `${id}-dep`, amountUsdMinor: DEPOSIT_USD_MINOR, returnUrl: 'https://example.com/approved', cancelUrl: 'https://example.com/cancelled' });
console.log(`Before approving, T-Pay must answer "not approved yet": ${JSON.stringify(await gateway.captureOrder({ requestId: `${id}-dep-early`, orderId: deposit.orderId }))}`);
console.log(`\nNow approve it with your sandbox PERSONAL account:\n\n${deposit.approvalUrl}\n`);
await prompt.question('Press Enter after you approve it... ');
const captured = await gateway.captureOrder({ requestId: `${id}-dep-capture`, orderId: deposit.orderId });
console.log('Capture:', captured);
console.log('Same request again must not charge twice:', await gateway.captureOrder({ requestId: `${id}-dep-capture`, orderId: deposit.orderId }));

console.log('\n== C. Payout, followed to its end ==');
const email = process.env.PAYPAL_PROOF_PAYOUT_EMAIL;
if (!email) {
  console.log('Skipped: set PAYPAL_PROOF_PAYOUT_EMAIL to a sandbox account email to test it.');
} else {
  const payout = await gateway.createPayout({ senderBatchId: `${id}-payout`, receiverEmail: email, amountUsdMinor: PAYOUT_USD_MINOR });
  console.log('Payout:', payout);
  if (payout.outcome === 'ACCEPTED') {
    for (let attempt = 1; attempt <= POLL_TRIES; attempt += 1) {
      const status = await gateway.getPayoutStatus(payout.batchId);
      console.log(`  status ${attempt}: ${status}`);
      if (status !== 'PENDING') break;
      await wait(POLL_SECONDS);
    }
  }
}
prompt.close();
console.log('\nDone. Paste everything above to the developer.');
