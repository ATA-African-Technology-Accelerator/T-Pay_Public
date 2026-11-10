import { Entity } from './Entity';
import type { IDomainEvent } from './DomainEvent';
import { UniqueEntityId } from './Identifier';

/**
 * Aggregate Root is the primary entry point to an aggregate of entities and value objects.
 * Enforces business invariants and holds domain events to be dispatched.
 */
export abstract class AggregateRoot<T> extends Entity<T> {
  private _domainEvents: IDomainEvent[] = [];

  get domainEvents(): IDomainEvent[] {
    return [...this._domainEvents];
  }

  protected addDomainEvent(domainEvent: IDomainEvent): void {
    this._domainEvents.push(domainEvent);
  }

  public clearEvents(): void {
    this._domainEvents = [];
  }
}
