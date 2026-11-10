import { OfflineEscrowToken } from '../../domain/OfflineEscrowToken';
import { DeviceIdentity } from '../../domain/value-objects/DeviceIdentity';

export interface DiscoveredPeer {
  device: DeviceIdentity;
  protocol: 'bluetooth_ble' | 'wifi_direct';
  rssiSignal: number;
}

export interface IProximityTransport {
  discoverPeers(): Promise<DiscoveredPeer[]>;
  transmitToken(recipientDeviceId: string, token: OfflineEscrowToken): Promise<boolean>;
  onTokenReceived(listener: (token: OfflineEscrowToken) => Promise<void>): void;
}
