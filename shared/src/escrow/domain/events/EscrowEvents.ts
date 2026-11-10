import type { IDomainEvent } from '../../../shared/domain/DomainEvent';
import { UniqueEntityId } from '../../../shared/domain/Identifier';

export class EscrowTokenCreatedEvent implements IDomainEvent {
  public dateTimeOccurred: Date;
  public eventId: string;
  public readonly escrowId: UniqueEntityId;
  public readonly senderDeviceId: string;
  public readonly recipientDeviceId: string;
  public readonly amountFormatted: string;

  constructor(
    escrowId: UniqueEntityId,
    senderDeviceId: string,
    recipientDeviceId: string,
    amountFormatted: string
  ) {
    this.escrowId = escrowId;
    this.senderDeviceId = senderDeviceId;
    this.recipientDeviceId = recipientDeviceId;
    this.amountFormatted = amountFormatted;
    this.dateTimeOccurred = new Date();
    this.eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  getAggregateId(): UniqueEntityId {
    return this.escrowId;
  }
}

export class EscrowPeerAcknowledgedEvent implements IDomainEvent {
  public dateTimeOccurred: Date;
  public eventId: string;
  public readonly escrowId: UniqueEntityId;
  public readonly recipientDeviceId: string;

  constructor(escrowId: UniqueEntityId, recipientDeviceId: string) {
    this.escrowId = escrowId;
    this.recipientDeviceId = recipientDeviceId;
    this.dateTimeOccurred = new Date();
    this.eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  getAggregateId(): UniqueEntityId {
    return this.escrowId;
  }
}

export class EscrowSettledViaPayPalEvent implements IDomainEvent {
  public dateTimeOccurred: Date;
  public eventId: string;
  public readonly escrowId: UniqueEntityId;
  public readonly paypalOrderId: string;
  public readonly paypalCaptureId: string;
  public readonly settledByDeviceId: string;

  constructor(
    escrowId: UniqueEntityId,
    paypalOrderId: string,
    paypalCaptureId: string,
    settledByDeviceId: string
  ) {
    this.escrowId = escrowId;
    this.paypalOrderId = paypalOrderId;
    this.paypalCaptureId = paypalCaptureId;
    this.settledByDeviceId = settledByDeviceId;
    this.dateTimeOccurred = new Date();
    this.eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  getAggregateId(): UniqueEntityId {
    return this.escrowId;
  }
}

export class EscrowSettlementFailedEvent implements IDomainEvent {
  public dateTimeOccurred: Date;
  public eventId: string;
  public readonly escrowId: UniqueEntityId;
  public readonly failureReason: string;

  constructor(escrowId: UniqueEntityId, failureReason: string) {
    this.escrowId = escrowId;
    this.failureReason = failureReason;
    this.dateTimeOccurred = new Date();
    this.eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  getAggregateId(): UniqueEntityId {
    return this.escrowId;
  }
}

export class MarketVaultLockedEvent implements IDomainEvent {
  public dateTimeOccurred: Date;
  public eventId: string;
  public readonly vaultId: UniqueEntityId;
  public readonly userId: string;
  public readonly amountFormatted: string;
  public readonly durationHours: number;
  public readonly expiresAt: Date;
  public readonly paypalPreAuthId: string;

  constructor(
    vaultId: UniqueEntityId,
    userId: string,
    amountFormatted: string,
    durationHours: number,
    expiresAt: Date,
    paypalPreAuthId: string
  ) {
    this.vaultId = vaultId;
    this.userId = userId;
    this.amountFormatted = amountFormatted;
    this.durationHours = durationHours;
    this.expiresAt = expiresAt;
    this.paypalPreAuthId = paypalPreAuthId;
    this.dateTimeOccurred = new Date();
    this.eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  getAggregateId(): UniqueEntityId {
    return this.vaultId;
  }
}

export class MarketVaultMeltedEvent implements IDomainEvent {
  public dateTimeOccurred: Date;
  public eventId: string;
  public readonly vaultId: UniqueEntityId;
  public readonly unspentMeltedFormatted: string;
  public readonly refundedToAccountId: string;

  constructor(
    vaultId: UniqueEntityId,
    unspentMeltedFormatted: string,
    refundedToAccountId: string
  ) {
    this.vaultId = vaultId;
    this.unspentMeltedFormatted = unspentMeltedFormatted;
    this.refundedToAccountId = refundedToAccountId;
    this.dateTimeOccurred = new Date();
    this.eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  getAggregateId(): UniqueEntityId {
    return this.vaultId;
  }
}

