import type { IEscrowRepository } from '../../domain/repositories/IEscrowRepository';
import type { IPayPalGateway } from '../ports/IPayPalGateway';
import { Result } from '../../../shared/domain/Result';
import { DomainEventBus } from '../../../shared/domain/DomainEventBus';
import type { SyncResultDTO, EscrowTokenResponseDTO } from '../dtos/EscrowDTOs';
import { OfflineEscrowToken } from '../../domain/OfflineEscrowToken';

export class SyncEscrowsToPayPalUseCase {
  private escrowRepo: IEscrowRepository;
  private payPalGateway: IPayPalGateway;

  constructor(escrowRepo: IEscrowRepository, payPalGateway: IPayPalGateway) {
    this.escrowRepo = escrowRepo;
    this.payPalGateway = payPalGateway;
  }

  public async execute(reportingDeviceId: string): Promise<Result<SyncResultDTO>> {
    const isOnline = await this.payPalGateway.isNetworkAvailable();
    if (!isOnline) {
      return Result.fail('Device is offline. Escrow tokens remain securely stored locally until connection is restored.');
    }

    const unsyncedTokens = await this.escrowRepo.findUnsynced();
    if (unsyncedTokens.length === 0) {
      return Result.ok({
        totalAttempted: 0,
        totalSynced: 0,
        settledTokens: [],
        message: 'All offline escrow transactions are already synchronized with PayPal.',
      });
    }

    const settledDTOs: EscrowTokenResponseDTO[] = [];
    let successCount = 0;

    for (const token of unsyncedTokens) {
      token.markSyncing();
      const captureResult = await this.payPalGateway.captureEscrowToken(token);

      if (captureResult.success) {
        token.settleWithPayPal(captureResult.orderId, captureResult.captureId, reportingDeviceId);
        await this.escrowRepo.save(token);
        await DomainEventBus.publishAll(token.domainEvents);
        token.clearEvents();

        successCount++;
        settledDTOs.push(this.toDTO(token));
      } else {
        token.markFailed(captureResult.errorMessage || 'PayPal settlement failed');
        await this.escrowRepo.save(token);
        await DomainEventBus.publishAll(token.domainEvents);
        token.clearEvents();
      }
    }

    return Result.ok({
      totalAttempted: unsyncedTokens.length,
      totalSynced: successCount,
      settledTokens: settledDTOs,
      message: `Successfully settled ${successCount} of ${unsyncedTokens.length} offline transactions via PayPal.`,
    });
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
      syncedByDeviceId: token.props.syncedByDeviceId,
    };
  }
}
