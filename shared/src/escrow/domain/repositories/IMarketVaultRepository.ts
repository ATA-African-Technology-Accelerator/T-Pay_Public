import { MarketVault } from '../MarketVault';

export interface IMarketVaultRepository {
  getActiveVault(userId: string): Promise<MarketVault | null>;
  save(vault: MarketVault): Promise<void>;
  getAllVaults(userId: string): Promise<MarketVault[]>;
}
