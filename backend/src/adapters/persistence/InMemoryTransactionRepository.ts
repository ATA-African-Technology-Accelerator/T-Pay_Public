import type {
  ITransactionRepository, TransactionEvent, TransactionPage,
} from '../../services/ports';






export class InMemoryTransactionRepository implements ITransactionRepository {
  private readonly events: TransactionEvent[] = [];

  public async append(event: TransactionEvent): Promise<void> {
    if (!this.events.some((existing) => existing.id === event.id)) {
      this.events.push(event);
    }
  }

  public async listForDevice(
    deviceId: string,
    cursor: string | null,
    limit: number,
  ): Promise<TransactionPage> {
    const end = cursor === null ? this.events.length : Number(cursor);
    const matches = this.events
      .map((event, position) => ({ event, position }))
      .filter(({ event, position }) => event.deviceId === deviceId && position < end)
      .reverse();
    const page = matches.slice(0, limit);
    return {
      items: page.map(({ event }) => event),
      nextCursor: matches.length > limit ? String(page.at(-1)?.position) : null,
    };
  }
}