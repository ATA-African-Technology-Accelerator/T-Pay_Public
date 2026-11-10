export interface DeductExpenseInputDTO {
  amount: number;
  itemDescription: string;
}

export interface DeductExpenseResultDTO {
  status: 'SUCCESS' | 'AMBIGUITY_DETECTED';
  expenseId?: string;
  categoryId?: string;
  categoryLabel?: string;
  amountFormatted: string;
  remainingBudgetFormatted?: string;
  clarificationQuestion?: string;
  candidateCategories?: { id: string; label: string }[];
  spokenConfirmation: string;
}

export interface ResolveAmbiguityInputDTO {
  selectedCategoryId: string;
  amount: number;
  originalDescription: string;
}

