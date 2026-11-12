// What a phone needs before Nearby can run: runtime permissions, Bluetooth on, and on
// Android 11 and older, location services on.
import { PermissionsAndroid, Platform, type Permission } from 'react-native';
import { TpayRadio, type BluetoothState } from '../../../modules/tpay-radio';

export interface Radio {
  /** Android API level, or 0 off Android. */
  sdk: number;
  hasPermissions(): Promise<boolean>;
  /** True when every permission was granted. */
  requestPermissions(): Promise<boolean>;
  bluetoothState(): Promise<BluetoothState>;
  requestBluetoothOn(): Promise<boolean>;
  locationServicesOn(): Promise<boolean>;
}

const P = {
  advertise: 'android.permission.BLUETOOTH_ADVERTISE',
  connect: 'android.permission.BLUETOOTH_CONNECT',
  scan: 'android.permission.BLUETOOTH_SCAN',
  wifi: 'android.permission.NEARBY_WIFI_DEVICES',
  location: 'android.permission.ACCESS_FINE_LOCATION',
} as const;

/** The Nearby Connections permission set for each Android version. */
export function permissionsFor(sdk: number): Permission[] {
  if (sdk >= 33) return [P.advertise, P.connect, P.scan, P.wifi] as Permission[];
  if (sdk >= 31) return [P.advertise, P.connect, P.scan, P.location] as Permission[];
  return [P.location] as Permission[];
}

/** Null off Android or in Expo Go, where the native module isn't built. */
export function loadRadio(): Radio | null {
  if (Platform.OS !== 'android' || !TpayRadio) return null;
  const native = TpayRadio;
  const sdk = Number(Platform.Version);
  const needed = permissionsFor(sdk);
  return {
    sdk,
    hasPermissions: async () => (await Promise.all(needed.map(p => PermissionsAndroid.check(p)))).every(Boolean),
    requestPermissions: async () => {
      const result = await PermissionsAndroid.requestMultiple(needed);
      return needed.every(p => result[p] === PermissionsAndroid.RESULTS.GRANTED);
    },
    bluetoothState: () => native.bluetoothState(),
    requestBluetoothOn: () => native.requestBluetoothOn(),
    locationServicesOn: () => native.locationServicesOn(),
  };
}
