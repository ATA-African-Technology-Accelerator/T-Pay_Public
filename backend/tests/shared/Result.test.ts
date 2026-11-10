import { describe, expect, it } from "vitest";
import { Result } from '@tpay/shared/shared/domain/Result';






describe('Result', () => {
  it('holds the value of a success', () => {
    const result = Result.ok(42);

    expect(result.isSuccess).toBe(true);
    expect(result.isFailure).toBe(false);
    expect(result.getValue()).toBe(42);
    expect(result.error).toBeNull();
  });

  it('keeps falsy success values', () => {
    expect(Result.ok(0).getValue()).toBe(0);
    expect(Result.ok(false).getValue()).toBe(false);
  });

  it('supports a success with no value', () => {
    expect(Result.ok<void>().isSuccess).toBe(true);
  });

  it('holds the error of a failure', () => {
    const result = Result.fail<number>('Something went wrong');

    expect(result.isFailure).toBe(true);
    expect(result.isSuccess).toBe(false);
    expect(result.error).toBe('Something went wrong');
  });

  it('refuses to return a value from a failure', () => {
    const result = Result.fail<number>('Something went wrong');

    expect(() => result.getValue()).toThrow('Something went wrong');
  });

  it('requires a failure to have an error', () => {
    expect(() => Result.fail<number>('')).toThrow('A failed result needs an error');
  });
});