import type { Request, Response } from 'express';
import { container } from '@tpay/shared/container';

export class BudgetController {
  public static async getPlan(req: Request, res: Response): Promise<void> {
    try {
      const plan = await container.budgetRepository.getBudgetPlan();
      const expenses = await container.budgetRepository.getExpenses();
      const categories = plan.categories.map((c) => ({
        id: c.categoryId,
        label: c.label,
        allocated: c.allocatedAmount.amount,
        allocatedFormatted: c.allocatedAmount.format(),
        spent: c.spentAmount.amount,
        spentFormatted: c.spentAmount.format(),
        remainingFormatted: c.remainingAmount.format(),
        color: c.color,
        iconName: c.iconName,
        isOverLimit: c.isOverLimit,
      }));

      res.status(200).json({
        success: true,
        data: {
          categories,
          expenses: expenses.map((e) => ({
            id: e.id.toValue(),
            categoryId: e.categoryId,
            amount: e.amount.format(),
            note: e.note,
            timestamp: e.timestamp.toLocaleDateString(),
          })),
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  public static async deductExpense(req: Request, res: Response): Promise<void> {
    try {
      const { amount, description } = req.body;
      const result = await container.deductBudgetExpenseUseCase.execute({
        amount: Number(amount) || 0,
        itemDescription: description || 'general',
      });

      if (result.isSuccess) {
        res.status(200).json({ success: true, data: result.getValue() });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  public static async resolveAmbiguity(req: Request, res: Response): Promise<void> {
    try {
      const { selectedCategoryId, amount, originalDescription } = req.body;
      const result = await container.resolveCategoryAmbiguityUseCase.execute({
        selectedCategoryId,
        amount: Number(amount),
        originalDescription: originalDescription || '',
      });

      if (result.isSuccess) {
        res.status(200).json({ success: true, data: result.getValue() });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}

