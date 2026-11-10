import type { IBudgetRepository } from '../../domain/repositories/IBudgetRepository';
import { ExpenseCategorizerService } from '../../domain/services/ExpenseCategorizerService';
import { Money } from '../../../../shared/domain/Money';
import { Result } from '../../../../shared/domain/Result';
import { DomainEventBus } from '../../../../shared/domain/DomainEventBus';
import { AmbiguityClarificationTriggeredEvent } from '../../domain/events/BudgetEvents';
import type { DeductExpenseInputDTO, DeductExpenseResultDTO } from '../dtos/BudgetDTOs';

export class DeductBudgetExpenseUseCase {
  private budgetRepo: IBudgetRepository;

  constructor(budgetRepo: IBudgetRepository) {
    this.budgetRepo = budgetRepo;
  }

  public async execute(input: DeductExpenseInputDTO): Promise<Result<DeductExpenseResultDTO>> {
    const amountResult = Money.create(input.amount, 'NGN');
    if (amountResult.isFailure) return Result.fail(amountResult.error!);
    const amount = amountResult.getValue();

    // 1. Domain Service categorizes item ("spag" -> "food", "gizmo" -> ambiguous)
    const categorization = ExpenseCategorizerService.categorize(input.itemDescription);

    // 2. Ambiguity handling
    if (!categorization.isResolved || !categorization.categoryId) {
      await DomainEventBus.publish(
        new AmbiguityClarificationTriggeredEvent(
          input.itemDescription,
          amount.format(),
          ['food', 'transport', 'upkeep']
        )
      );

      return Result.ok({
        status: 'AMBIGUITY_DETECTED',
        amountFormatted: amount.format(),
        clarificationQuestion: categorization.clarificationQuestion,
        candidateCategories: categorization.candidateCategories,
        spokenConfirmation: categorization.clarificationQuestion || 'Which category does this belong to?',
      });
    }

    // 3. Apply deduction to BudgetPlan aggregate root
    const plan = await this.budgetRepo.getBudgetPlan();
    const recordResult = plan.recordExpense(
      categorization.categoryId,
      amount,
      categorization.note
    );
    if (recordResult.isFailure) return Result.fail(recordResult.error!);

    const expense = recordResult.getValue();
    const category = plan.getCategory(categorization.categoryId)!;

    // 4. Persist
    await this.budgetRepo.saveBudgetPlan(plan);
    await this.budgetRepo.saveExpense(expense);

    // 5. Dispatch events
    await DomainEventBus.publishAll(plan.domainEvents);
    plan.clearEvents();

    const confirmation = `Deducted ${amount.format()} from your ${category.label} budget ${categorization.note}. Remaining: ${category.remainingAmount.format()}.`;

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
