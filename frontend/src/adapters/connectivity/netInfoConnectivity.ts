import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { IConnectivity } from '@tpay/shared/application/ports/device';

// "Connected" alone includes Wi-Fi with no internet behind it; reachability is the
// real test. Unknown (null) counts as online so a sync is at least tried.
const online = (s: NetInfoState) => s.isConnected === true && s.isInternetReachable !== false;

export class NetInfoConnectivity implements IConnectivity {
  async isOnline(): Promise<boolean> {
    return online(await NetInfo.fetch());
  }

  /** Big downloads ask first when this is false: mobile data costs people money. */
  async onWifi(): Promise<boolean> {
    const s = await NetInfo.fetch();
    return s.type === 'wifi' || s.type === 'ethernet';
  }

  /** Fires each time the phone goes from offline to online (FR-24, FR-44). */
  onReconnect(listener: () => void): () => void {
    let was: boolean | null = null;
    return NetInfo.addEventListener(state => {
      const now = online(state);
      if (now && was === false) listener();
      was = now;
    });
  }

  /** Every change, for the screens that show whether a network is present. */
  watch(listener: (isOnline: boolean) => void): () => void {
    return NetInfo.addEventListener(state => listener(online(state)));
  }
}
