import type { Language } from '@tpay/shared/contracts/statuses';
import { secureValues } from '../adapters/storage/secureValues';

const PROFILE = 'tpay.profile';

/** What the person typed at setup. Kept so the phone can register again on its own. */
export interface LocalProfile {
  displayName: string;
  language: Language;
  payoutEmail: string;
}

export const profileStore = {
  async load(): Promise<LocalProfile | null> {
    const raw = await secureValues.get(PROFILE);
    return raw ? (JSON.parse(raw) as LocalProfile) : null;
  },
  save: (profile: LocalProfile) => secureValues.set(PROFILE, JSON.stringify(profile)),
  clear: () => secureValues.remove(PROFILE),
};
