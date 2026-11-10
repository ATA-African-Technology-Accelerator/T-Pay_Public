import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { UniqueEntityId } from '../../../shared/domain/Identifier';
import { Money } from '../../../shared/domain/Money';
import { Result } from '../../../shared/domain/Result';
import { StockQuantity, type PackagingUnit } from './value-objects/StockQuantity';
import { InventoryStockDeductedEvent, LowStockAlertEvent } from './events/MerchantEvents';

export interface InventoryItemProps {
  name: string;
  category: string;
  unitPrice: Money;
  stock: StockQuantity;
  lowStockThreshold: number;
  lastUpdated: Date;
}

export class InventoryItem extends AggregateRoot<InventoryItemProps> {
  private constructor(props: InventoryItemProps, id?: UniqueEntityId) {
    super(props, id);
  }

  get name(): string {
    return this.props.name;
  }

  get category(): string {
    return this.props.category;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get stock(): StockQuantity {
    return this.props.stock;
  }

  get stockQuantity(): number {
    return this.props.stock.value;
  }

  get unitType(): PackagingUnit {
    return this.props.stock.unit;
  }

  get lowStockThreshold(): number {
    return this.props.lowStockThreshold;
  }

  get isLowStock(): boolean {
    return this.props.stock.value <= this.props.lowStockThreshold;
  }

  get lastUpdated(): Date {
    return this.props.lastUpdated;
  }

  public static create(
    name: string,
    category: string,
    unitPrice: Money,
    initialQuantity: number,
    unitType: PackagingUnit = 'piece',
    lowStockThreshold: number = 10,
    id?: UniqueEntityId
  ): Result<InventoryItem> {
    if (!name || name.trim().length === 0) {
      return Result.fail<InventoryItem>('Inventory item name cannot be empty');
    }
    if (unitPrice.isZero() || unitPrice.amount < 0) {
      return Result.fail<InventoryItem>('Unit price must be greater than zero');
    }

    const stockResult = StockQuantity.create(initialQuantity, unitType);
    if (stockResult.isFailure) return Result.fail<InventoryItem>(stockResult.error!);

    const item = new InventoryItem(
      {
        name: name.trim(),
        category: category || 'General',
        unitPrice,
        stock: stockResult.getValue(),
        lowStockThreshold,
        lastUpdated: new Date(),
      },
      id
    );

    return Result.ok<InventoryItem>(item);
  }

  /**
   * Deduct stock upon sale
   */
  public deductStock(units: number): Result<void> {
    if (units <= 0) {
      return Result.fail<void>('Units to deduct must be greater than zero');
    }

    const newStockResult = this.props.stock.subtract(units);
    if (newStockResult.isFailure) {
      return Result.fail<void>(newStockResult.error!);
    }

    this.props.stock = newStockResult.getValue();
    this.props.lastUpdated = new Date();

    this.addDomainEvent(
      new InventoryStockDeductedEvent(this.id, this.name, units, this.props.stock.value)
    );

    if (this.props.stock.value <= this.props.lowStockThreshold) {
      this.addDomainEvent(
        new LowStockAlertEvent(this.id, this.name, this.props.stock.value, this.props.lowStockThreshold)
      );
    }

    return Result.ok<void>();
  }

  /**
   * Restock units
   */
  public restock(units: number): Result<void> {
    if (units <= 0) {
      return Result.fail<void>('Restock units must be greater than zero');
    }
    const newStock = this.props.stock.add(units);
    if (newStock.isFailure) return Result.fail<void>(newStock.error!);

    this.props.stock = newStock.getValue();
    this.props.lastUpdated = new Date();
    return Result.ok<void>();
  }

  public updatePrice(newPrice: Money): Result<void> {
    if (newPrice.isZero() || newPrice.amount < 0) {
      return Result.fail<void>('Price must be greater than zero');
    }
    this.props.unitPrice = newPrice;
    this.props.lastUpdated = new Date();
    return Result.ok<void>();
  }
}
