import type { ISigner } from '../application/ports/crypto';
import { MESSAGE_PREFIX } from '../contracts/messages';
import type {
  DeviceCertificatePayload, SignedEnvelope, VaultCertificatePayload,
} from '../contracts/messages';
import { REFUSAL } from '../contracts/refusals';
import { Result } from '../shared/domain/Result';
import { verifyMessage } from './signedMessages';






interface TrustContext {
  rootPublicKey: string;
  now: Date;
  signer: ISigner;
}


export async function verifyDeviceCertificate(
  certificate: SignedEnvelope<DeviceCertificatePayload>,
  { rootPublicKey, now, signer }: TrustContext,
): Promise<Result<DeviceCertificatePayload>> {

  const valid = await verifyMessage(
    MESSAGE_PREFIX.DEVICE_CERTIFICATE,
    certificate,
    rootPublicKey,
    signer,
  );
  const unexpired = new Date(certificate.payload.expiresAt) > now;

  if (!valid || !unexpired) {
    return Result.fail(REFUSAL.INVALID_CERTIFICATE);
  }
  return Result.ok(certificate.payload);
}


export async function verifyVaultCertificate(
  certificate: SignedEnvelope<VaultCertificatePayload>,
  expectedKeyId: string,
  { rootPublicKey, signer }: Pick<TrustContext, 'rootPublicKey' | 'signer'>,
): Promise<Result<VaultCertificatePayload>> {
  const valid = await verifyMessage(
    MESSAGE_PREFIX.VAULT_CERTIFICATE,
    certificate,
    rootPublicKey,
    signer,
  );

  if (!valid || certificate.payload.keyId !== expectedKeyId) {
    return Result.fail(REFUSAL.INVALID_CERTIFICATE);
  }
  return Result.ok(certificate.payload);
}