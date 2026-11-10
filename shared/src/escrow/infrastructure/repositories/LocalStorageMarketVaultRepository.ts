import type { IMarketVaultRepository } from '../../domain/repositories/IMarketVaultRepository';
import { MarketVault } from '../../domain/MarketVault';
import { Money } from '../../../shared/domain/Money';
import { UniqueEntityId } from '../../../shared/domain/Identifier';

export class LocalStorageMarketVaultRepository implements IMarketVaultRepository {
  private vaults: Map<string, MarketVault> = new Map();

  constructor() {
    // Seed initial demo vault: ₦10,000 locked for 24h on PayPal
    const initialVault = MarketVault.create(
      'user-malik',
      Money.create(10000, 'NGN').getValue(),
      24,
      new UniqueEntityId('vault-demo-1')
    ).getValue();
    this.vaults.set(initialVault.id.toValue(), initialVault);
  }

  public async getActiveVault(userId: string): Promise<MarketVault | null> {
    for (const vault of this.vaults.values()) {
      if (vault.userId === userId && vault.isActive) {
        return vault;
      }
    }
    return null;
  }

  public async save(vault: MarketVault): Promise<void> {
    this.vaults.set(vault.id.toValue(), vault);
  }

  public async getAllVaults(userId: string): Promise<MarketVault[]> {
    return Array.from(this.vaults.values()).filter((v) => v.userId === userId);
  }
}
