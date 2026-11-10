import type { IEscrowRepository } from '../../domain/repositories/IEscrowRepository';
import { OfflineEscrowToken } from '../../domain/OfflineEscrowToken';
import { DeviceIdentity } from '../../domain/value-objects/DeviceIdentity';
import { Cryptogram } from '../../domain/value-objects/Cryptogram';
import type { EscrowStatus } from '../../domain/value-objects/EscrowStatus';
import { Money } from '../../../shared/domain/Money';
import { UniqueEntityId } from '../../../shared/domain/Identifier';

const STORAGE_KEY = 'tpay_offline_escrow_tokens';

export class LocalStorageEscrowRepository implements IEscrowRepository {
  private memoryCache: Map<string, OfflineEscrowToken> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const serialized = window.localStorage.getItem(STORAGE_KEY);
      if (!serialized) return;
      const list = JSON.parse(serialized);
      for (const raw of list) {
        const token = this.deserialize(raw);
        if (token) {
          this.memoryCache.set(token.id.toValue(), token);
        }
      }
    } catch (e) {
      console.warn('[LocalStorageEscrowRepository] Failed to read from localStorage:', e);
    }
  }

  private persistToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const serialized = Array.from(this.memoryCache.values()).map((t) => this.serialize(t));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch (e) {
      console.warn('[LocalStorageEscrowRepository] Failed to write to localStorage:', e);
    }
  }

  public async save(token: OfflineEscrowToken): Promise<void> {
    this.memoryCache.set(token.id.toValue(), token);
    this.persistToStorage();
  }

  public async findById(id: string): Promise<OfflineEscrowToken | null> {
    return this.memoryCache.get(id) || null;
  }

  public async findAll(): Promise<OfflineEscrowToken[]> {
    return Array.from(this.memoryCache.values());
  }

  public async findUnsynced(): Promise<OfflineEscrowToken[]> {
    return Array.from(this.memoryCache.values()).filter((t) => !t.isSettled);
  }

  public async findByDeviceId(deviceId: string): Promise<OfflineEscrowToken[]> {
    return Array.from(this.memoryCache.values()).filter(
      (t) => t.sender.deviceId === deviceId || t.recipient.deviceId === deviceId
    );
  }

  private serialize(token: OfflineEscrowToken): any {
    return {
      id: token.id.toValue(),
      sender: {
        deviceId: token.sender.deviceId,
        name: token.sender.name,
        accountNumber: token.sender.accountNumber,
      },
      recipient: {
        deviceId: token.recipient.deviceId,
        name: token.recipient.name,
        accountNumber: token.recipient.accountNumber,
      },
      amount: {
        amount: token.amount.amount,
        currency: token.amount.currency,
      },
      cryptogram: {
        hash: token.cryptogram.hash,
        algorithm: token.cryptogram.algorithm,
        nonce: token.cryptogram.nonce,
        signature: token.cryptogram.signature,
        timestamp: token.cryptogram.timestamp,
      },
      status: token.status,
      createdOfflineAt: token.createdOfflineAt.toISOString(),
      syncedAt: token.syncedAt?.toISOString(),
      paypalOrderId: token.paypalOrderId,
      paypalCaptureId: token.paypalCaptureId,
      syncedByDeviceId: token.props.syncedByDeviceId,
    };
  }

  private deserialize(raw: any): OfflineEscrowToken | null {
    try {
      const sender = DeviceIdentity.create(raw.sender.deviceId, raw.sender.name, raw.sender.accountNumber).getValue();
      const recipient = DeviceIdentity.create(raw.recipient.deviceId, raw.recipient.name, raw.recipient.accountNumber).getValue();
      const amount = Money.create(raw.amount.amount, raw.amount.currency).getValue();
      const cryptogram = Cryptogram.create(raw.cryptogram.hash, raw.cryptogram.nonce, raw.cryptogram.signature).getValue();

      const tokenResult = OfflineEscrowToken.create(sender, recipient, amount, cryptogram, new UniqueEntityId(raw.id));
      if (tokenResult.isFailure) return null;

      const token = tokenResult.getValue();
      token.props.status = raw.status as EscrowStatus;
      if (raw.paypalOrderId && raw.paypalCaptureId) {
        token.props.paypalOrderId = raw.paypalOrderId;
        token.props.paypalCaptureId = raw.paypalCaptureId;
        token.props.syncedByDeviceId = raw.syncedByDeviceId;
      }
      return token;
    } catch {
      return null;
    }
  }
}
