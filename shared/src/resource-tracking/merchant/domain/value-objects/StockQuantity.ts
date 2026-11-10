import { ValueObject } from '../../../../shared/domain/ValueObject';
import { Result } from '../../../../shared/domain/Result';

export type PackagingUnit = 'bottle' | 'can' | 'pack' | 'piece' | 'bag' | 'carton';

interface StockQuantityProps {
  value: number;
  unit: PackagingUnit;
}

export class StockQuantity extends ValueObject<StockQuantityProps> {
  private constructor(props: StockQuantityProps) {
    super(props);
  }

  get value(): number {
    return this.props.value;
  }

  get unit(): PackagingUnit {
    return this.props.unit;
  }

  public static create(value: number, unit: PackagingUnit = 'piece'): Result<StockQuantity> {
    if (isNaN(value) || value < 0) {
      return Result.fail<StockQuantity>('Stock quantity cannot be negative');
    }
    return Result.ok<StockQuantity>(new StockQuantity({ value: Math.floor(value), unit }));
  }

  public add(amount: number): Result<StockQuantity> {
    return StockQuantity.create(this.value + amount, this.unit);
  }

  public subtract(amount: number): Result<StockQuantity> {
    if (this.value < amount) {
      return Result.fail<StockQuantity>(`Insufficient stock: requested ${amount}, available ${this.value}`);
    }
    return StockQuantity.create(this.value - amount, this.unit);
  }
}
