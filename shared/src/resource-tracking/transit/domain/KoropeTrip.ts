import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { UniqueEntityId } from '../../../shared/domain/Identifier';
import { Money } from '../../../shared/domain/Money';
import { Result } from '../../../shared/domain/Result';
import { PassengerSeat } from './entities/PassengerSeat';
import { PassengerSeatPaidEvent, TripFullyCollectedEvent } from './events/TransitEvents';

export interface KoropeTripProps {
  driverName: string;
  vehicleType: string;
  routeName: string;
  farePerSeat: Money;
  totalSeats: number;
  seats: PassengerSeat[];
}

export class KoropeTrip extends AggregateRoot<KoropeTripProps> {
  private constructor(props: KoropeTripProps, id?: UniqueEntityId) {
    super(props, id);
  }

  get driverName(): string {
    return this.props.driverName;
  }

  get vehicleType(): string {
    return this.props.vehicleType;
  }

  get routeName(): string {
    return this.props.routeName;
  }

  get farePerSeat(): Money {
    return this.props.farePerSeat;
  }

  get totalSeats(): number {
    return this.props.totalSeats;
  }

  get seats(): PassengerSeat[] {
    return [...this.props.seats];
  }

  get paidSeatsCount(): number {
    return this.props.seats.filter((s) => s.isPaid).length;
  }

  get unpaidSeatsCount(): number {
    return this.props.seats.filter((s) => !s.isPaid).length;
  }

  get isFullyPaid(): boolean {
    return this.unpaidSeatsCount === 0;
  }

  public static create(
    driverName: string = 'Morufu Transport',
    routeName: string = 'Yaba Terminal ⇄ CMS Marina Express',
    fareAmount: number = 300,
    totalSeats: number = 7,
    id?: UniqueEntityId
  ): Result<KoropeTrip> {
    const fare = Money.create(fareAmount, 'NGN').getValue();
    const seats: PassengerSeat[] = [];

    for (let i = 1; i <= totalSeats; i++) {
      seats.push(
        new PassengerSeat({
          seatNumber: i,
          fareAmount: fare,
          isPaid: false,
        })
      );
    }

    const trip = new KoropeTrip(
      {
        driverName,
        vehicleType: `Korope (${totalSeats}-Seater Mini-Bus)`,
        routeName,
        farePerSeat: fare,
        totalSeats,
        seats,
      },
      id
    );

    return Result.ok<KoropeTrip>(trip);
  }

  public static rehydrate(props: KoropeTripProps, id: UniqueEntityId): KoropeTrip {
    return new KoropeTrip(props, id);
  }

  public recordPassengerPayment(
    passengerName: string,
    deviceId: string,
    method: 'bluetooth_ble' | 'wifi_direct' | 'paypal_escrow' | 'cash' = 'bluetooth_ble'
  ): Result<PassengerSeat> {
    const nextUnpaid = this.props.seats.find((s) => !s.isPaid);
    if (!nextUnpaid) {
      return Result.fail<PassengerSeat>('Bus is already full and all seats are paid');
    }

    const assignResult = nextUnpaid.assignPayment(passengerName, deviceId, method);
    if (assignResult.isFailure) return Result.fail<PassengerSeat>(assignResult.error!);

    this.addDomainEvent(
      new PassengerSeatPaidEvent(
        this.id,
        nextUnpaid.seatNumber,
        passengerName,
        this.props.farePerSeat.format()
      )
    );

    if (this.isFullyPaid) {
      const totalRevenue = this.props.farePerSeat.multiply(this.totalSeats).getValue();
      this.addDomainEvent(
        new TripFullyCollectedEvent(
          this.id,
          this.driverName,
          this.totalSeats,
          totalRevenue.format()
        )
      );
    }

    return Result.ok<PassengerSeat>(nextUnpaid);
  }

  public resetTrip(): void {
    for (const seat of this.props.seats) {
      seat.reset();
    }
  }
}

