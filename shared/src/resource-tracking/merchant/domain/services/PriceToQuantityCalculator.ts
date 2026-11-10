import { Money } from '../../../../shared/domain/Money';
import { InventoryItem } from '../InventoryItem';
import { Result } from '../../../../shared/domain/Result';

export interface QuantityCalculationResult {
  unitsToDeduct: number;
  unitPrice: Money;
  totalAmount: Money;
  unitType: string;
}

/**
 * Domain Service that calculates exact item deduction units from a spoken total currency payment.
 * Implements Example Case 1: "collect one thousand for coke" -> ₦1,000 / ₦500 = 2 bottles.
 */
export class PriceToQuantityCalculator {
  public static calculateUnits(item: InventoryItem, paymentAmount: Money): Result<QuantityCalculationResult> {
    if (paymentAmount.currency !== item.unitPrice.currency) {
      return Result.fail<QuantityCalculationResult>(
        `Currency mismatch: Payment is in ${paymentAmount.currency} but item is priced in ${item.unitPrice.currency}`
      );
    }

    if (item.unitPrice.isZero()) {
      return Result.fail<QuantityCalculationResult>('Unit price cannot be zero');
    }

    const calculatedUnits = paymentAmount.amount / item.unitPrice.amount;

    // Check if the amount corresponds to a whole or reasonable unit
    if (!Number.isInteger(calculatedUnits)) {
      return Result.fail<QuantityCalculationResult>(
        `Payment amount ${paymentAmount.format()} does not evenly match unit price ${item.unitPrice.format()} (${calculatedUnits.toFixed(2)} ${item.unitType}s)`
      );
    }

    if (calculatedUnits <= 0) {
      return Result.fail<QuantityCalculationResult>('Calculated units must be greater than zero');
    }

    return Result.ok<QuantityCalculationResult>({
      unitsToDeduct: calculatedUnits,
      unitPrice: item.unitPrice,
      totalAmount: paymentAmount,
      unitType: item.unitType,
    });
  }
}
