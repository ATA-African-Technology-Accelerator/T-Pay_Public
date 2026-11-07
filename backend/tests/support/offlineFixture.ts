import type { IClock } from '@tpay/shared/application/ports/system';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import type {
  DeviceCertificatePayload, PaymentRequestPayload,
  SignedEnvelope, VaultCertificatePayload,
} from '@tpay/shared/contracts/messages';
import { signMessage } from '@tpay/shared/domain/signedMessages';
import { VaultCapacity } from '@tpay/shared/domain/VaultCapacity';
import { Money } from '@tpay/shared/shared/domain/Money';
import { NodeP256Signer } from '../../src/adapters/crypto/NodeP256Signer';





export const NOW = new Date('2026-11-06T10:00:00.000Z');
export const clock: IClock = { now: () => NOW };
export const signer = new NodeP256Signer();

export const usd = (minor: number) => Money.fromMinor(minor, 'USD').getValue();
export const capacity = (authorised: number, reserved = 0, settled = 0) =>
  VaultCapacity.create(usd(authorised), usd(reserved), usd(settled)).getValue();

export async function createOfflineFixture() {
  const root = await signer.generateKeyPair();
  const customerKeys = await signer.generateKeyPair();
  const merchantKeys = await signer.generateKeyPair();

  const certificate = (payload: DeviceCertificatePayload, privateKey = root.privateKey) =>
    signMessage(MESSAGE_PREFIX.DEVICE_CERTIFICATE, payload, privateKey, signer);

  const customerCertificate = await certificate({
    deviceId: 'dev_customer',
    keyId: 'key_customer',
    publicKey: customerKeys.publicKey,
    displayName: 'Customer',
    expiresAt: '2026-11-13T10:00:00.000Z',
  });

  const merchantCertificate = await certificate({
    deviceId: 'dev_merchant',
    keyId: 'key_merchant',
    publicKey: merchantKeys.publicKey,
    displayName: 'Merchant',
    expiresAt: '2026-11-13T10:00:00.000Z',
  });

  const vaultPayload: VaultCertificatePayload = {
    vaultId: 'vlt_1',
    keyId: 'key_customer',
    authorisedUsdMinor: 667,
    amountNgnMinor: 1_000_000,
    fxRate: '1500.00',
    spendBy: '2026-11-07T10:00:00.000Z',
    settleBy: '2026-11-08T10:00:00.000Z',
  };
  const vaultCertificate = await signMessage(
    MESSAGE_PREFIX.VAULT_CERTIFICATE,
    vaultPayload,
    root.privateKey,
    signer,
  );

  const paymentRequest = (
    overrides: Partial<PaymentRequestPayload> = {},
  ): Promise<SignedEnvelope<PaymentRequestPayload>> =>
    signMessage(
      MESSAGE_PREFIX.PAYMENT_REQUEST,
      {
        requestId: 'req_1',
        merchantKeyId: 'key_merchant',
        amountNgnMinor: 200_000,
        nonce: 'nonce_1',
        expiresAt: '2026-11-06T10:05:00.000Z',
        merchantCertificate,
        ...overrides,
      },
      merchantKeys.privateKey,
      signer,
    );

  return {
    root,
    customerKeys,
    merchantKeys,
    customerCertificate,
    merchantCertificate,
    vaultPayload,
    vaultCertificate,
    certificate,
    paymentRequest,
  };
}