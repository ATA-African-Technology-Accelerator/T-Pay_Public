import type { IBudgetRepository } from '../../domain/repositories/IBudgetRepository';
import { Money } from '../../../../shared/domain/Money';
import { Result } from '../../../../shared/domain/Result';
import { DomainEventBus } from '../../../../shared/domain/DomainEventBus';
import type { ResolveAmbiguityInputDTO, DeductExpenseResultDTO } from '../dtos/BudgetDTOs';

export class ResolveCategoryAmbiguityUseCase {
  private budgetRepo: IBudgetRepository;

  constructor(budgetRepo: IBudgetRepository) {
    this.budgetRepo = budgetRepo;
  }

  public async execute(input: ResolveAmbiguityInputDTO): Promise<Result<DeductExpenseResultDTO>> {
    const amount = Money.create(input.amount, 'NGN').getValue();
    const plan = await this.budgetRepo.getBudgetPlan();

    const note = `for ${input.originalDescription}`;
    const recordResult = plan.recordExpense(input.selectedCategoryId, amount, note);
    if (recordResult.isFailure) return Result.fail(recordResult.error!);

    const expense = recordResult.getValue();
    const category = plan.getCategory(input.selectedCategoryId)!;

    await this.budgetRepo.saveBudgetPlan(plan);
    await this.budgetRepo.saveExpense(expense);
    await DomainEventBus.publishAll(plan.domainEvents);
    plan.clearEvents();

    const confirmation = `Noted! Deducted ${amount.format()} from ${category.label} ${note}. Remaining balance: ${category.remainingAmount.format()}.`;

    return Result.ok({
      status: 'SUCCESS',
      expenseId: expense.id.toValue(),
      categoryId: category.categoryId,
      categoryLabel: category.label,
      amountFormatted: amount.format(),
      remainingBudgetFormatted: category.remainingAmount.format(),
      spokenConfirmation: confirmation,
    });
  }
}
