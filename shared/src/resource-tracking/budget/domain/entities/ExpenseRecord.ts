import { Entity } from '../../../../shared/domain/Entity';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';
import { Money } from '../../../../shared/domain/Money';

export interface ExpenseRecordProps {
  categoryId: string;
  amount: Money;
  note: string;
  timestamp: Date;
}

export class ExpenseRecord extends Entity<ExpenseRecordProps> {
  constructor(props: ExpenseRecordProps, id?: UniqueEntityId) {
    super(props, id);
  }

  get categoryId(): string {
    return this.props.categoryId;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get note(): string {
    return this.props.note;
  }

  get timestamp(): Date {
    return this.props.timestamp;
  }
}
