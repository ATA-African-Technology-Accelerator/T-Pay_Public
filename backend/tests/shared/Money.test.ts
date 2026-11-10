import { describe, expect, it } from "vitest";
import { Money } from '@tpay/shared/shared/domain/Money'





describe('Money', () => {
  describe('fromMinor', () => {
    it('stores an exact integer minor-unit amount', () => {
      const money = Money.fromMinor(1250, 'NGN').getValue();

      expect(money.minor).toBe(1250);
      expect(money.amount).toBe(12.5);
    });

    it.each([
      ['a fraction', 12.5],
      ['a negative value', -1],
      ['NaN', Number.NaN],
      ['infinity', Number.POSITIVE_INFINITY],
      ['an unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ])('rejects %s', (_label, minor) => {
      expect(Money.fromMinor(minor, 'NGN').isFailure).toBe(true);
    });
  });


  describe('create', () => {
    it('converts major units to minor units', () => {
      expect(Money.create(10.25, 'NGN').getValue().minor).toBe(1025);
    });

    it('rounds floating-point noise to the nearest minor unit', () => {
      expect(Money.create(0.1 + 0.2, 'NGN').getValue().minor).toBe(30);
    });

    it.each([
      ['a negative value', -1],
      ['NaN', Number.NaN],
      ['infinity', Number.POSITIVE_INFINITY],
    ])('rejects %s', (_label, major) => {
      expect(Money.create(major, 'NGN').isFailure).toBe(true);
    });
  });


  describe('add', () => {
    it('adds without floating-point error', () => {
      const first = Money.fromMinor(10, 'NGN').getValue();
      const second = Money.fromMinor(20, 'NGN').getValue();

      expect(first.add(second).getValue().minor).toBe(30);
    });

    it('rejects different currencies', () => {
      const naira = Money.fromMinor(100, 'NGN').getValue();
      const dollars = Money.fromMinor(100, 'USD').getValue();

      expect(naira.add(dollars).isFailure).toBe(true);
    });
  });


  describe('subtract', () => {
    it('subtracts exact minor units', () => {
      const first = Money.fromMinor(300, 'NGN').getValue();
      const second = Money.fromMinor(100, 'NGN').getValue();

      expect(first.subtract(second).getValue().minor).toBe(200);
    });

    it('rejects a negative result', () => {
      const first = Money.fromMinor(100, 'NGN').getValue();
      const second = Money.fromMinor(300, 'NGN').getValue();

      expect(first.subtract(second).isFailure).toBe(true);
    });
  });


  describe('multiply', () => {
    it('multiplies and rounds to the nearest minor unit', () => {
      const money = Money.fromMinor(101, 'NGN').getValue();

      expect(money.multiply(1.5).getValue().minor).toBe(152);
    });

    it.each([
      ['a negative factor', -2],
      ['NaN', Number.NaN],
      ['infinity', Number.POSITIVE_INFINITY],
    ])('rejects %s', (_label, factor) => {
      const money = Money.fromMinor(100, 'NGN').getValue();

      expect(money.multiply(factor).isFailure).toBe(true);
    });
  });


  describe('divide', () => {
    it('divides and rounds to the nearest minor unit', () => {
      const money = Money.fromMinor(100, 'NGN').getValue();

      expect(money.divide(3).getValue().minor).toBe(33);
    });

    it.each([
      ['zero', 0],
      ['a negative divisor', -2],
      ['NaN', Number.NaN],
    ])('rejects %s', (_label, divisor) => {
      const money = Money.fromMinor(100, 'NGN').getValue();

      expect(money.divide(divisor).isFailure).toBe(true);
    });
  });


  describe('comparison', () => {
    it('compares amounts in the same currency', () => {
      const small = Money.fromMinor(100, 'NGN').getValue();
      const large = Money.fromMinor(200, 'NGN').getValue();

      expect(large.isGreaterThan(small)).toBe(true);
      expect(small.isLessThan(large)).toBe(true);
      expect(Money.zero('NGN').isZero()).toBe(true);
    });

    it('throws when comparing different currencies', () => {
      const naira = Money.fromMinor(100, 'NGN').getValue();
      const dollars = Money.fromMinor(100, 'USD').getValue();

      expect(() => naira.isGreaterThan(dollars)).toThrow('different currencies');
    });
  });

  
  describe('format', () => {
    it('formats naira for display', () => {
      expect(Money.fromMinor(100000, 'NGN').getValue().format()).toBe('₦1,000');
    });
  });
});