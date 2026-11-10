import { requireOptionalNativeModule } from 'expo';

export type BluetoothState = 'on' | 'off' | 'unsupported';

interface TpayRadioNative {
  bluetoothState(): Promise<BluetoothState>;
  /** Shows the system request to turn Bluetooth on. True when it is on afterwards. */
  requestBluetoothOn(): Promise<boolean>;
  locationServicesOn(): Promise<boolean>;
}

/** Null in Expo Go, on web and on iOS, where this module isn't built. */
export const TpayRadio = requireOptionalNativeModule<TpayRadioNative>('TpayRadio');
