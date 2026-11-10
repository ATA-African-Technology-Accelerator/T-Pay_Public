import { UniqueEntityId } from './Identifier';

/**
 * Domain Event represents an important business occurrence within the bounded context.
 */
export abstract class DomainEvent {
  public readonly dateTimeOccurred: Date;
  public readonly eventId: string;

  constructor() {
    this.dateTimeOccurred = new Date();
    this.eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  abstract getAggregateId(): UniqueEntityId;
}

export const IDomainEvent = DomainEvent;
export type IDomainEvent = DomainEvent;
