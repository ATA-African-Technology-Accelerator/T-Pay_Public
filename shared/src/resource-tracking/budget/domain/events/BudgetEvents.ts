import type { IDomainEvent } from '../../../../shared/domain/DomainEvent';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';

export class ExpenseRecordedEvent implements IDomainEvent {
  public dateTimeOccurred: Date = new Date();
  public eventId: string = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  public readonly planId: UniqueEntityId;
  public readonly categoryId: string;
  public readonly amountFormatted: string;
  public readonly note: string;
  public readonly remainingFormatted: string;

  constructor(
    planId: UniqueEntityId,
    categoryId: string,
    amountFormatted: string,
    note: string,
    remainingFormatted: string
  ) {
    this.planId = planId;
    this.categoryId = categoryId;
    this.amountFormatted = amountFormatted;
    this.note = note;
    this.remainingFormatted = remainingFormatted;
  }

  getAggregateId(): UniqueEntityId {
    return this.planId;
  }
}

export class BudgetLimitExceededEvent implements IDomainEvent {
  public dateTimeOccurred: Date = new Date();
  public eventId: string = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  public readonly planId: UniqueEntityId;
  public readonly categoryId: string;
  public readonly categoryLabel: string;
  public readonly overspentFormatted: string;

  constructor(
    planId: UniqueEntityId,
    categoryId: string,
    categoryLabel: string,
    overspentFormatted: string
  ) {
    this.planId = planId;
    this.categoryId = categoryId;
    this.categoryLabel = categoryLabel;
    this.overspentFormatted = overspentFormatted;
  }

  getAggregateId(): UniqueEntityId {
    return this.planId;
  }
}

export class AmbiguityClarificationTriggeredEvent implements IDomainEvent {
  public dateTimeOccurred: Date = new Date();
  public eventId: string = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  public readonly unknownItem: string;
  public readonly amountFormatted: string;
  public readonly suggestedCategories: string[];

  constructor(
    unknownItem: string,
    amountFormatted: string,
    suggestedCategories: string[]
  ) {
    this.unknownItem = unknownItem;
    this.amountFormatted = amountFormatted;
    this.suggestedCategories = suggestedCategories;
  }

  getAggregateId(): UniqueEntityId {
    return new UniqueEntityId('budget-clarification');
  }
}
