import type { Catalogue } from './en';

// Nigerian Pidgin. Lines join here only after a native speaker has reviewed them (FR-33, NFR-07);
// until then each line falls back to English. Never machine-translate payment wording:
// a wrong word about money can make someone pay or refuse by mistake.
export const pcm: Partial<Catalogue> = {};
