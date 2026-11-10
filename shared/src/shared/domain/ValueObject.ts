interface ValueObjectProps {
  [index: string]: any;
}

/**
 * Value Objects are immutable domain objects without distinct identity.
 * Equality is determined by comparing structural properties.
 */
export abstract class ValueObject<T extends ValueObjectProps> {
  public readonly props: Readonly<T>;

  constructor(props: T) {
    this.props = Object.freeze({ ...props });
  }

  public equals(vo?: ValueObject<T>): boolean {
    if (vo === null || vo === undefined) {
      return false;
    }
    if (vo.props === undefined) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(vo.props);
  }
}

