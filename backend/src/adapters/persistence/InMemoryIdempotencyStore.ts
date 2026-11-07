import type { IdempotencyClaim, IIdempotencyStore, StoredResponse } from '../../services/ports';

interface Entry {
  requestHash: string;
  response: StoredResponse | null;
}

export class InMemoryIdempotencyStore implements IIdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  public async claim(deviceId: string, key: string, requestHash: string): Promise<IdempotencyClaim> {
    const id = `${deviceId}:${key}`;
    const entry = this.entries.get(id);
    if (!entry) {
      this.entries.set(id, { requestHash, response: null });
      return { outcome: 'NEW' };
    }
    if (entry.requestHash === requestHash && entry.response) {
      return { outcome: 'REPLAY', response: entry.response };
    }
    return { outcome: 'CONFLICT' };
  }

  public async complete(deviceId: string, key: string, response: StoredResponse): Promise<void> {
    const entry = this.entries.get(`${deviceId}:${key}`);
    if (entry) {
      entry.response = response;
    }
  }

  public async release(deviceId: string, key: string): Promise<void> {
    this.entries.delete(`${deviceId}:${key}`);
  }
}
