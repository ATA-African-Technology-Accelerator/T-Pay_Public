import { AggregateRoot } from '../../shared/domain/AggregateRoot';
import { UniqueEntityId } from '../../shared/domain/Identifier';
import { Result } from '../../shared/domain/Result';
import { Money } from '../../shared/domain/Money';
import { DeviceIdentity } from './value-objects/DeviceIdentity';
import { Cryptogram } from './value-objects/Cryptogram';
import { EscrowStatus } from './value-objects/EscrowStatus';
import {
  EscrowTokenCreatedEvent,
  EscrowPeerAcknowledgedEvent,
  EscrowSettledViaPayPalEvent,
  EscrowSettlementFailedEvent,
} from './events/EscrowEvents';

export interface OfflineEscrowProps {
  sender: DeviceIdentity;
  recipient: DeviceIdentity;
  amount: Money;
  cryptogram: Cryptogram;
  status: EscrowStatus;
  createdOfflineAt: Date;
  syncedAt?: Date;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  syncedByDeviceId?: string;
  failureReason?: string;
}

/**
 * OfflineEscrowToken Aggregate Root
 * Enforces Offline-First architecture:
 * 1. Transactions are created and signed in local blackout state.
 * 2. Tokens are exchanged mutually with proximity peer.
 * 3. Whichever peer reconnects to the network first can trigger PayPal capture.
 */
export class OfflineEscrowToken extends AggregateRoot<OfflineEscrowProps> {
  private constructor(props: OfflineEscrowProps, id?: UniqueEntityId) {
    super(props, id);
  }

  get sender(): DeviceIdentity {
    return this.props.sender;
  }

  get recipient(): DeviceIdentity {
    return this.props.recipient;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get cryptogram(): Cryptogram {
    return this.props.cryptogram;
  }

  get status(): EscrowStatus {
    return this.props.status;
  }

  get createdOfflineAt(): Date {
    return this.props.createdOfflineAt;
  }

  get syncedAt(): Date | undefined {
    return this.props.syncedAt;
  }

  get paypalOrderId(): string | undefined {
    return this.props.paypalOrderId;
  }

  get paypalCaptureId(): string | undefined {
    return this.props.paypalCaptureId;
  }

  get isSettled(): boolean {
    return this.props.status === EscrowStatus.PAYPAL_SETTLED;
  }

  /**
   * Factory method: Create offline escrow token
   */
  public static create(
    sender: DeviceIdentity,
    recipient: DeviceIdentity,
    amount: Money,
    cryptogram: Cryptogram,
    id?: UniqueEntityId
  ): Result<OfflineEscrowToken> {
    if (amount.isZero() || amount.amount < 0) {
      return Result.fail<OfflineEscrowToken>('Escrow transaction amount must be greater than zero');
    }
    if (sender.deviceId === recipient.deviceId) {
      return Result.fail<OfflineEscrowToken>('Sender and recipient device cannot be identical');
    }

    const token = new OfflineEscrowToken(
      {
        sender,
        recipient,
        amount,
        cryptogram,
        status: EscrowStatus.OFFLINE_CREATED,
        createdOfflineAt: new Date(),
      },
      id
    );

    token.addDomainEvent(
      new EscrowTokenCreatedEvent(
        token.id,
        sender.deviceId,
        recipient.deviceId,
        amount.format()
      )
    );

    return Result.ok<OfflineEscrowToken>(token);
  }

  /**
   * Acknowledge receipt of token by proximity peer
   */
  public acknowledgeByPeer(acknowledgingDeviceId: string): Result<void> {
    if (this.props.status === EscrowStatus.PAYPAL_SETTLED) {
      return Result.fail<void>('Token is already settled via PayPal');
    }

    this.props.status = EscrowStatus.PEER_ACKNOWLEDGED;
    this.addDomainEvent(new EscrowPeerAcknowledgedEvent(this.id, acknowledgingDeviceId));
    return Result.ok<void>();
  }

  /**
   * Transition state to syncing
   */
  public markSyncing(): Result<void> {
    if (this.props.status === EscrowStatus.PAYPAL_SETTLED) {
      return Result.fail<void>('Token is already settled via PayPal');
    }
    this.props.status = EscrowStatus.SYNCING_TO_PAYPAL;
    return Result.ok<void>();
  }

  /**
   * Settle with PayPal when either Device A or B reconnects to the internet
   */
  public settleWithPayPal(
    orderId: string,
    captureId: string,
    reportingDeviceId: string
  ): Result<void> {
    if (this.props.status === EscrowStatus.PAYPAL_SETTLED) {
      return Result.fail<void>('Token has already been captured and settled with PayPal');
    }

    this.props.status = EscrowStatus.PAYPAL_SETTLED;
    this.props.paypalOrderId = orderId;
    this.props.paypalCaptureId = captureId;
    this.props.syncedByDeviceId = reportingDeviceId;
    this.props.syncedAt = new Date();

    this.addDomainEvent(
      new EscrowSettledViaPayPalEvent(this.id, orderId, captureId, reportingDeviceId)
    );

    return Result.ok<void>();
  }

  /**
   * Mark token capture failed
   */
  public markFailed(reason: string): void {
    this.props.status = EscrowStatus.FAILED;
    this.props.failureReason = reason;
    this.addDomainEvent(new EscrowSettlementFailedEvent(this.id, reason));
  }
}
