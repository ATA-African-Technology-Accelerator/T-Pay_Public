// The language catalogue (FR-33). Screens read `t`, which always points at the chosen
// language, and fall back to English for any line not yet translated. The app remounts
// when the language changes, so every screen redraws in the new language.
import type { Language } from '@tpay/shared/contracts/statuses';
import { en, type Catalogue } from './en';
import { ha } from './ha';
import { ig } from './ig';
import { pcm } from './pcm';
import { yo } from './yo';

export { languageCodes, languages, type Catalogue } from './en';

const catalogues: Record<Language, Partial<Catalogue>> = { en, pcm, yo, ig, ha };
let current: Language = 'en';

export const t: Catalogue = new Proxy({} as Catalogue, {
  get: (_, key: string) => (catalogues[current] as Record<string, unknown>)[key] ?? (en as Record<string, unknown>)[key],
});

export function setCatalogue(language: Language) {
  current = language;
}

export const catalogueLanguage = () => current;

