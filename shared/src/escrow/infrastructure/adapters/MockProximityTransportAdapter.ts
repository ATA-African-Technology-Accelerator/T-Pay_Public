import type { IProximityTransport, DiscoveredPeer } from '../../application/ports/IProximityTransport';
import { OfflineEscrowToken } from '../../domain/OfflineEscrowToken';
import { DeviceIdentity } from '../../domain/value-objects/DeviceIdentity';

export class MockProximityTransportAdapter implements IProximityTransport {
  private incomingListeners: ((token: OfflineEscrowToken) => Promise<void>)[] = [];

  public async discoverPeers(): Promise<DiscoveredPeer[]> {
    return [
      {
        device: DeviceIdentity.create('TPAY-SHOP-NKECHI-02', 'Mama Nkechi Provisions', '2084739102').getValue(),
        protocol: 'bluetooth_ble',
        rssiSignal: 5,
      },
      {
        device: DeviceIdentity.create('TPAY-TERM-MORUFU-07', 'Morufu Transport (Korope)', '0039281744').getValue(),
        protocol: 'bluetooth_ble',
        rssiSignal: 4,
      },
      {
        device: DeviceIdentity.create('BLE-NODE-142', 'Chidi Eze (Passenger)', '9182374619').getValue(),
        protocol: 'wifi_direct',
        rssiSignal: 4,
      },
      {
        device: DeviceIdentity.create('BLE-NODE-089', 'Amara Okafor (Passenger)', '7182930491').getValue(),
        protocol: 'bluetooth_ble',
        rssiSignal: 5,
      },
    ];
  }

  public async transmitToken(recipientDeviceId: string, token: OfflineEscrowToken): Promise<boolean> {
    // Simulate instantaneous zero-data BLE packet broadcast
    for (const listener of this.incomingListeners) {
      await listener(token);
    }
    return true;
  }

  public onTokenReceived(listener: (token: OfflineEscrowToken) => Promise<void>): void {
    this.incomingListeners.push(listener);
  }
}
