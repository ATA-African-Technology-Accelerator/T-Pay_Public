import {ValueObject} from './ValueObject';
import {Result} from './Result';





export type Currency = 'NGN' | 'USD' | 'EUR' | 'GBP';

const MINOR_UNITS_PER_MAJOR = 100;


interface MoneyProps {
  minor: number;
  currency: Currency;
}



export class Money extends ValueObject<MoneyProps> {
  
  private constructor(props: MoneyProps) {
    super(props);
  }


  get minor(): number {
    return this.props.minor;
  }


  get amount(): number {
    return this.props.minor / MINOR_UNITS_PER_MAJOR;
  }


  get currency(): Currency {
    return this.props.currency;
  }


  public static fromMinor(minor: number, currency: Currency = 'NGN'): Result<Money> {
    if (!Number.isSafeInteger(minor)) {
      return Result.fail<Money>('Money must be a safe integer number of minor units');
    }
    if (minor < 0) {
      return Result.fail<Money>('Money cannot be negative');
    }
    return Result.ok<Money>(new Money({ minor, currency }));
  }


  public static create(amount: number, currency: Currency = 'NGN'): Result<Money> {
    if (!Number.isFinite(amount)) {
      return Result.fail<Money>('Money amount must be a finite number');
    }
    return Money.fromMinor(Math.round(amount * MINOR_UNITS_PER_MAJOR), currency);
  }


  public static zero(currency: Currency = 'NGN'): Money {
    return new Money({ minor: 0, currency });
  }


  public add(other: Money): Result<Money> {
    if (!this.hasSameCurrency(other)) {
      return Result.fail<Money>(`Cannot add different currencies: ${this.currency} and ${other.currency}`);
    }
    return Money.fromMinor(this.minor + other.minor, this.currency);
  }


  public subtract(other: Money): Result<Money> {
    if (!this.hasSameCurrency(other)) {
      return Result.fail<Money>(`Cannot subtract different currencies: ${this.currency} and ${other.currency}`);
    }
    return Money.fromMinor(this.minor - other.minor, this.currency);
  }


  public multiply(factor: number): Result<Money> {
    if (!Number.isFinite(factor) || factor < 0) {
      return Result.fail<Money>('Factor must be a finite, non-negative number');
    }
    return Money.fromMinor(Math.round(this.minor * factor), this.currency);
  }


  public divide(divisor: number): Result<Money> {
    if (!Number.isFinite(divisor) || divisor <= 0) {
      return Result.fail<Money>('Divisor must be a finite number above zero');
    }
    return Money.fromMinor(Math.round(this.minor / divisor), this.currency);
  }

  
  public isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor > other.minor;
  }


  public isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor < other.minor;
  }


  public isZero(): boolean {
    return this.minor === 0;
  }


  public format(locale: string = 'en-NG'): string {
    const symbol = this.currency === 'NGN' ? '₦' : this.currency === 'USD' ? '$' : this.currency;
    const formatted = this.amount.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return `${symbol}${formatted}`;
  }


  private hasSameCurrency(other: Money): boolean {
    return this.currency === other.currency;
  }


  private assertSameCurrency(other: Money): void {
    if (!this.hasSameCurrency(other)) {
      throw new Error(`Cannot compare different currencies: ${this.currency} and ${other.currency}`);
    }
  }
}