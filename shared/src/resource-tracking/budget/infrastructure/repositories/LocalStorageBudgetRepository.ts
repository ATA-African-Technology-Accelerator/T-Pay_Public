import type { IBudgetRepository } from '../../domain/repositories/IBudgetRepository';
import { BudgetPlan } from '../../domain/BudgetPlan';
import { BudgetCategory } from '../../domain/entities/BudgetCategory';
import { ExpenseRecord } from '../../domain/entities/ExpenseRecord';
import { Money } from '../../../../shared/domain/Money';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';

const BUDGET_STORAGE_KEY = 'tpay_user_budget_plan';
const EXPENSES_STORAGE_KEY = 'tpay_user_expenses';

export class LocalStorageBudgetRepository implements IBudgetRepository {
  private planCache: BudgetPlan | null = null;
  private expensesCache: ExpenseRecord[] = [];

  constructor() {
    this.initDefaultPlan();
    this.loadFromStorage();
  }

  private initDefaultPlan(): void {
    const defaultCategories: BudgetCategory[] = [
      new BudgetCategory(
        {
          label: 'Food & Groceries',
          allocatedAmount: Money.create(60000, 'NGN').getValue(),
          spentAmount: Money.create(24000, 'NGN').getValue(),
          color: '#ef4444',
          iconName: 'Utensils',
        },
        new UniqueEntityId('food')
      ),
      new BudgetCategory(
        {
          label: 'Transportation & Fuel',
          allocatedAmount: Money.create(35000, 'NGN').getValue(),
          spentAmount: Money.create(14200, 'NGN').getValue(),
          color: '#3b82f6',
          iconName: 'Bus',
        },
        new UniqueEntityId('transport')
      ),
      new BudgetCategory(
        {
          label: 'Upkeep & Personal Care',
          allocatedAmount: Money.create(25000, 'NGN').getValue(),
          spentAmount: Money.create(8500, 'NGN').getValue(),
          color: '#10b981',
          iconName: 'Sparkles',
        },
        new UniqueEntityId('upkeep')
      ),
      new BudgetCategory(
        {
          label: 'Emergency & Miscellaneous',
          allocatedAmount: Money.create(20000, 'NGN').getValue(),
          spentAmount: Money.create(5000, 'NGN').getValue(),
          color: '#f59e0b',
          iconName: 'ShieldAlert',
        },
        new UniqueEntityId('other')
      ),
    ];

    this.planCache = BudgetPlan.create(defaultCategories).getValue();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const stored = window.localStorage.getItem(BUDGET_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const cats: BudgetCategory[] = parsed.map((c: any) =>
        new BudgetCategory(
          {
            label: c.label,
            allocatedAmount: Money.create(c.allocated, 'NGN').getValue(),
            spentAmount: Money.create(c.spent, 'NGN').getValue(),
            color: c.color,
            iconName: c.iconName,
          },
          new UniqueEntityId(c.id)
        )
      );
      this.planCache = BudgetPlan.create(cats).getValue();
    } catch (e) {
      console.warn('[LocalStorageBudgetRepository] load error:', e);
    }
  }

  private persist(): void {
    if (typeof window === 'undefined' || !window.localStorage || !this.planCache) return;
    try {
      const serialized = this.planCache.categories.map((c) => ({
        id: c.categoryId,
        label: c.label,
        allocated: c.allocatedAmount.amount,
        spent: c.spentAmount.amount,
        color: c.color,
        iconName: c.iconName,
      }));
      window.localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(serialized));
    } catch (e) {
      console.warn('[LocalStorageBudgetRepository] persist error:', e);
    }
  }

  public async getBudgetPlan(): Promise<BudgetPlan> {
    if (!this.planCache) {
      this.initDefaultPlan();
    }
    return this.planCache!;
  }

  public async saveBudgetPlan(plan: BudgetPlan): Promise<void> {
    this.planCache = plan;
    this.persist();
  }

  public async saveExpense(expense: ExpenseRecord): Promise<void> {
    this.expensesCache.unshift(expense);
  }

  public async getExpenses(): Promise<ExpenseRecord[]> {
    return [...this.expensesCache];
  }
}
