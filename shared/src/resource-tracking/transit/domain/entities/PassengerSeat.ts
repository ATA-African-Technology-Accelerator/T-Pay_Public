import { Entity } from '../../../../shared/domain/Entity';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';
import { Money } from '../../../../shared/domain/Money';
import { Result } from '../../../../shared/domain/Result';

export interface PassengerSeatProps {
  seatNumber: number;
  fareAmount: Money;
  isPaid: boolean;
  passengerName?: string;
  passengerDeviceId?: string;
  paymentMethod?: 'bluetooth_ble' | 'wifi_direct' | 'paypal_escrow' | 'cash';
  paidAt?: Date;
}

export class PassengerSeat extends Entity<PassengerSeatProps> {
  constructor(props: PassengerSeatProps, id?: UniqueEntityId) {
    super(props, id);
  }

  get seatNumber(): number {
    return this.props.seatNumber;
  }

  get fareAmount(): Money {
    return this.props.fareAmount;
  }

  get isPaid(): boolean {
    return this.props.isPaid;
  }

  get passengerName(): string | undefined {
    return this.props.passengerName;
  }

  get passengerDeviceId(): string | undefined {
    return this.props.passengerDeviceId;
  }

  get paymentMethod(): string | undefined {
    return this.props.paymentMethod;
  }

  get paidAt(): Date | undefined {
    return this.props.paidAt;
  }

  public assignPayment(
    passengerName: string,
    deviceId: string,
    method: 'bluetooth_ble' | 'wifi_direct' | 'paypal_escrow' | 'cash'
  ): Result<void> {
    if (this.props.isPaid) {
      return Result.fail<void>(`Seat ${this.seatNumber} is already paid`);
    }
    this.props.isPaid = true;
    this.props.passengerName = passengerName;
    this.props.passengerDeviceId = deviceId;
    this.props.paymentMethod = method;
    this.props.paidAt = new Date();
    return Result.ok<void>();
  }

  public reset(): void {
    this.props.isPaid = false;
    this.props.passengerName = undefined;
    this.props.passengerDeviceId = undefined;
    this.props.paymentMethod = undefined;
    this.props.paidAt = undefined;
  }
}
