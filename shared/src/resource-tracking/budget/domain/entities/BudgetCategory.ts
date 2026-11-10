import { Entity } from '../../../../shared/domain/Entity';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';
import { Money } from '../../../../shared/domain/Money';
import { Result } from '../../../../shared/domain/Result';

export interface BudgetCategoryProps {
  label: string;
  allocatedAmount: Money;
  spentAmount: Money;
  color: string;
  iconName: string;
}

export class BudgetCategory extends Entity<BudgetCategoryProps> {
  constructor(props: BudgetCategoryProps, id: UniqueEntityId) {
    super(props, id);
  }

  get categoryId(): string {
    return this._id.toValue();
  }

  get label(): string {
    return this.props.label;
  }

  get allocatedAmount(): Money {
    return this.props.allocatedAmount;
  }

  get spentAmount(): Money {
    return this.props.spentAmount;
  }

  get color(): string {
    return this.props.color;
  }

  get iconName(): string {
    return this.props.iconName;
  }

  get remainingAmount(): Money {
    const diff = this.allocatedAmount.subtract(this.spentAmount);
    return diff.isSuccess ? diff.getValue() : Money.zero(this.allocatedAmount.currency);
  }

  get isOverLimit(): boolean {
    return this.spentAmount.isGreaterThan(this.allocatedAmount);
  }

  public recordExpense(amount: Money): Result<void> {
    if (amount.isZero() || amount.amount < 0) {
      return Result.fail<void>('Expense amount must be greater than zero');
    }
    const newSpent = this.props.spentAmount.add(amount);
    if (newSpent.isFailure) return Result.fail<void>(newSpent.error!);

    this.props.spentAmount = newSpent.getValue();
    return Result.ok<void>();
  }
}
