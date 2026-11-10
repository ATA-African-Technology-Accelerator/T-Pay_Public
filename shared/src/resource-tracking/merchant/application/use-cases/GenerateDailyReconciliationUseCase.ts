import type { IInventoryRepository } from '../../domain/repositories/IInventoryRepository';
import { Result } from '../../../../shared/domain/Result';
import { Money } from '../../../../shared/domain/Money';
import type { DailyReconciliationDTO } from '../dtos/MerchantDTOs';

export class GenerateDailyReconciliationUseCase {
  private inventoryRepo: IInventoryRepository;

  constructor(inventoryRepo: IInventoryRepository) {
    this.inventoryRepo = inventoryRepo;
  }

  public async execute(): Promise<Result<DailyReconciliationDTO>> {
    const sales = await this.inventoryRepo.getSales();
    const inventory = await this.inventoryRepo.findAll();

    let totalRevenue = Money.zero('NGN');
    const methodCounts: Record<string, { count: number; amount: number }> = {};

    for (const sale of sales) {
      totalRevenue = totalRevenue.add(sale.totalAmount).getValue();
      const m = sale.paymentMethod;
      if (!methodCounts[m]) {
        methodCounts[m] = { count: 0, amount: 0 };
      }
      methodCounts[m].count += 1;
      methodCounts[m].amount += sale.totalAmount.amount;
    }

    const breakdown = Object.entries(methodCounts).map(([method, data]) => ({
      method,
      count: data.count,
      amountFormatted: Money.create(data.amount, 'NGN').getValue().format(),
    }));

    const lowStockItems = inventory
      .filter((item) => item.isLowStock)
      .map((item) => ({
        name: item.name,
        currentStock: item.stockQuantity,
        unitType: item.unitType,
      }));

    // Localized natural readout script to bridge literacy gap
    let readoutScript = `Daily Summary: You made ${sales.length} sales today totaling ${totalRevenue.format()}.`;
    if (lowStockItems.length > 0) {
      readoutScript += ` Notice: ${lowStockItems.map((l) => `${l.name} has only ${l.currentStock} left`).join(', ')}. Please restock soon.`;
    }

    return Result.ok({
      date: new Date().toLocaleDateString(),
      totalSalesCount: sales.length,
      totalRevenueFormatted: totalRevenue.format(),
      breakdownByPaymentMethod: breakdown,
      lowStockItems,
      readoutScript,
    });
  }
}
