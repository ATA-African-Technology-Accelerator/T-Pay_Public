import type { IEscrowRepository } from '../../domain/repositories/IEscrowRepository';
import type { IProximityTransport } from '../ports/IProximityTransport';
import type { IPayPalGateway } from '../ports/IPayPalGateway';
import { DeviceIdentity } from '../../domain/value-objects/DeviceIdentity';
import { CryptographicExchangeService } from '../../domain/services/CryptographicExchangeService';
import { OfflineEscrowToken } from '../../domain/OfflineEscrowToken';
import { Money } from '../../../shared/domain/Money';
import { Result } from '../../../shared/domain/Result';
import { DomainEventBus } from '../../../shared/domain/DomainEventBus';
import type { InitiateEscrowInputDTO, EscrowTokenResponseDTO } from '../dtos/EscrowDTOs';

export class CreateOfflineEscrowUseCase {
  private escrowRepo: IEscrowRepository;
  private proximityTransport: IProximityTransport;
  private payPalGateway: IPayPalGateway;

  constructor(
    escrowRepo: IEscrowRepository,
    proximityTransport: IProximityTransport,
    payPalGateway: IPayPalGateway
  ) {
    this.escrowRepo = escrowRepo;
    this.proximityTransport = proximityTransport;
    this.payPalGateway = payPalGateway;
  }

  public async execute(input: InitiateEscrowInputDTO): Promise<Result<EscrowTokenResponseDTO>> {
    // 1. Value Object Creation & Invariant Validation
    const senderResult = DeviceIdentity.create(input.senderDeviceId, input.senderName, input.senderAccount);
    if (senderResult.isFailure) return Result.fail(senderResult.error!);

    const recipientResult = DeviceIdentity.create(input.recipientDeviceId, input.recipientName, input.recipientAccount);
    if (recipientResult.isFailure) return Result.fail(recipientResult.error!);

    const amountResult = Money.create(input.amount, input.currency || 'NGN');
    if (amountResult.isFailure) return Result.fail(amountResult.error!);

    // 2. Offline-First Rule: Generate Cryptographic Proof
    const cryptogramResult = CryptographicExchangeService.generateEscrowProof(
      senderResult.getValue(),
      recipientResult.getValue(),
      amountResult.getValue()
    );
    if (cryptogramResult.isFailure) return Result.fail(cryptogramResult.error!);

    // 3. Instantiate Aggregate Root
    const escrowResult = OfflineEscrowToken.create(
      senderResult.getValue(),
      recipientResult.getValue(),
      amountResult.getValue(),
      cryptogramResult.getValue()
    );
    if (escrowResult.isFailure) return Result.fail(escrowResult.error!);

    const token = escrowResult.getValue();

    // 4. Zero-data peer transmission via BLE / Wi-Fi Direct
    await this.proximityTransport.transmitToken(recipientResult.getValue().deviceId, token);
    token.acknowledgeByPeer(recipientResult.getValue().deviceId);

    // 5. Persist offline in local repository
    await this.escrowRepo.save(token);

    // 6. Dispatch domain events
    await DomainEventBus.publishAll(token.domainEvents);
    token.clearEvents();

    // 7. Opportunistic network check: if internet happens to be available right now, settle within seconds
    const isOnline = await this.payPalGateway.isNetworkAvailable();
    if (isOnline) {
      const capture = await this.payPalGateway.captureEscrowToken(token);
      if (capture.success) {
        token.settleWithPayPal(capture.orderId, capture.captureId, senderResult.getValue().deviceId);
        await this.escrowRepo.save(token);
        await DomainEventBus.publishAll(token.domainEvents);
        token.clearEvents();
      }
    }

    return Result.ok(this.toDTO(token));
  }

  private toDTO(token: OfflineEscrowToken): EscrowTokenResponseDTO {
    return {
      id: token.id.toValue(),
      senderName: token.sender.name,
      senderAccount: token.sender.accountNumber,
      recipientName: token.recipient.name,
      recipientAccount: token.recipient.accountNumber,
      amountFormatted: token.amount.format(),
      amountNumeric: token.amount.amount,
      currency: token.amount.currency,
      cryptogramHash: token.cryptogram.hash,
      status: token.status,
      createdOfflineAt: token.createdOfflineAt.toLocaleTimeString(),
      syncedToPayPal: token.isSettled,
      paypalOrderId: token.paypalOrderId,
      paypalCaptureId: token.paypalCaptureId,
    };
  }
}
