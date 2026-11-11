import { useEffect } from 'react';
import { AppState } from 'react-native';
import { radio } from '../../composition';
import { useApp } from '../../state/appState';

// How often to look, and how long to wait before asking again after the seller said no.
const CHECK_MS = 8_000;
const ASK_AGAIN_MS = 45_000;

/**
 * A business takes payments by Bluetooth, so while the app is open and unlocked Bluetooth stays on:
 * if it is off, the phone's own "Turn on Bluetooth?" question is shown. Someone who says no is asked
 * again a little later or when they come back to the app, never in a loop. Personal accounts are left alone.
 */
export function KeepBluetoothOn({ unlocked }: { unlocked: boolean }) {
  const { accountKind } = useApp();
  const enabled = unlocked && accountKind === 'business';
  useEffect(() => {
    if (!enabled || !radio) return;
    const r = radio;
    let stopped = false;
    let busy = false;
    let lastAsked = 0;
    const check = async () => {
      if (stopped || busy || AppState.currentState !== 'active') return;
      busy = true;
      try {
        if (!(await r.hasPermissions()) && !(await r.requestPermissions())) return;
        if ((await r.bluetoothState()) !== 'off') return;
        if (Date.now() - lastAsked < ASK_AGAIN_MS) return;
        lastAsked = Date.now();
        await r.requestBluetoothOn();
      } catch {
        // A phone that cannot answer is left as it is; payments by QR still work.
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = setInterval(() => { void check(); }, CHECK_MS);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') { lastAsked = 0; void check(); } });
    return () => { stopped = true; clearInterval(timer); sub.remove(); };
  }, [enabled]);
  return null;
}
