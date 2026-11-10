import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { UniqueEntityId } from '../../../shared/domain/Identifier';
import { Money } from '../../../shared/domain/Money';
import { Result } from '../../../shared/domain/Result';
import { BudgetCategory } from './entities/BudgetCategory';
import { ExpenseRecord } from './entities/ExpenseRecord';
import { ExpenseRecordedEvent, BudgetLimitExceededEvent } from './events/BudgetEvents';

export interface BudgetPlanProps {
  categories: Map<string, BudgetCategory>;
  expenses: ExpenseRecord[];
}

export class BudgetPlan extends AggregateRoot<BudgetPlanProps> {
  private constructor(props: BudgetPlanProps, id?: UniqueEntityId) {
    super(props, id);
  }

  get categories(): BudgetCategory[] {
    return Array.from(this.props.categories.values());
  }

  get expenses(): ExpenseRecord[] {
    return [...this.props.expenses];
  }

  public static create(categories: BudgetCategory[], id?: UniqueEntityId): Result<BudgetPlan> {
    const map = new Map<string, BudgetCategory>();
    for (const cat of categories) {
      map.set(cat.categoryId, cat);
    }
    return Result.ok<BudgetPlan>(
      new BudgetPlan(
        {
          categories: map,
          expenses: [],
        },
        id
      )
    );
  }

  public getCategory(categoryId: string): BudgetCategory | undefined {
    return this.props.categories.get(categoryId);
  }

  public recordExpense(categoryId: string, amount: Money, note: string): Result<ExpenseRecord> {
    const category = this.props.categories.get(categoryId);
    if (!category) {
      return Result.fail<ExpenseRecord>(`Budget category "${categoryId}" does not exist`);
    }

    const deductResult = category.recordExpense(amount);
    if (deductResult.isFailure) {
      return Result.fail<ExpenseRecord>(deductResult.error!);
    }

    const expense = new ExpenseRecord({
      categoryId,
      amount,
      note,
      timestamp: new Date(),
    });

    this.props.expenses.unshift(expense);

    this.addDomainEvent(
      new ExpenseRecordedEvent(
        this.id,
        categoryId,
        amount.format(),
        note,
        category.remainingAmount.format()
      )
    );

    if (category.isOverLimit) {
      this.addDomainEvent(
        new BudgetLimitExceededEvent(
          this.id,
          categoryId,
          category.label,
          category.spentAmount.format()
        )
      );
    }

    return Result.ok<ExpenseRecord>(expense);
  }
}

