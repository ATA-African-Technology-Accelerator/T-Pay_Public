import { BudgetPlan } from '../BudgetPlan';
import { ExpenseRecord } from '../entities/ExpenseRecord';

export interface IBudgetRepository {
  getBudgetPlan(): Promise<BudgetPlan>;
  saveBudgetPlan(plan: BudgetPlan): Promise<void>;
  saveExpense(expense: ExpenseRecord): Promise<void>;
  getExpenses(): Promise<ExpenseRecord[]>;
}

