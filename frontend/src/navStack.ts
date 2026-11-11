import type { Route } from './nav';

// Screens that come before unlocking, so returning to them never re-locks, and where there is
// nothing behind to go back to.
export const OPEN_ROUTES: Route['name'][] = ['splash', 'language', 'details', 'createPin', 'lock'];

/**
 * The back stack after a reset. Home is always underneath a screen inside the app, so Back from
 * Received, Activity or Stock goes Home like any other app, instead of doing nothing or closing it.
 * Only Home itself and the screens before unlocking stand alone.
 */
export function stackAfterReset(route: Route): Route[] {
  return route.name === 'home' || OPEN_ROUTES.includes(route.name) ? [route] : [{ name: 'home' }, route];
}
