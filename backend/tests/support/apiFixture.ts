import request from 'supertest';
import { afterEach } from 'vitest';
import type { Language } from '@tpay/shared/contracts/statuses';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import type { RegistrationProofPayload } from '@tpay/shared/contracts/messages';
import { signingInput } from '@tpay/shared/domain/canonicalJson';
import { NodeP256Signer } from '../../src/adapters/crypto/NodeP256Signer';
import { NodeRandom } from '../../src/adapters/system/NodeRandom';
import { createApp, type AppDependencies } from '../../src/app';
import { createBackgroundJobs } from '../../src/composition/createBackgroundJobs';
import { FakeAssistantModel } from './FakeAssistantModel';
import { FakePaymentGateway } from './FakePaymentGateway';
import { inMemoryStorage, postgresStorage, type Storage } from './storage';





export const NOW = new Date('2026-11-06T10:00:00.000Z');
const signer = new NodeP256Signer();


export interface RegisteredDevice {
  deviceId: string;
  keyId: string;
  deviceToken: string;
  publicKey: string;
  privateKey: string;
}

interface FixtureOptions {
  databaseIsUp?: boolean;
  storage?: Storage;
}

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function defaultStorage(): Promise<Storage> {
  const { close, storage } = await (process.env.API_STORAGE === 'postgres' ? postgresStorage() : inMemoryStorage());
  closers.push(close);
  return storage;
}

export async function createApiFixture({ databaseIsUp = true, storage }: FixtureOptions = {}) {
  const chosenStorage = storage ?? await defaultStorage();
  const root = await signer.generateKeyPair();
  const { transactions, vaults, vouchers, wallet } = chosenStorage;
  const gateway = new FakePaymentGateway();
  const assistant = new FakeAssistantModel();
  const time = { now: NOW };

  const dependencies: AppDependencies = {
    ...chosenStorage,
    gateway,
    assistant,
    checkDatabase: async () => databaseIsUp,
    paypalMode: 'sandbox',
    fxRate: '1500.00',
    publicBaseUrl: 'https://tpay.test',
    signer,
    random: new NodeRandom(),
    clock: { now: () => time.now },
    rootPrivateKey: root.privateKey,
    rootPublicKey: root.publicKey,
  };
  const app = createApp(dependencies);
  const jobs = createBackgroundJobs(dependencies);

  const registration = async (overrides: Partial<RegistrationProofPayload> = {}) => {
    const keys = await signer.generateKeyPair();
    const payload: RegistrationProofPayload = {
      publicKey: keys.publicKey,
      displayName: 'Mama Nkechi Provisions',
      language: 'pcm' as Language,
      payoutEmail: 'merchant-sandbox@example.com',
      ...overrides,
    };
    const proof = await signer.sign(signingInput(MESSAGE_PREFIX.REGISTRATION, payload), keys.privateKey);
    return { ...payload, proof };
  };

  const registerDevice = async (name = 'Mama Nkechi Provisions') => {
    const keys = await signer.generateKeyPair();
    const proof = await signer.sign(
      signingInput(MESSAGE_PREFIX.REGISTRATION, {
        publicKey: keys.publicKey,
        displayName: name,
        language: 'pcm',
        payoutEmail: 'merchant-sandbox@example.com',
      }),
      keys.privateKey,
    );
    const response = await request(app).post('/api/devices/register').send({
      publicKey: keys.publicKey,
      displayName: name,
      language: 'pcm',
      payoutEmail: 'merchant-sandbox@example.com',
      proof,
    });
    return { ...response.body.data, ...keys } as RegisteredDevice;
  };

  return {
    app, jobs, root, signer, time, transactions, vaults, vouchers, wallet, gateway, assistant, registration, registerDevice,
  };
}