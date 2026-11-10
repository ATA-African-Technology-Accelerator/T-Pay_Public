import type { Request, Response } from 'express';
import { container } from '@tpay/shared/container';

export class InventoryController {
  public static async getInventory(req: Request, res: Response): Promise<void> {
    try {
      const items = await container.inventoryRepository.findAll();
      const serialized = items.map((i) => ({
        id: i.id.toValue(),
        name: i.name,
        category: i.category,
        unitPrice: i.unitPrice.amount,
        unitPriceFormatted: i.unitPrice.format(),
        stockQuantity: i.stockQuantity,
        unitType: i.unitType,
        isLowStock: i.isLowStock,
      }));
      res.status(200).json({ success: true, count: serialized.length, data: serialized });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  public static async processVoiceSale(req: Request, res: Response): Promise<void> {
    try {
      const { spokenQuery, matchedItemName, currencyAmount, paymentMethod } = req.body;
      const result = await container.processVoiceSaleUseCase.execute({
        spokenQuery: spokenQuery || 'collect payment',
        matchedItemName: matchedItemName || 'coke',
        currencyAmount: Number(currencyAmount) || 1000,
        paymentMethod: paymentMethod || 'bluetooth_escrow',
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

  public static async bulkImport(req: Request, res: Response): Promise<void> {
    try {
      const { spokenTranscript } = req.body;
      const result = await container.bulkImportVoiceInventoryUseCase.execute({
        spokenTranscript: spokenTranscript || '',
      });

      if (result.isSuccess) {
        res.status(201).json({ success: true, data: result.getValue() });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  public static async getReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const result = await container.generateDailyReconciliationUseCase.execute();
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

