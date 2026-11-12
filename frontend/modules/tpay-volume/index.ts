import { requireOptionalNativeModule } from 'expo';

interface TpayVolumeNative {
  setEnabled(enabled: boolean): void;
  addListener(event: 'onDoubleVolumeUp', listener: () => void): { remove(): void };
}

/** Null in Expo Go, on web and on iOS, where this module isn't built. */
const native = requireOptionalNativeModule<TpayVolumeNative>('TpayVolume');

/**
 * Calls `onPress` when Volume Up is pressed twice quickly. Returns a function that turns it off.
 * Does nothing where the phone can't support it.
 */
export function onDoubleVolumeUp(onPress: () => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onDoubleVolumeUp', onPress);
  native.setEnabled(true);
  return () => { native.setEnabled(false); sub.remove(); };
}
