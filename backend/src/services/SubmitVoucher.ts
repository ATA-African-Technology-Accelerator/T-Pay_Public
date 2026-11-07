import type { ISigner } from '@tpay/shared/application/ports/crypto';
import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import type { SubmitVoucherRequest, SubmitVoucherResponse } from '@tpay/shared/contracts/api';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import type { ReceiptPayload, SignedEnvelope, VoucherPayload } from '@tpay/shared/contracts/messages';
import { canonicalJson } from '@tpay/shared/domain/canonicalJson';
import { verifyVaultCertificate } from '@tpay/shared/domain/certificates';
import { convertNgnToUsd } from '@tpay/shared/domain/convertNgnToUsd';
import { verifyMessage } from '@tpay/shared/domain/signedMessages';
import { Money } from '@tpay/shared/shared/domain/Money';
import { ApiError } from './ApiError';
import type {
  Device, IDeviceRepository, IVaultRepository, IVoucherRepository, StoredVoucherStatus, Vault,
  VaultSession, Voucher,
} from './ports';
import { reservedUsd, settledUsd } from './vaultView';
import type { VoucherSettlement } from './VoucherSettlement';




export interface SubmitVoucherDependencies {
  devices: IDeviceRepository;
  vaults: IVaultRepository;
  vouchers: IVoucherRepository;
  signer: ISigner;
  clock: IClock;
  random: IRandom;
  rootPublicKey: string;
}

export interface SubmitVoucherResult {
  terminal: boolean;
  response: SubmitVoucherResponse;
}

interface Parties {
  payer: Device;
  payee: Device;
}

interface Decision {
  voucher: Voucher;
  status: StoredVoucherStatus;
  replay: boolean;
  settle: boolean;
}


const TERMINAL: StoredVoucherStatus[] = [
  'SETTLED', 'SETTLEMENT_BLOCKED', 'REJECTED_CONFLICT', 'REJECTED_OVERSPEND',
];


export class SubmitVoucher {
  constructor(
    private readonly dependencies: SubmitVoucherDependencies,
    private readonly settlement: VoucherSettlement,
  ) {}

  public async execute(device: Device, request: SubmitVoucherRequest): Promise<SubmitVoucherResult> {
    const { voucher } = request;
    const vault = await this.findVault(voucher.payload.vaultId);
    await this.assertCertificate(request, vault);
    const parties = await this.findParties(vault, voucher);
    this.assertParty(device, parties);
    await this.assertSignature(voucher, parties.payer);
    this.assertAmounts(voucher.payload, vault);
    await this.assertReceipt(request, parties.payee);

    const payloadHash = await this.dependencies.signer.hash(canonicalJson(voucher.payload));
    const decision = await this.dependencies.vouchers.withVaultLock(vault.id, (session) =>
      this.decide(session, request, parties, payloadHash));

    const settled = decision.settle ? await this.settlement.attempt(decision.voucher.id) : decision.voucher;
    const status = decision.settle ? settled.status : decision.status;
    return {
      terminal: TERMINAL.includes(status),
      response: {
        voucherId: settled.id,
        status,
        paypalCaptureId: status === 'REJECTED_CONFLICT' ? null : settled.paypalCaptureId,
        replay: decision.replay,
      },
    };
  }


  private async findVault(vaultId: string): Promise<Vault> {
    const vault = await this.dependencies.vaults.findById(vaultId);
    if (!vault?.paypalAuthorizationId) {
      throw new ApiError('VAULT_NOT_FOUND', 'This vault does not exist');
    }
    return vault;
  }


  private async assertCertificate({ vaultCertificate, voucher }: SubmitVoucherRequest, vault: Vault): Promise<void> {
    const { rootPublicKey, signer } = this.dependencies;
    const certificate = await verifyVaultCertificate(vaultCertificate, voucher.payload.keyId, { rootPublicKey, signer });
    if (certificate.isFailure || certificate.getValue().vaultId !== vault.id) {
      throw new ApiError('INVALID_CERTIFICATE', 'The vault certificate is not valid');
    }
  }


  private async findParties(vault: Vault, { payload }: SignedEnvelope<VoucherPayload>): Promise<Parties> {
    const { devices } = this.dependencies;
    const payer = await devices.findById(vault.deviceId) as Device;
    const payee = await devices.findByKeyId(payload.payeeKeyId);
    if (!payee || payee.id === payer.id) {
      throw new ApiError('VALIDATION_FAILED', 'The voucher does not name a valid payee');
    }
    return { payer, payee };
  }


  private assertParty(device: Device, { payee, payer }: Parties): void {
    if (device.id !== payer.id && device.id !== payee.id) {
      throw new ApiError('NOT_A_PARTY', 'This device is not part of the voucher');
    }
  }


  private async assertSignature(voucher: SignedEnvelope<VoucherPayload>, payer: Device): Promise<void> {
    const { payload } = voucher;
    const valid = await verifyMessage(MESSAGE_PREFIX.VOUCHER, voucher, payer.publicKey, this.dependencies.signer);
    if (!valid || payload.keyId !== payer.keyId || payload.deviceId !== payer.id) {
      throw new ApiError('INVALID_SIGNATURE', 'The voucher signature is not valid');
    }
  }


  private assertAmounts(payload: VoucherPayload, vault: Vault): void {
    const converted = convertNgnToUsd(Money.fromMinor(payload.amountNgnMinor, 'NGN').getValue(), vault.fxRate);
    const matches = converted.isSuccess && converted.getValue().minor === payload.amountUsdMinor;
    if (!matches || payload.fxRate !== vault.fxRate) {
      throw new ApiError('VALIDATION_FAILED', 'The voucher amount does not match the vault rate');
    }
  }


