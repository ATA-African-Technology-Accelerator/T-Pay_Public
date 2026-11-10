import { describe, expect, it } from 'vitest';
import { canonicalJson, signingInput } from '@tpay/shared/domain/canonicalJson';



describe('canonicalJson', () => {
  it('sorts object keys so property order cannot change the output', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it('sorts nested objects and keeps array order', () => {
    expect(canonicalJson({ z: [{ b: 1, a: 2 }, 3] })).toBe('{"z":[{"a":2,"b":1},3]}');
  });

  it('supports strings, booleans and null', () => {
    expect(canonicalJson({ a: 'naira', b: true, c: null })).toBe('{"a":"naira","b":true,"c":null}');
  });

  it.each([
    ['a float', { amount: 12.5 }],
    ['an unsafe integer', { amount: Number.MAX_SAFE_INTEGER + 1 }],
    ['undefined', { amount: undefined }],
  ])('rejects %s', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow('Unsupported value in signed data');
  });
});


describe('signingInput', () => {
  it('separates the message type from its canonical content', () => {
    expect(signingInput('TPAY-VOUCHER-V1', { b: 1, a: 2 })).toBe('TPAY-VOUCHER-V1\n{"a":2,"b":1}');
  });
});