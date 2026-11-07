import { NodeP256Signer } from '../adapters/crypto/NodeP256Signer';
import { PayPalGateway } from '../adapters/paypal/PayPalGateway';
import { createPool, isDatabaseReachable } from '../adapters/persistence/database';
import { PostgresDeviceRepository } from '../adapters/persistence/PostgresDeviceRepository';
import { PostgresIdempotencyStore } from '../adapters/persistence/PostgresIdempotencyStore';
import { PostgresTransactionRepository } from '../adapters/persistence/PostgresTransactionRepository';
import { PostgresVaultRepository } from '../adapters/persistence/PostgresVaultRepository';
import { PostgresVoucherRepository } from '../adapters/persistence/PostgresVoucherRepository';
import { PostgresWalletRepository } from '../adapters/persistence/PostgresWalletRepository';
import { NodeRandom } from '../adapters/system/NodeRandom';
import { SystemClock } from '../adapters/system/SystemClock';
import type { AppDependencies } from '../app';





const DEFAULT_FX_RATE = '1500.00';

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function createDependencies(env: NodeJS.ProcessEnv): AppDependencies {
  const pool = createPool(required(env, 'DATABASE_URL'));
  const paypalBaseUrl = required(env, 'PAYPAL_BASE_URL');
  return {
    devices: new PostgresDeviceRepository(pool),
    transactions: new PostgresTransactionRepository(pool),
    vaults: new PostgresVaultRepository(pool),
    vouchers: new PostgresVoucherRepository(pool),
    wallet: new PostgresWalletRepository(pool),
    idempotency: new PostgresIdempotencyStore(pool),
    gateway: new PayPalGateway({
      clientId: required(env, 'PAYPAL_CLIENT_ID'),
      clientSecret: required(env, 'PAYPAL_CLIENT_SECRET'),
      baseUrl: paypalBaseUrl,
      ...(env.PAYPAL_WEBHOOK_ID ? { webhookId: env.PAYPAL_WEBHOOK_ID } : {}),
    }),
    checkDatabase: () => isDatabaseReachable(pool),
    paypalMode: paypalBaseUrl.includes('sandbox') ? 'sandbox' : 'live',
    fxRate: env.FX_RATE ?? DEFAULT_FX_RATE,
    publicBaseUrl: required(env, 'PUBLIC_BASE_URL'),
    signer: new NodeP256Signer(),
    random: new NodeRandom(),
    clock: new SystemClock(),
    rootPrivateKey: required(env, 'ROOT_PRIVATE_KEY'),
    rootPublicKey: required(env, 'ROOT_PUBLIC_KEY'),
  };
}