import type { IProximityTransport, DiscoveredPeer } from '../../application/ports/IProximityTransport';
import { OfflineEscrowToken } from '../../domain/OfflineEscrowToken';
import { DeviceIdentity } from '../../domain/value-objects/DeviceIdentity';
import { Cryptogram } from '../../domain/value-objects/Cryptogram';
import { Money } from '../../../shared/domain/Money';
import { UniqueEntityId } from '../../../shared/domain/Identifier';
import type { EscrowStatus } from '../../domain/value-objects/EscrowStatus';

const CHANNEL_NAME = 'tpay_offline_proximity_mesh';

interface ChannelMessage {
  type: 'TPAY_PEER_ANNOUNCE' | 'TPAY_OFFLINE_PAYMENT';
  payload: any;
  senderDeviceId: string;
}

export class BroadcastChannelProximityAdapter implements IProximityTransport {
  private channel: BroadcastChannel | null = null;
  private incomingListeners: ((token: OfflineEscrowToken) => Promise<void>)[] = [];
  private dynamicPeers: Map<string, DiscoveredPeer> = new Map();
  private myDevice: DeviceIdentity | null = null;

  constructor() {
    this.initChannel();
  }

  private initChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = async (event: MessageEvent<ChannelMessage>) => {
          this.handleChannelMessage(event.data);
        };
      } catch (e) {
        console.warn('[BroadcastChannelProximityAdapter] BroadcastChannel unavailable:', e);
      }
    }
  }

  public setLocalDevice(identity: DeviceIdentity): void {
    this.myDevice = identity;
    this.announceDevice();
  }

  public announceDevice(): void {
    if (!this.channel || !this.myDevice) return;
    try {
      const message: ChannelMessage = {
        type: 'TPAY_PEER_ANNOUNCE',
        senderDeviceId: this.myDevice.deviceId,
        payload: {
          deviceId: this.myDevice.deviceId,
          name: this.myDevice.name,
          accountNumber: this.myDevice.accountNumber,
          protocol: 'bluetooth_ble',
          rssiSignal: 5,
        },
      };
      this.channel.postMessage(message);
    } catch (e) {
      console.warn('[BroadcastChannelProximityAdapter] Failed to announce device:', e);
    }
  }

  private async handleChannelMessage(message: ChannelMessage): Promise<void> {
    if (!message || !message.type) return;

    if (message.type === 'TPAY_PEER_ANNOUNCE') {
      const data = message.payload;
      if (this.myDevice && data.deviceId === this.myDevice.deviceId) return; // ignore own beacon
      const idResult = DeviceIdentity.create(data.deviceId, data.name, data.accountNumber);
      if (idResult.isSuccess) {
        this.dynamicPeers.set(data.deviceId, {
          device: idResult.getValue(),
          protocol: data.protocol || 'bluetooth_ble',
          rssiSignal: data.rssiSignal || 4,
        });
      }
    } else if (message.type === 'TPAY_OFFLINE_PAYMENT') {
      const raw = message.payload;
      const token = this.deserializeToken(raw);
      if (token) {
        for (const listener of this.incomingListeners) {
          try {
            await listener(token);
          } catch (err) {
            console.error('[BroadcastChannelProximityAdapter] Error handling received token:', err);
          }
        }
      }
    }
  }

  public async discoverPeers(): Promise<DiscoveredPeer[]> {
    // Request other active tabs to announce
    this.announceDevice();

    const standardPeers: DiscoveredPeer[] = [
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

    const allMap = new Map<string, DiscoveredPeer>();
    for (const p of standardPeers) {
      allMap.set(p.device.deviceId, p);
    }
    for (const [id, peer] of this.dynamicPeers.entries()) {
      allMap.set(id, peer);
    }

    return Array.from(allMap.values());
  }

  public async transmitToken(recipientDeviceId: string, token: OfflineEscrowToken): Promise<boolean> {
    const rawPayload = this.serializeToken(token);

    // Broadcast across windows/tabs over zero-data simulated BLE mesh
    if (this.channel) {
      try {
        const message: ChannelMessage = {
          type: 'TPAY_OFFLINE_PAYMENT',
          senderDeviceId: token.sender.deviceId,
          payload: rawPayload,
        };
        this.channel.postMessage(message);
      } catch (e) {
        console.warn('[BroadcastChannelProximityAdapter] Broadcast failed:', e);
      }
    }

    // Trigger local listeners in current window
    for (const listener of this.incomingListeners) {
      await listener(token);
    }

    return true;
  }

  public onTokenReceived(listener: (token: OfflineEscrowToken) => Promise<void>): void {
    this.incomingListeners.push(listener);
  }

  private serializeToken(token: OfflineEscrowToken): any {
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

  private deserializeToken(raw: any): OfflineEscrowToken | null {
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

