import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import type {
  SpendStatementPayload, VaultCertificatePayload, VoucherPayload,
} from '@tpay/shared/contracts/messages';
import { signingInput } from '@tpay/shared/domain/canonicalJson';
import { convertNgnToUsd } from '@tpay/shared/domain/convertNgnToUsd';
import { signMessage } from '@tpay/shared/domain/signedMessages';
import { Money } from '@tpay/shared/shared/domain/Money';
import { NodeP256Signer } from '../src/adapters/crypto/NodeP256Signer';
import { createPool } from '../src/adapters/persistence/database';
import { PostgresDeviceRepository } from '../src/adapters/persistence/PostgresDeviceRepository';
import { PostgresVaultRepository } from '../src/adapters/persistence/PostgresVaultRepository';
import type { Device, Vault } from '../src/services/ports';




const KEYS_DIRECTORY = fileURLToPath(new URL('../.postman', import.meta.url));
const USAGE = `Usage:
  npm run postman -- device <name> [payoutEmail]
  npm run postman -- voucher <payer> <payee> <sequence> <amountNgnMinor>
  npm run postman -- statement <payer> <lastSequence> <totalIssuedUsdMinor>`;

interface SavedKeys {
  publicKey: string;
  privateKey: string;
}


const signer = new NodeP256Signer();
const print = (body: object) => console.log(JSON.stringify(body, null, 2));
const keyFile = (name: string) => join(KEYS_DIRECTORY, `${name}.json`);


function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing from backend/.env`);
  }
  return value;
}


async function createDevice(name: string, payoutEmail = `${name}@example.com`): Promise<void> {
  const keys = await signer.generateKeyPair();
  await mkdir(KEYS_DIRECTORY, { recursive: true });
  await writeFile(keyFile(name), JSON.stringify(keys));

  const payload = { publicKey: keys.publicKey, displayName: name, language: 'en', payoutEmail };
  const proof = await signer.sign(signingInput(MESSAGE_PREFIX.REGISTRATION, payload), keys.privateKey);
  print({ ...payload, proof });
}


async function loadKeys(name: string): Promise<SavedKeys> {
  try {
    return JSON.parse(await readFile(keyFile(name), 'utf8')) as SavedKeys;
  } catch {
    throw new Error(`No keys for ${name}. Run: npm run postman -- device ${name}`);
  }
}


async function loadDevice(pool: pg.Pool, keys: SavedKeys, name: string): Promise<Device> {
  const device = await new PostgresDeviceRepository(pool).findByPublicKey(keys.publicKey);
  if (!device) {
    throw new Error(`${name} is not registered yet. Send POST /api/devices/register first.`);
  }
  return device;
}


async function loadLockedVault(pool: pg.Pool, device: Device): Promise<Vault> {
  const vault = await new PostgresVaultRepository(pool).findOpenForDevice(device.id);
  if (!vault?.spendBy) {
    throw new Error(`${device.displayName} has no locked vault. Finish POST /api/vaults and authorize first.`);
  }
  return vault;
}


function certificateFor(vault: Vault, device: Device) {
  return signMessage<VaultCertificatePayload>(
    MESSAGE_PREFIX.VAULT_CERTIFICATE,
    {
      vaultId: vault.id,
      keyId: device.keyId,
      authorisedUsdMinor: vault.authorisedUsdMinor,
      amountNgnMinor: vault.amountNgnMinor,
      fxRate: vault.fxRate,
      spendBy: (vault.spendBy as Date).toISOString(),
      settleBy: (vault.settleBy as Date).toISOString(),
    },
    requiredEnv('ROOT_PRIVATE_KEY'),
    signer,
  );
}


async function createVoucher(pool: pg.Pool, payerName: string, payeeName: string, sequence: number, amountNgnMinor: number) {
  const keys = await loadKeys(payerName);
  const payer = await loadDevice(pool, keys, payerName);
  const payee = await loadDevice(pool, await loadKeys(payeeName), payeeName);
  const vault = await loadLockedVault(pool, payer);
  const amountUsd = convertNgnToUsd(Money.fromMinor(amountNgnMinor, 'NGN').getValue(), vault.fxRate).getValue();

  const voucher = await signMessage<VoucherPayload>(
    MESSAGE_PREFIX.VOUCHER,
    {
      vaultId: vault.id,
      keyId: payer.keyId,
      deviceId: payer.id,
      sequence,
      amountNgnMinor,
      amountUsdMinor: amountUsd.minor,
      fxRate: vault.fxRate,
      payeeKeyId: payee.keyId,
      requestNonce: `postman_${sequence}`,
      issuedAt: new Date().toISOString(),
      expiresAt: (vault.spendBy as Date).toISOString(),
    },
    keys.privateKey,
    signer,
  );
  print({ voucher, vaultCertificate: await certificateFor(vault, payer) });
}


async function createStatement(pool: pg.Pool, payerName: string, lastSequence: number, totalIssuedUsdMinor: number) {
  const keys = await loadKeys(payerName);
  const payer = await loadDevice(pool, keys, payerName);
  const vault = await loadLockedVault(pool, payer);
  const spendStatement = await signMessage<SpendStatementPayload>(
    MESSAGE_PREFIX.SPEND_STATEMENT,
    { vaultId: vault.id, lastSequence, totalIssuedUsdMinor, issuedAt: new Date().toISOString() },
    keys.privateKey,
    signer,
  );
  print({ spendStatement });
}


async function main([command, first, second, third, fourth]: string[]): Promise<void> {
  if (command === 'device' && first) {
    await createDevice(first, second);
    return;
  }
  const pool = createPool(requiredEnv('DATABASE_URL'));
  try {
    if (command === 'voucher' && first && second && third && fourth) {
      await createVoucher(pool, first, second, Number(third), Number(fourth));
    } else if (command === 'statement' && first && second && third) {
      await createStatement(pool, first, Number(second), Number(third));
    } else {
      console.error(USAGE);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}


await main(process.argv.slice(2));
