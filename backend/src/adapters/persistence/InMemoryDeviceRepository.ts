import type { Device, IDeviceRepository } from '../../services/ports';





export class InMemoryDeviceRepository implements IDeviceRepository {
  private readonly devices = new Map<string, Device>();

  public async findById(id: string): Promise<Device | null> {
    return this.findWhere((device) => device.id === id);
  }

  public async findByKeyId(keyId: string): Promise<Device | null> {
    return this.findWhere((device) => device.keyId === keyId);
  }

  public async findByPublicKey(publicKey: string): Promise<Device | null> {
    return this.findWhere((device) => device.publicKey === publicKey);
  }

  public async findByTokenHash(tokenHash: string): Promise<Device | null> {
    return this.findWhere((device) => device.tokenHash === tokenHash);
  }

  public async save(device: Device): Promise<Device> {
    const existing = this.devices.get(device.publicKey);
    const saved = existing
      ? {
          ...device,
          id: existing.id,
          keyId: existing.keyId,
          createdAt: existing.createdAt,
          revokedAt: existing.revokedAt ?? device.revokedAt,
        }
      : device;
    this.devices.set(device.publicKey, saved);
    return saved;
  }

  private findWhere(matches: (device: Device) => boolean): Device | null {
    return [...this.devices.values()].find(matches) ?? null;
  }
}