import * as LocalAuthentication from 'expo-local-authentication';
import type { IBiometricUnlock } from '@tpay/shared/application/ports/device';
import { t } from '../../i18n/en';

/** Fingerprint or face unlock. Only counts when the phone has it and the person has set it up. */
export class DeviceBiometrics implements IBiometricUnlock {
  public async isAvailable(): Promise<boolean> {
    try {
      return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
    } catch {
      return false;
    }
  }
  public async authenticate(): Promise<boolean> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t.fingerprintPrompt,
      cancelLabel: t.usePinInstead,
      // The PIN is the fallback, inside the app; don't hand over to the phone's own passcode.
      disableDeviceFallback: true,
    });
    return result.success;
  }
}
