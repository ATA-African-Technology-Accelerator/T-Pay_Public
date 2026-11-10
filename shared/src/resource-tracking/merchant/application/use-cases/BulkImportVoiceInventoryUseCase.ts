import type { IInventoryRepository } from '../../domain/repositories/IInventoryRepository';
import { SpokenInventoryParser } from '../../domain/services/SpokenInventoryParser';
import { InventoryItem } from '../../domain/InventoryItem';
import { Money } from '../../../../shared/domain/Money';
import { Result } from '../../../../shared/domain/Result';
import { DomainEventBus } from '../../../../shared/domain/DomainEventBus';
import { VoiceInventoryBatchImportedEvent } from '../../domain/events/MerchantEvents';
import type { BulkImportInputDTO, BulkImportResultDTO } from '../dtos/MerchantDTOs';

export class BulkImportVoiceInventoryUseCase {
  private inventoryRepo: IInventoryRepository;

  constructor(inventoryRepo: IInventoryRepository) {
    this.inventoryRepo = inventoryRepo;
  }

  public async execute(input: BulkImportInputDTO): Promise<Result<BulkImportResultDTO>> {
    // 1. Domain Service: Parse spoken stream
    const parseResult = SpokenInventoryParser.parse(input.spokenTranscript);
    if (parseResult.isFailure) return Result.fail(parseResult.error!);

    const parsedItems = parseResult.getValue();
    const createdItems: InventoryItem[] = [];

    // 2. Instantiate InventoryItem aggregate roots
    for (const p of parsedItems) {
      const money = Money.create(p.unitPrice, 'NGN').getValue();
      const itemResult = InventoryItem.create(
        p.name,
        p.category,
        money,
        p.quantity,
        p.unitType,
        10
      );
      if (itemResult.isSuccess) {
        createdItems.push(itemResult.getValue());
      }
    }

    // 3. Batch persist
    await this.inventoryRepo.saveBatch(createdItems);

    // 4. Domain event
    const event = new VoiceInventoryBatchImportedEvent(createdItems.length, input.spokenTranscript);
    await DomainEventBus.publish(event);

    // 5. Generate confirmation summary for audio readout
    const summaryLines = createdItems.map(
      (i) => `${i.name}: ${i.stockQuantity} ${i.unitType}s at ${i.unitPrice.format()} each`
    );
    const spreadsheetSummaryText = `Recorded ${createdItems.length} items in your inventory sheet: ${summaryLines.join(', ')}.`;

    return Result.ok({
      itemsCount: createdItems.length,
      importedItems: createdItems.map((i) => ({
        id: i.id.toValue(),
        name: i.name,
        quantity: i.stockQuantity,
        unitType: i.unitType,
        unitPriceFormatted: i.unitPrice.format(),
        category: i.category,
      })),
      spreadsheetSummaryText,
    });
  }
}
