import type { NearbyDriver } from './nearbyDriver';

export type { NearbyDriver, Unsubscribe } from './nearbyDriver';

/** Null in Expo Go, where the Nitro module isn't built into the app. */
export function loadNearbyDriver(): NearbyDriver | null {
  try {
    // Loaded lazily: importing the library creates the native object straight away,
    // which throws when the app was built without it.
    const lib = require('expo-nearby-connections') as typeof import('expo-nearby-connections');
    // Point to point: one merchant and one customer, and the fastest medium Nearby can find.
    // Both phones must use the same strategy or they never see each other.
    const STRATEGY = lib.Strategy.P2P_POINT_TO_POINT;
    return {
      isPlayServicesAvailable: lib.isPlayServicesAvailable,
      startAdvertise: name => lib.startAdvertise(name, STRATEGY),
      stopAdvertise: lib.stopAdvertise,
      startDiscovery: name => lib.startDiscovery(name, STRATEGY),
      stopDiscovery: lib.stopDiscovery,
      requestConnection: lib.requestConnection,
      acceptConnection: lib.acceptConnection,
      rejectConnection: lib.rejectConnection,
      disconnect: lib.disconnect,
      sendText: lib.sendText,
      onPeerFound: lib.onPeerFound,
      onPeerLost: lib.onPeerLost,
      onInvitationReceived: lib.onInvitationReceived,
      onConnected: lib.onConnected,
      onDisconnected: lib.onDisconnected,
      onTextReceived: lib.onTextReceived,
    };
  } catch {
    return null;
  }
}
