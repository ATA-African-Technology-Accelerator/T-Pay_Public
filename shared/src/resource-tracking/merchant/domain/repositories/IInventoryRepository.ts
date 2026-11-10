import { InventoryItem } from '../InventoryItem';
import { MerchantSale } from '../entities/MerchantSale';

export interface IInventoryRepository {
  save(item: InventoryItem): Promise<void>;
  saveBatch(items: InventoryItem[]): Promise<void>;
  findById(id: string): Promise<InventoryItem | null>;
  findByName(name: string): Promise<InventoryItem | null>;
  findAll(): Promise<InventoryItem[]>;
  saveSale(sale: MerchantSale): Promise<void>;
  getSales(): Promise<MerchantSale[]>;
}

