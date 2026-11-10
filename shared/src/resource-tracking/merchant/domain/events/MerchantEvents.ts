import type { IDomainEvent } from '../../../../shared/domain/DomainEvent';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';

export class InventoryStockDeductedEvent implements IDomainEvent {
  public dateTimeOccurred: Date = new Date();
  public eventId: string = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  public readonly itemId: UniqueEntityId;
  public readonly itemName: string;
  public readonly unitsDeducted: number;
  public readonly remainingUnits: number;

  constructor(
    itemId: UniqueEntityId,
    itemName: string,
    unitsDeducted: number,
    remainingUnits: number
  ) {
    this.itemId = itemId;
    this.itemName = itemName;
    this.unitsDeducted = unitsDeducted;
    this.remainingUnits = remainingUnits;
  }

  getAggregateId(): UniqueEntityId {
    return this.itemId;
  }
}

export class LowStockAlertEvent implements IDomainEvent {
  public dateTimeOccurred: Date = new Date();
  public eventId: string = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  public readonly itemId: UniqueEntityId;
  public readonly itemName: string;
  public readonly currentStock: number;
  public readonly threshold: number;

  constructor(
    itemId: UniqueEntityId,
    itemName: string,
    currentStock: number,
    threshold: number
  ) {
    this.itemId = itemId;
    this.itemName = itemName;
    this.currentStock = currentStock;
    this.threshold = threshold;
  }

  getAggregateId(): UniqueEntityId {
    return this.itemId;
  }
}

export class VoiceInventoryBatchImportedEvent implements IDomainEvent {
  public dateTimeOccurred: Date = new Date();
  public eventId: string = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  public readonly totalItemsImported: number;
  public readonly rawSpokenTranscript: string;

  constructor(totalItemsImported: number, rawSpokenTranscript: string) {
    this.totalItemsImported = totalItemsImported;
    this.rawSpokenTranscript = rawSpokenTranscript;
  }

  getAggregateId(): UniqueEntityId {
    return new UniqueEntityId('batch-import');
  }
}