  private async assertReceipt({ receipt, voucher }: SubmitVoucherRequest, payee: Device): Promise<void> {
    if (!receipt) {
      return;
    }
    const { signer } = this.dependencies;
    const expected: Partial<ReceiptPayload> = {
      vaultId: voucher.payload.vaultId,
      sequence: voucher.payload.sequence,
      merchantKeyId: payee.keyId,
      voucherHash: await signer.hash(canonicalJson(voucher)),
    };
    const matches = Object.entries(expected).every(([field, value]) =>
      receipt.payload[field as keyof ReceiptPayload] === value);
    if (!matches || !(await verifyMessage(MESSAGE_PREFIX.RECEIPT, receipt, payee.publicKey, signer))) {
      throw new ApiError('INVALID_SIGNATURE', 'The receipt is not valid');
    }
  }


  private async decide(
    session: VaultSession,
    request: SubmitVoucherRequest,
    parties: Parties,
    payloadHash: string,
  ): Promise<Decision> {
    const { payload } = request.voucher;
    const existing = session.vouchers.find(({ sequence }) => sequence === payload.sequence);
    if (existing?.payloadHash === payloadHash) {
      return { voucher: existing, status: existing.status, replay: true, settle: false };
    }
    if (existing) {
      return this.rejectConflict(session, existing, payloadHash);
    }

    this.assertInTime(session.vault, payload);
    const status = this.classify(session, payload);
    const voucher = this.build(session.vault, request, parties, payloadHash, status);
    await session.insertVoucher(voucher);
    await this.settlement.recordEvents(session, voucher, 'VOUCHER_SUBMITTED');
    if (status !== 'SETTLING') {
      await this.recordRefusal(session, voucher);
    }
    return { voucher, status, replay: false, settle: status === 'SETTLING' };
  }


  private async rejectConflict(session: VaultSession, existing: Voucher, payloadHash: string): Promise<Decision> {
    if (session.vault.status !== 'BLOCKED') {
      await this.block(session);
      await this.settlement.recordAlert(session, 'VOUCHER_CONFLICT', existing.id, {
        sequence: existing.sequence,
        storedHash: existing.payloadHash,
        submittedHash: payloadHash,
      });
    }
    return { voucher: existing, status: 'REJECTED_CONFLICT', replay: false, settle: false };
  }


  private assertInTime(vault: Vault, payload: VoucherPayload): void {
    const signedTooLate = new Date(payload.issuedAt) > (vault.spendBy as Date);
    if (signedTooLate || this.dependencies.clock.now() > (vault.settleBy as Date)) {
      throw new ApiError('VOUCHER_EXPIRED', 'This voucher can no longer be settled');
    }
  }


  private classify({ vault, vouchers }: VaultSession, payload: VoucherPayload): StoredVoucherStatus {
    const beyondStatement = vault.declaredLastSequence !== null && payload.sequence > vault.declaredLastSequence;
    if (vault.status === 'CLOSED' || vault.status === 'BLOCKED' || beyondStatement) {
      return 'SETTLEMENT_BLOCKED';
    }
    const committed = reservedUsd(vouchers) + settledUsd(vouchers);
    return committed + payload.amountUsdMinor > vault.authorisedUsdMinor ? 'REJECTED_OVERSPEND' : 'SETTLING';
  }


  private async recordRefusal(session: VaultSession, voucher: Voucher): Promise<void> {
    const { settlement } = this;
    await settlement.recordEvents(session, voucher, 'VOUCHER_REJECTED');
    if (voucher.status === 'REJECTED_OVERSPEND') {
      await this.block(session);
      await settlement.recordAlert(session, 'VOUCHER_OVERSPEND', voucher.id, { amountUsdMinor: voucher.amountUsdMinor });
      return;
    }
    const { declaredLastSequence } = session.vault;
    if (declaredLastSequence !== null && voucher.sequence > declaredLastSequence) {
      await settlement.recordAlert(session, 'STATEMENT_VIOLATION', voucher.id, { declaredLastSequence });
      return;
    }
    await settlement.recordAlert(session, 'SETTLEMENT_BLOCKED', voucher.id, { reason: session.vault.status });
  }


  private block(session: VaultSession): Promise<void> {
    return session.vault.status === 'CLOSED' ? Promise.resolve() : session.updateVault({ status: 'BLOCKED' });
  }


  private build(
    vault: Vault,
    { receipt, voucher }: SubmitVoucherRequest,
    { payee, payer }: Parties,
    payloadHash: string,
    status: StoredVoucherStatus,
  ): Voucher {
    const { clock, random } = this.dependencies;
    const now = clock.now();
    return {
      id: `vch_${random.uuid()}`,
      vaultId: vault.id,
      sequence: voucher.payload.sequence,
      payloadHash,
      payload: voucher.payload,
      signature: voucher.signature,
      receipt: receipt ?? null,
      payerDeviceId: payer.id,
      payeeDeviceId: payee.id,
      payerName: payer.displayName,
      payeeName: payee.displayName,
      amountNgnMinor: voucher.payload.amountNgnMinor,
      amountUsdMinor: voucher.payload.amountUsdMinor,
      status,
      paypalCaptureId: null,
      attempts: 0,
      nextAttemptAt: null,
      leaseUntil: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}
