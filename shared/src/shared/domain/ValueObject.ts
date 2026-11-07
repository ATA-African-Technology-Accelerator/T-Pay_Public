export abstract class ValueObject<T extends object> {
  public readonly props: Readonly<T>;

  
  protected constructor(props: T) {
    this.props = Object.freeze({ ...props });
  }


  public equals(other?: ValueObject<T>): boolean {
    if (!other) {
      return false;
    }
    const keys = Object.keys(this.props) as (keyof T)[];
    const sameSize = keys.length === Object.keys(other.props).length;
    return sameSize && keys.every((key) => this.props[key] === other.props[key]);
  }
}