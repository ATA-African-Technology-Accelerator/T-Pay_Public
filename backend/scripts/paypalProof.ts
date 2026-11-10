import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { PayPalGateway } from '../src/adapters/paypal/PayPalGateway';

const PROOF_AMOUNT_USD_MINOR = 300;
const FIRST_CAPTURE_USD_MINOR = 100;
const SECOND_CAPTURE_USD_MINOR = 50;
const PROOF_PAYOUT_USD_MINOR = 50;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing from backend/.env`);
  }
  return value;
}

const baseUrl = required('PAYPAL_BASE_URL');
if (!baseUrl.includes('sandbox')) {
  throw new Error('This proof only runs against the PayPal sandbox');
}

const gateway = new PayPalGateway({
  clientId: required('PAYPAL_CLIENT_ID'),
  clientSecret: required('PAYPAL_CLIENT_SECRET'),
  baseUrl,
});

const proofId = `proof_${randomUUID()}`;
const order = await gateway.createOrder({
  requestId: `${proofId}-order`,
  vaultId: proofId,
  amountUsdMinor: PROOF_AMOUNT_USD_MINOR,
  returnUrl: 'https://example.com/approved',
  cancelUrl: 'https://example.com/cancelled',
});
console.log(`1. Order created: ${order.orderId}`);
console.log(`2. Approve it with your sandbox PERSONAL account:\n\n${order.approvalUrl}\n`);

const prompt = createInterface({ input: process.stdin, output: process.stdout });
await prompt.question('Press Enter after you approve it... ');
prompt.close();

const authorization = await gateway.authorizeOrder({
  requestId: `${proofId}-authorize`,
  orderId: order.orderId,
});
if (!authorization) {
  throw new Error('PayPal says the order is not approved yet');
}
console.log(`3. Funds held: ${authorization.authorizationId} for ${authorization.amountUsdMinor} cents`);

for (const [step, amountUsdMinor] of [[4, FIRST_CAPTURE_USD_MINOR], [5, SECOND_CAPTURE_USD_MINOR]] as const) {
  const invoiceId = `${proofId}-${step}`;
  const capture = await gateway.capture({
    authorizationId: authorization.authorizationId,
    requestId: `${invoiceId}-capture`,
    invoiceId,
    amountUsdMinor,
  });
  console.log(`${step}. Partial capture of ${amountUsdMinor} cents:`, capture);

  const readBack = await gateway.findCapture({ orderId: order.orderId, invoiceId });
  console.log(`   Read back by invoice:`, readBack);
}

const released = await gateway.voidAuthorization(authorization.authorizationId);
console.log(`6. Release of the remaining hold: ${released}`);
console.log(
  released === 'VOIDED'
    ? 'The sandbox proof passed: hold, two partial captures, read-back and release.'
    : 'PayPal refused to void after partial captures. Send this result to the developer.',
);

const payoutEmail = process.env.PAYPAL_PROOF_PAYOUT_EMAIL;
if (payoutEmail) {
  const payout = await gateway.createPayout({
    senderBatchId: `${proofId}-payout`,
    receiverEmail: payoutEmail,
    amountUsdMinor: PROOF_PAYOUT_USD_MINOR,
  });
  console.log('7. Payout:', payout);
}
