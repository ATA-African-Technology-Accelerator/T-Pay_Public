import type { IDomainEvent } from './DomainEvent';

export type DomainEventHandler<T extends IDomainEvent = IDomainEvent> = (event: T) => Promise<void> | void;

/**
 * In-memory Domain Event Bus for decoupled cross-aggregate and cross-context communication.
 */
export class DomainEventBus {
  private static handlers: Map<string, DomainEventHandler[]> = new Map();

  public static subscribe<T extends IDomainEvent>(
    eventClassName: string,
    handler: DomainEventHandler<T>
  ): void {
    const existing = this.handlers.get(eventClassName) || [];
    this.handlers.set(eventClassName, [...existing, handler as DomainEventHandler]);
  }

  public static async publish(event: IDomainEvent): Promise<void> {
    const eventName = event.constructor.name;
    const subscribers = this.handlers.get(eventName) || [];
    for (const handler of subscribers) {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[DomainEventBus] Error handling domain event ${eventName}:`, err);
      }
    }
  }

  public static async publishAll(events: IDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  public static clearHandlers(): void {
    this.handlers.clear();
  }
}
