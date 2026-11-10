import { Entity } from '../../../../shared/domain/Entity';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';
import { Money } from '../../../../shared/domain/Money';

export interface MerchantSaleProps {
  itemId: string;
  itemName: string;
  quantitySold: number;
  totalAmount: Money;
  paymentMethod: 'bluetooth_escrow' | 'cash' | 'paypal' | 'qr_code';
  timestamp: Date;
}

export class MerchantSale extends Entity<MerchantSaleProps> {
  constructor(props: MerchantSaleProps, id?: UniqueEntityId) {
    super(props, id);
  }

  get itemId(): string {
    return this.props.itemId;
  }

  get itemName(): string {
    return this.props.itemName;
  }

  get quantitySold(): number {
    return this.props.quantitySold;
  }

  get totalAmount(): Money {
    return this.props.totalAmount;
  }

  get paymentMethod(): string {
    return this.props.paymentMethod;
  }

  get timestamp(): Date {
    return this.props.timestamp;
  }
}
