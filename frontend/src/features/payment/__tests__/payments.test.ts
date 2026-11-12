/// <reference types="jest" />
/// <reference types="node" />
// Two phones, each with its own database, key and certificate, paying each other with
// the real payment activities, the real shared rules and real P-256 signatures. Only
// the network, secure storage and the T-Pay root are stand-ins.
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { ISigner } from '@tpay/shared/application/ports/crypto';
import { FRAME_TYPE } from '@tpay/shared/contracts/frames';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import type { DeviceCertificatePayload, VaultCertificatePayload } from '@tpay/shared/contracts/messages';
import { REFUSAL } from '@tpay/shared/contracts/refusals';
import { decodeFrame, encodeFrame } from '@tpay/shared/domain/frames';
import { signMessage } from '@tpay/shared/domain/signedMessages';
import { MemoryKv } from '../../../adapters/storage/kvCore';
import { LocalStore } from '../../../adapters/storage/localStore';

jest.mock('expo-web-browser', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('../../../session/guard', () => ({ withSession: (call: () => unknown) => call() }));

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'));

// The same formats as the backend: raw r‖s, low S, uncompressed public keys, base64url.
const signer: ISigner = {
  async generateKeyPair() {
    const secret = p256.utils.randomSecretKey();
    return { privateKey: b64(secret), publicKey: b64(p256.getPublicKey(secret, false)) };
  },
  async sign(input, privateKey) { return b64(p256.sign(utf8ToBytes(input), unb64(privateKey), { lowS: true, prehash: true })); },
  async verify(input, signature, publicKey) {
    try { return p256.verify(unb64(signature), utf8ToBytes(input), unb64(publicKey), { lowS: true, prehash: true }); } catch { return false; }
  },
  async hash(value) { return b64(sha256(utf8ToBytes(value))); },
};

let now = new Date('2026-11-10T10:00:00.000Z');
const clock = { now: () => now };
let counter = 0;
const random = { uuid: () => `u${++counter}`, nonce: () => b64(p256.utils.randomSecretKey()).slice(0, 22) };
const HOUR = 60 * 60 * 1000;

type Payments = typeof import('../payments');
type Vaults = typeof import('../../vault/vaultActivities');

interface Phone { name: string; store: LocalStore; payments: Payments; vaults: Vaults; keyId: string; api: { meltVault: jest.Mock } }

async function makePhone(name: string, root: { privateKey: string; publicKey: string }, vault?: Omit<VaultCertificatePayload, 'keyId'>): Promise<Phone> {
  const keys = await signer.generateKeyPair();
  const keyId = `key_${name}`;
  const certificate = await signMessage<DeviceCertificatePayload>(MESSAGE_PREFIX.DEVICE_CERTIFICATE, {
    deviceId: `dev_${name}`, keyId, publicKey: keys.publicKey, displayName: name, expiresAt: new Date(now.getTime() + 7 * 24 * HOUR).toISOString(),
  }, root.privateKey, signer);
  const session = { deviceId: `dev_${name}`, keyId, deviceToken: 'token', deviceCertificate: certificate };
  const store = new LocalStore(Promise.resolve(new MemoryKv()));
  const api = { meltVault: jest.fn(async (vaultId: string) => ({ vaultId, status: 'SPEND_CLOSED', releasedAt: null, releaseScheduledFor: 'later', blockingVoucherIds: [] })) };
  if (vault) {
    const vaultCertificate = await signMessage(MESSAGE_PREFIX.VAULT_CERTIFICATE, { ...vault, keyId }, root.privateKey, signer);
    await store.vaults.save({ vaultId: vault.vaultId, certificate: vaultCertificate, reservedUsdMinor: 0, settledUsdMinor: 0, nextSequence: 1, view: null, lockedAt: now.toISOString(), melt: null });
  }
  let payments!: Payments;
  let vaults!: Vaults;
  jest.isolateModules(() => {
    jest.doMock('../../../composition', () => ({ signer, clock, random, store, api, keyStore: { loadPrivateKey: async () => keys.privateKey } }));
    jest.doMock('../../../session/sessionStore', () => ({ sessionStore: { load: async () => session } }));
    jest.doMock('../../../config', () => ({ config: { rootPublicKey: root.publicKey } }));
    payments = require('../payments');
    vaults = require('../../vault/vaultActivities');
  });
  return { name, store, payments, vaults, keyId, api };
}

async function world() {
  now = new Date('2026-11-10T10:00:00.000Z');
  const root = await signer.generateKeyPair();
  const vault = {
    vaultId: 'vlt_1', authorisedUsdMinor: 667, amountNgnMinor: 1_000_000, fxRate: '1500.00',
    spendBy: new Date(now.getTime() + 24 * HOUR).toISOString(), settleBy: new Date(now.getTime() + 28 * 24 * HOUR).toISOString(),
  };
  const customer = await makePhone('Ada', root, vault);
  const merchant = await makePhone('Mama Nkechi', root);
  const other = await makePhone('Iya Bose', root);
  return { root, customer, merchant, other };
}

const value = <T,>(o: { ok: true; value: T } | { ok: false; code: string }): T => {
  if (!o.ok) throw new Error(`Refused: ${o.code}`);
  return o.value;
};

describe('an offline payment between two phones', () => {
  it('goes request, review, voucher, receipt, and both phones keep it', async () => {
    const { customer, merchant } = await world();
    const open = value(await merchant.payments.createRequest(200_000, true));
    expect(open.sessionCode).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(open.frame.startsWith('TPAY1:REQUEST:')).toBe(true);

    const scanned = value(await customer.payments.readRequest(open.frame));
    expect(scanned.review).toMatchObject({ merchantName: 'Mama Nkechi', amountNgnMinor: 200_000, amountUsdMinor: 133, fxRate: '1500.00' });
    expect(scanned.sessionCode).toBe(open.sessionCode);

    const paid = value(await customer.payments.pay(scanned));
    expect(paid.status).toBe('SIGNED');
    expect((await customer.store.vaults.findCurrent())?.nextSequence).toBe(2);

    const taken = value(await merchant.payments.takeVoucher(paid.frame, open));
    expect(taken).toMatchObject({ view: 'PAYEE', status: 'ACKNOWLEDGED', counterparty: 'Ada' });
    expect(await merchant.store.seen.hasSeen('vlt_1', 1)).toBe(true);

    const delivered = value(await customer.payments.takeReceipt(taken.frame, paid.id));
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.receipt?.payload.merchantKeyId).toBe(merchant.keyId);

    // QR byte mode at the lowest error correction holds 2,953 bytes.
    for (const frame of [open.frame, paid.frame, taken.frame]) expect(frame.length).toBeLessThan(2953);
  });

  it('refuses the same voucher twice and offers the receipt it already gave', async () => {
    const { customer, merchant } = await world();
    const open = value(await merchant.payments.createRequest(50_000, false));
    const paid = value(await customer.payments.pay(value(await customer.payments.readRequest(open.frame))));
    const first = value(await merchant.payments.takeVoucher(paid.frame, open));
    const again = await merchant.payments.takeVoucher(paid.frame, open);
    expect(again).toMatchObject({ ok: false, code: REFUSAL.DUPLICATE_VOUCHER });
    expect(again.ok === false && again.existing?.frame).toBe(first.frame);
  });

  it('refuses a voucher changed after signing', async () => {
    const { customer, merchant } = await world();
    const open = value(await merchant.payments.createRequest(50_000, false));
    const paid = value(await customer.payments.pay(value(await customer.payments.readRequest(open.frame))));
    const frame = decodeFrame(paid.frame).getValue();
    if (frame.type !== FRAME_TYPE.VOUCHER) throw new Error('not a voucher');
    const changed = encodeFrame({ ...frame, voucher: { ...frame.voucher, payload: { ...frame.voucher.payload, amountNgnMinor: 5_000_000 } } });
    expect(await merchant.payments.takeVoucher(changed, open)).toMatchObject({ ok: false, code: REFUSAL.INVALID_SIGNATURE });
    expect(await merchant.store.seen.hasSeen('vlt_1', 1)).toBe(false);
  });

  it('refuses more than the vault holds before anything is signed', async () => {
    const { customer, merchant } = await world();
    const open = value(await merchant.payments.createRequest(2_000_000, false));
    expect(await customer.payments.readRequest(open.frame)).toMatchObject({ ok: false, code: REFUSAL.INSUFFICIENT_VAULT_CAPACITY });
    expect(await customer.store.vouchers.list()).toHaveLength(0);
  });

  it('counts down capacity and numbers vouchers 1, 2, 3 with no gap', async () => {
    const { customer, merchant } = await world();
    for (const amount of [300_000, 300_000, 300_000]) {
      const open = value(await merchant.payments.createRequest(amount, false));
      value(await customer.payments.pay(value(await customer.payments.readRequest(open.frame))));
    }
    const fourth = value(await merchant.payments.createRequest(200_000, false));
    expect(await customer.payments.readRequest(fourth.frame)).toMatchObject({ ok: false, code: REFUSAL.INSUFFICIENT_VAULT_CAPACITY });
    const sequences = (await customer.store.vouchers.list()).map(v => v.voucher.payload.sequence).sort();
    expect(sequences).toEqual([1, 2, 3]);

    await customer.vaults.meltVault();
    const statement = customer.api.meltVault.mock.calls[0][1].spendStatement.payload;
    expect(statement).toMatchObject({ vaultId: 'vlt_1', lastSequence: 3, totalIssuedUsdMinor: 600 });
    // No signing after the spend statement.
    const late = value(await merchant.payments.createRequest(10_000, false));
    expect(await customer.payments.readRequest(late.frame)).toMatchObject({ ok: false, code: REFUSAL.VAULT_EXPIRED });
  });

  it('refuses paying yourself, someone else’s voucher, an expired request and a spent-out vault', async () => {
    const { customer, merchant, other } = await world();
    const mine = value(await customer.payments.createRequest(10_000, false));
    expect(await customer.payments.readRequest(mine.frame)).toMatchObject({ ok: false, code: REFUSAL.SELF_PAYMENT });

    const forMerchant = value(await merchant.payments.createRequest(10_000, false));
    const paid = value(await customer.payments.pay(value(await customer.payments.readRequest(forMerchant.frame))));
    const otherOpen = value(await other.payments.createRequest(10_000, false));
    expect(await other.payments.takeVoucher(paid.frame, otherOpen)).toMatchObject({ ok: false, code: REFUSAL.WRONG_PAYEE });

    const old = value(await merchant.payments.createRequest(10_000, false));
    now = new Date(now.getTime() + 16 * 60 * 1000);
    expect(await customer.payments.readRequest(old.frame)).toMatchObject({ ok: false, code: REFUSAL.REQUEST_EXPIRED });

    now = new Date(now.getTime() + 25 * HOUR);
    const late = value(await merchant.payments.createRequest(10_000, false));
    expect(await customer.payments.readRequest(late.frame)).toMatchObject({ ok: false, code: REFUSAL.VAULT_EXPIRED });
  });

  it('refuses a receipt from a different merchant and anything that is not a T-Pay code', async () => {
    const { customer, merchant, other } = await world();
    const open = value(await merchant.payments.createRequest(10_000, false));
    const paid = value(await customer.payments.pay(value(await customer.payments.readRequest(open.frame))));
    value(await merchant.payments.takeVoucher(paid.frame, open));

    const decoy = value(await other.payments.createRequest(10_000, false));
    const paidOther = value(await customer.payments.pay(value(await customer.payments.readRequest(decoy.frame))));
    const otherReceipt = value(await other.payments.takeVoucher(paidOther.frame, decoy));
    expect(await customer.payments.takeReceipt(otherReceipt.frame, paid.id)).toMatchObject({ ok: false, code: REFUSAL.REQUEST_MISMATCH });

    expect(await customer.payments.readRequest('https://example.com')).toMatchObject({ ok: false, code: REFUSAL.INVALID_FRAME });
    expect(await merchant.payments.takeVoucher(open.frame, open)).toMatchObject({ ok: false, code: REFUSAL.INVALID_FRAME });
  });

  it('asks a phone with no vault to lock money first', async () => {
    const { merchant, other } = await world();
    const open = value(await other.payments.createRequest(10_000, false));
    expect(await merchant.payments.readRequest(open.frame)).toMatchObject({ ok: false, code: 'NO_VAULT' });
  });
});
