import type { IInventoryRepository } from '../../domain/repositories/IInventoryRepository';
import { InventoryItem } from '../../domain/InventoryItem';
import { MerchantSale } from '../../domain/entities/MerchantSale';
import { Money } from '../../../../shared/domain/Money';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';
import type { PackagingUnit } from '../../domain/value-objects/StockQuantity';

const INVENTORY_STORAGE_KEY = 'tpay_merchant_inventory';
const SALES_STORAGE_KEY = 'tpay_merchant_sales';

export class LocalStorageInventoryRepository implements IInventoryRepository {
  private itemCache: Map<string, InventoryItem> = new Map();
  private salesCache: MerchantSale[] = [];

  constructor(initialItems?: InventoryItem[]) {
    if (initialItems && initialItems.length > 0) {
      for (const item of initialItems) {
        this.itemCache.set(item.id.toValue(), item);
      }
    }
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const invData = window.localStorage.getItem(INVENTORY_STORAGE_KEY);
      if (invData) {
        const list = JSON.parse(invData);
        for (const raw of list) {
          const money = Money.create(raw.unitPrice, 'NGN').getValue();
          const item = InventoryItem.create(
            raw.name,
            raw.category,
            money,
            raw.stockQuantity,
            raw.unitType as PackagingUnit,
            raw.lowStockThreshold,
            new UniqueEntityId(raw.id)
          ).getValue();
          this.itemCache.set(item.id.toValue(), item);
        }
      }
    } catch (e) {
      console.warn('[LocalStorageInventoryRepository] load error:', e);
    }
  }

  private persist(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const serialized = Array.from(this.itemCache.values()).map((i) => ({
        id: i.id.toValue(),
        name: i.name,
        category: i.category,
        unitPrice: i.unitPrice.amount,
        stockQuantity: i.stockQuantity,
        unitType: i.unitType,
        lowStockThreshold: i.lowStockThreshold,
      }));
      window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(serialized));
    } catch (e) {
      console.warn('[LocalStorageInventoryRepository] persist error:', e);
    }
  }

  public async save(item: InventoryItem): Promise<void> {
    this.itemCache.set(item.id.toValue(), item);
    this.persist();
  }

  public async saveBatch(items: InventoryItem[]): Promise<void> {
    for (const item of items) {
      this.itemCache.set(item.id.toValue(), item);
    }
    this.persist();
  }

  public async findById(id: string): Promise<InventoryItem | null> {
    return this.itemCache.get(id) || null;
  }

  public async findByName(name: string): Promise<InventoryItem | null> {
    const query = name.toLowerCase().trim();
    for (const item of this.itemCache.values()) {
      if (item.name.toLowerCase().includes(query) || query.includes(item.name.toLowerCase())) {
        return item;
      }
    }
    return null;
  }

  public async findAll(): Promise<InventoryItem[]> {
    return Array.from(this.itemCache.values());
  }

  public async saveSale(sale: MerchantSale): Promise<void> {
    this.salesCache.unshift(sale);
  }

  public async getSales(): Promise<MerchantSale[]> {
    return [...this.salesCache];
  }
}
