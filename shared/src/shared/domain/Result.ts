/**
 * Functional Result monad for explicit domain and use-case outcome handling.
 */
export class Result<T, E = string> {
  public isSuccess: boolean;
  public isFailure: boolean;
  public error: E | null;
  private _value: T | null;

  private constructor(isSuccess: boolean, error?: E | null, value?: T | null) {
    if (isSuccess && error) {
      throw new Error('InvalidOperation: A result cannot be successful and contain an error');
    }
    if (!isSuccess && !error) {
      throw new Error('InvalidOperation: A failing result needs to contain an error message');
    }

    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this.error = error ?? null;
    this._value = value ?? null;
  }

  public getValue(): T {
    if (!this.isSuccess) {
      throw new Error(`Cannot retrieve the value from a failed result: ${this.error}`);
    }
    return this._value as T;
  }

  public static ok<U, F = string>(value?: U): Result<U, F> {
    return new Result<U, F>(true, null, value);
  }

  public static fail<U, F = string>(error: F): Result<U, F> {
    return new Result<U, F>(false, error);
  }

  public static combine(results: Result<any, any>[]): Result<any, any> {
    for (const result of results) {
      if (result.isFailure) return result;
    }
    return Result.ok();
  }
}

