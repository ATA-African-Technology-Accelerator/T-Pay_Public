// The slice of Nearby Connections the transport uses, so tests can swap in a fake.
// This file is the web and Expo Go build: there is no Nearby there, so the transport
// reports UNSUPPORTED and every payment uses QR. nearbyDriver.android.ts is the real one.

export type Unsubscribe = () => void;
type Listener<T> = (event: T) => void;

export interface NearbyDriver {
  isPlayServicesAvailable(): Promise<boolean>;
  startAdvertise(name: string): Promise<unknown>;
  stopAdvertise(): Promise<void>;
  startDiscovery(name: string): Promise<unknown>;
  stopDiscovery(): Promise<void>;
  requestConnection(peerId: string): Promise<void>;
  acceptConnection(peerId: string): Promise<void>;
  rejectConnection(peerId: string): Promise<void>;
  disconnect(peerId: string): Promise<void>;
  sendText(peerId: string, text: string): Promise<void>;
  onPeerFound(listener: Listener<{ peerId: string; name: string }>): Unsubscribe;
  onPeerLost(listener: Listener<{ peerId: string }>): Unsubscribe;
  onInvitationReceived(listener: Listener<{ peerId: string; name: string }>): Unsubscribe;
  onConnected(listener: Listener<{ peerId: string }>): Unsubscribe;
  onDisconnected(listener: Listener<{ peerId: string }>): Unsubscribe;
  onTextReceived(listener: Listener<{ peerId: string; text: string }>): Unsubscribe;
}

export function loadNearbyDriver(): NearbyDriver | null {
  return null;
}
