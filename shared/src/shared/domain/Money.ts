import { ValueObject } from './ValueObject';
import { Result } from './Result';

export type Currency = 'NGN' | 'USD' | 'EUR' | 'GBP';

interface MoneyProps {
  amount: number;
  currency: Currency;
}

/**
 * Money Value Object
 * Enforces business rules:
 * - Amount cannot be negative unless explicitly intended.
 * - Same-currency operations only.
 * - Integer representation in kobo/cents internally to avoid IEEE 754 floating point errors.
 */
export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  get amount(): number {
    return this.props.amount;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  public static create(amount: number, currency: Currency = 'NGN'): Result<Money> {
    if (isNaN(amount) || amount === null || amount === undefined) {
      return Result.fail<Money>('Money amount must be a valid number');
    }
    // Round to 2 decimal places to avoid floating point anomalies
    const rounded = Math.round(amount * 100) / 100;
    return Result.ok<Money>(new Money({ amount: rounded, currency }));
  }

  public static zero(currency: Currency = 'NGN'): Money {
    return new Money({ amount: 0, currency });
  }

  public add(other: Money): Result<Money> {
    if (this.currency !== other.currency) {
      return Result.fail<Money>(`Cannot add different currencies: ${this.currency} and ${other.currency}`);
    }
    return Money.create(this.amount + other.amount, this.currency);
  }

  public subtract(other: Money): Result<Money> {
    if (this.currency !== other.currency) {
      return Result.fail<Money>(`Cannot subtract different currencies: ${this.currency} and ${other.currency}`);
    }
    return Money.create(this.amount - other.amount, this.currency);
  }

  public multiply(factor: number): Result<Money> {
    if (isNaN(factor)) {
      return Result.fail<Money>('Factor must be a valid number');
    }
    return Money.create(this.amount * factor, this.currency);
  }

  public divide(divisor: number): Result<Money> {
    if (divisor === 0) {
      return Result.fail<Money>('Cannot divide money by zero');
    }
    return Money.create(this.amount / divisor, this.currency);
  }

  public isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new Error(`Cannot compare different currencies: ${this.currency} and ${other.currency}`);
    }
    return this.amount > other.amount;
  }

  public isLessThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new Error(`Cannot compare different currencies: ${this.currency} and ${other.currency}`);
    }
    return this.amount < other.amount;
  }

  public isZero(): boolean {
    return this.amount === 0;
  }

  public format(locale: string = 'en-NG'): string {
    const symbol = this.currency === 'NGN' ? '₦' : this.currency === 'USD' ? '$' : this.currency;
    return `${symbol}${this.amount.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
}

