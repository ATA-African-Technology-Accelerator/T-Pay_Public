import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Route } from '../../nav';
import { OPEN_ROUTES } from '../../navStack';
import { speechIn, store } from '../../composition';

export const WAKE_WORD = 'ui.wakeWord';
/** Set when the speech pack is downloaded, so listening starts again with it. */
export const WAKE_PACK_AT = 'ui.wakePackAt';

// Screens that use the microphone themselves, or where a payment is being confirmed.
const QUIET: Route['name'][] = ['speak', 'proposal', 'assist', 'review', 'melt', 'withdraw', 'vaultReview', 'addMoney'];
// Moving between screens shouldn't restart the recogniser over and over (some phones beep each time).
const SETTLE_MS = 1_000;

/** Whether "Hey T-Pay" is on. On unless the person turned it off. */
export function useWakeWordSetting(): [boolean, (on: boolean) => Promise<void>] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = () => { void store.getMeta<boolean>(WAKE_WORD).then(v => { if (alive) setOn(v ?? true); }).catch(() => undefined); };
    load();
    const off = store.onChange(load);
    return () => { alive = false; off(); };
  }, []);
  return [on, (value: boolean) => store.setMeta(WAKE_WORD, value)];
}

/**
 * Listens for "Hey T-Pay" while the app is open and in front, on the phone only. It never runs before
 * the app is unlocked, so a locked phone can't be talked into anything.
 */
export function useWakeWord(route: Route['name'], onWake: (rest: string) => void) {
  const [on] = useWakeWordSetting();
  const [packAt, setPackAt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => { void store.getMeta<string>(WAKE_PACK_AT).then(v => { if (alive) setPackAt(v); }).catch(() => undefined); };
    load();
    const off = store.onChange(load);
    return () => { alive = false; off(); };
  }, []);
  // In front unless Android says otherwise. On a cold start of a release build the first reading is
  // often "background" (JavaScript runs before the screen is shown) and the one "active" event can
  // fire before anyone is listening, which left the wake word off for good. So read it again once
  // subscribed, and count anything but background as in front.
  const inFront = (state: string | null | undefined) => state !== 'background';
  const [front, setFront] = useState(inFront(AppState.currentState));
  const latest = useRef(onWake);
  latest.current = onWake;
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setFront(inFront(state)));
    setFront(inFront(AppState.currentState));
    return () => sub.remove();
  }, []);

  const quiet = !on || !front || OPEN_ROUTES.includes(route) || QUIET.includes(route);
  useEffect(() => {
    if (quiet) return;
    let stop: (() => void) | null = null;
    const timer = setTimeout(() => { stop = speechIn.startWakeWord(rest => latest.current(rest)); }, SETTLE_MS);
    return () => { clearTimeout(timer); stop?.(); };
  }, [quiet, packAt]);
}
