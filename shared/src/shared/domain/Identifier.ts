/**
 * Unique Entity Identifier
 */
export class UniqueEntityId {
  private readonly _value: string;

  constructor(id?: string) {
    this._value = id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  }

  toString(): string {
    return this._value;
  }

  toValue(): string {
    return this._value;
  }

  equals(id?: UniqueEntityId): boolean {
    if (id === null || id === undefined) {
      return false;
    }
    if (!(id instanceof UniqueEntityId)) {
      return false;
    }
    return id.toValue() === this._value;
  }
}

