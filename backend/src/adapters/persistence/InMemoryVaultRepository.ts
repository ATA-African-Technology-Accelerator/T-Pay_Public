import type { IVaultRepository, Vault, VaultLock } from '../../services/ports';

export class InMemoryVaultRepository implements IVaultRepository {
  private readonly vaults = new Map<string, Vault>();

  public async create(vault: Vault): Promise<boolean> {
    if (await this.findOpenForDevice(vault.deviceId)) {
      return false;
    }
    // Same defaults as the database, so both stores read back alike.
    this.vaults.set(vault.id, { ...vault, fundedBy: vault.fundedBy ?? 'PAYPAL' });
    return true;
  }

  public async findById(id: string): Promise<Vault | null> {
    return this.vaults.get(id) ?? null;
  }

  public async findByAuthorizationId(authorizationId: string): Promise<Vault | null> {
    return [...this.vaults.values()].find((vault) => vault.paypalAuthorizationId === authorizationId) ?? null;
  }

  public async findByOrderId(orderId: string): Promise<Vault | null> {
    return [...this.vaults.values()].find((vault) => vault.paypalOrderId === orderId) ?? null;
  }

  public async findDueForRelease(now: Date): Promise<Vault[]> {
    return [...this.vaults.values()].filter(
      ({ settleBy, status }) => status !== 'CLOSED' && settleBy !== null && settleBy <= now,
    );
  }

  public async findDueForReauthorization(now: Date): Promise<Vault[]> {
    return [...this.vaults.values()].filter(({ honorEndsAt, settleBy, status }) =>
      (status === 'ACTIVE' || status === 'SPEND_CLOSED')
      && honorEndsAt !== null && honorEndsAt <= now
      && settleBy !== null && settleBy > now);
  }

  public peek(id: string): Vault {
    return this.vaults.get(id) as Vault;
  }

  public replace(vault: Vault): void {
    this.vaults.set(vault.id, vault);
  }

  public async findOpenForDevice(deviceId: string): Promise<Vault | null> {
    const open = [...this.vaults.values()].find(
      (vault) => vault.deviceId === deviceId && vault.status !== 'CLOSED',
    );
    return open ?? null;
  }

  public async activate(id: string, lock: VaultLock): Promise<Vault | null> {
    const vault = this.vaults.get(id);
    if (vault?.status !== 'PENDING_APPROVAL') {
      return null;
    }
    const active: Vault = { ...vault, ...lock, status: 'ACTIVE' };
    this.vaults.set(id, active);
    return active;
  }

  public async abandon(id: string): Promise<void> {
    const vault = this.vaults.get(id);
    if (vault?.status === 'PENDING_APPROVAL') {
      this.vaults.set(id, { ...vault, status: 'CLOSED' });
    }
  }
}
