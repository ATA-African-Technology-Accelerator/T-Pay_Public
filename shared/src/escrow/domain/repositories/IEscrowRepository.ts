import { OfflineEscrowToken } from '../OfflineEscrowToken';

export interface IEscrowRepository {
  save(token: OfflineEscrowToken): Promise<void>;
  findById(id: string): Promise<OfflineEscrowToken | null>;
  findAll(): Promise<OfflineEscrowToken[]>;
  findUnsynced(): Promise<OfflineEscrowToken[]>;
  findByDeviceId(deviceId: string): Promise<OfflineEscrowToken[]>;
}
