import type { IDomainEvent } from '../../../../shared/domain/DomainEvent';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';

export class PassengerSeatPaidEvent implements IDomainEvent {
  public dateTimeOccurred: Date = new Date();
  public eventId: string = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  public readonly tripId: UniqueEntityId;
  public readonly seatNumber: number;
  public readonly passengerName: string;
  public readonly fareFormatted: string;

  constructor(
    tripId: UniqueEntityId,
    seatNumber: number,
    passengerName: string,
    fareFormatted: string
  ) {
    this.tripId = tripId;
    this.seatNumber = seatNumber;
    this.passengerName = passengerName;
    this.fareFormatted = fareFormatted;
  }

  getAggregateId(): UniqueEntityId {
    return this.tripId;
  }
}

export class TripFullyCollectedEvent implements IDomainEvent {
  public dateTimeOccurred: Date = new Date();
  public eventId: string = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  public readonly tripId: UniqueEntityId;
  public readonly driverName: string;
  public readonly totalSeats: number;
  public readonly totalRevenueFormatted: string;

  constructor(
    tripId: UniqueEntityId,
    driverName: string,
    totalSeats: number,
    totalRevenueFormatted: string
  ) {
    this.tripId = tripId;
    this.driverName = driverName;
    this.totalSeats = totalSeats;
    this.totalRevenueFormatted = totalRevenueFormatted;
  }

  getAggregateId(): UniqueEntityId {
    return this.tripId;
  }
}
