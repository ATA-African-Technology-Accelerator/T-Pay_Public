import type { ISigner } from '@tpay/shared/application/ports/crypto';
import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import type { RegisterDeviceRequest, RegisterDeviceResponse } from '@tpay/shared/contracts/api';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import type { RegistrationProofPayload } from '@tpay/shared/contracts/messages';
import { signingInput } from '@tpay/shared/domain/canonicalJson';
import { signMessage } from '@tpay/shared/domain/signedMessages';
import { ApiError } from './ApiError';
import type { Device, IDeviceRepository } from './ports';






const CERTIFICATE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;



export interface RegisterDeviceDependencies {
  devices: IDeviceRepository;
  signer: ISigner;
  random: IRandom;
  clock: IClock;
  rootPrivateKey: string;
}

export interface RegisterDeviceResult {
  created: boolean;
  response: RegisterDeviceResponse;
}


export class RegisterDevice {
  constructor(private readonly dependencies: RegisterDeviceDependencies) {}

  public async execute(request: RegisterDeviceRequest): Promise<RegisterDeviceResult> {
    const { devices, random, signer } = this.dependencies;
    await this.assertProof(request);

    const existing = await devices.findByPublicKey(request.publicKey);
    if (existing?.revokedAt) {
      throw new ApiError('DEVICE_REVOKED', 'This device key has been revoked');
    }

    const deviceToken = random.nonce();
    const tokenHash = await signer.hash(deviceToken);
    const device = await devices.save(
      existing ? { ...existing, tokenHash } : this.createDevice(request, tokenHash),
    );

    
    return {
      created: !existing,
      response: {
        deviceId: device.id,
        keyId: device.keyId,
        deviceToken,
        deviceCertificate: await this.issueCertificate(device),
        assuranceTier: 'B',
      },
    };
  }


  private async assertProof(request: RegisterDeviceRequest): Promise<void> {
    const { proof, ...payload } = request;
    const valid = await this.dependencies.signer.verify(
      signingInput(MESSAGE_PREFIX.REGISTRATION, payload),
      proof,
      request.publicKey,
    );
    if (!valid) {
      throw new ApiError('INVALID_SIGNATURE', 'Registration proof is not valid');
    }
  }


  private createDevice(request: RegisterDeviceRequest, tokenHash: string): Device {
    const { clock, random } = this.dependencies;
    return {
      id: `dev_${random.uuid()}`,
      keyId: `key_${random.uuid()}`,
      publicKey: request.publicKey,
      tokenHash,
      displayName: request.displayName,
      language: request.language,
      payoutEmail: request.payoutEmail,
      createdAt: clock.now(),
      revokedAt: null,
    };
  }
  

  private issueCertificate(device: Device) {
    const { clock, rootPrivateKey, signer } = this.dependencies;
    return signMessage(
      MESSAGE_PREFIX.DEVICE_CERTIFICATE,
      {
        deviceId: device.id,
        keyId: device.keyId,
        publicKey: device.publicKey,
        displayName: device.displayName,
        expiresAt: new Date(clock.now().getTime() + CERTIFICATE_LIFETIME_MS).toISOString(),
      },
      rootPrivateKey,
      signer,
    );
  }
}