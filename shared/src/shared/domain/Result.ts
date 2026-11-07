export class Result<T> {

  public readonly isSuccess: boolean;
  public readonly error: string | null;
  private readonly value: T | undefined;


  private constructor(isSuccess: boolean, error: string | null, value?: T) {
    this.isSuccess = isSuccess;
    this.error = error;
    this.value = value;
  }


  
  get isFailure(): boolean {
    return !this.isSuccess;
  }


  public static ok<T>(value?: T): Result<T> {
    return new Result<T>(true, null, value);
  }


  public static fail<T>(error: string): Result<T> {
    if (!error) {
      throw new Error('A failed result needs an error');
    }
    return new Result<T>(false, error);
  }


  public getValue(): T {
    if (this.isFailure) {
      throw new Error(`Cannot read the value of a failed result: ${this.error}`);
    }
    return this.value as T;
  }
}