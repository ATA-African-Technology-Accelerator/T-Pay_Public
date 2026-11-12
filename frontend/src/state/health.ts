import { useEffect, useState } from 'react';
import type { HealthResponse } from '@tpay/shared/contracts/api';
import { store } from '../composition';

export const HEALTH = 'cache.health';

/** The server's last word on its database and PayPal, refreshed by every sync. Null until the first one. */
export function useHealth(): HealthResponse | null {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => { void store.getMeta<HealthResponse>(HEALTH).then(h => { if (alive) setHealth(h); }).catch(() => undefined); };
    load();
    const off = store.onChange(load);
    return () => { alive = false; off(); };
  }, []);
  return health;
}
