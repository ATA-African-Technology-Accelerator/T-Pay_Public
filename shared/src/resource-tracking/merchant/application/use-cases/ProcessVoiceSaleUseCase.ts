import type { IInventoryRepository } from '../../domain/repositories/IInventoryRepository';
import { PriceToQuantityCalculator } from '../../domain/services/PriceToQuantityCalculator';
import { MerchantSale } from '../../domain/entities/MerchantSale';
import { Money } from '../../../../shared/domain/Money';
import { Result } from '../../../../shared/domain/Result';
import { DomainEventBus } from '../../../../shared/domain/DomainEventBus';
import type { ProcessVoiceSaleInputDTO, VoiceSaleResultDTO } from '../dtos/MerchantDTOs';

export class ProcessVoiceSaleUseCase {
  private inventoryRepo: IInventoryRepository;

  constructor(inventoryRepo: IInventoryRepository) {
    this.inventoryRepo = inventoryRepo;
  }

  public async execute(input: ProcessVoiceSaleInputDTO): Promise<Result<VoiceSaleResultDTO>> {
    // 1. Find item in merchant registered stock
    const item = await this.inventoryRepo.findByName(input.matchedItemName);
    if (!item) {
      return Result.fail(`Item "${input.matchedItemName}" not found in registered inventory.`);
    }

    // 2. Wrap payment money
    const amountResult = Money.create(input.currencyAmount, 'NGN');
    if (amountResult.isFailure) return Result.fail(amountResult.error!);
    const amount = amountResult.getValue();

    // 3. Domain Service: calculate exact units from currency (e.g. 1000 / 500 = 2 bottles)
    const calculation = PriceToQuantityCalculator.calculateUnits(item, amount);
    if (calculation.isFailure) return Result.fail(calculation.error!);

    const { unitsToDeduct, unitType } = calculation.getValue();

    // 4. Invariant check & stock deduction
    const deductResult = item.deductStock(unitsToDeduct);
    if (deductResult.isFailure) {
      return Result.fail(`Cannot complete sale: ${deductResult.error!}`);
    }

    // 5. Create sale entity
    const sale = new MerchantSale({
      itemId: item.id.toValue(),
      itemName: item.name,
      quantitySold: unitsToDeduct,
      totalAmount: amount,
      paymentMethod: input.paymentMethod || 'bluetooth_escrow',
      timestamp: new Date(),
    });

    // 6. Persist changes
    await this.inventoryRepo.save(item);
    await this.inventoryRepo.saveSale(sale);

    // 7. Dispatch domain events (e.g. StockDeductedEvent, LowStockAlertEvent)
    await DomainEventBus.publishAll(item.domainEvents);
    item.clearEvents();

    // 8. Return structured result & localized voice confirmation for audio readout
    const confirmation = `Sold ${unitsToDeduct} ${unitType}${unitsToDeduct > 1 ? 's' : ''} of ${item.name} for ${amount.format()}. Remaining in stock: ${item.stockQuantity}.`;

    return Result.ok({
      saleId: sale.id.toValue(),
      itemName: item.name,
      unitsSold: unitsToDeduct,
      unitType: item.unitType,
      totalAmountFormatted: amount.format(),
      remainingStock: item.stockQuantity,
      spokenConfirmation: confirmation,
      isLowStock: item.isLowStock,
    });
  }
}
