// ACT-15. The assistant only proposes. It never signs and never sees keys or tokens
// (FR-46): the request carries the words or audio, the language and the amount left.
import type { RecordedSpeech } from '@tpay/shared/application/ports/device';
import type { AssistantIntent } from '@tpay/shared/contracts/api';
import type { Language } from '@tpay/shared/contracts/statuses';
import { parseOfflineIntent } from '@tpay/shared/domain/offlineIntent';
import { ApiRequestError } from '../../adapters/api/httpApi';
import { api, connectivity } from '../../composition';
import { withSession } from '../../session/guard';

export interface Proposal {
  intent: AssistantIntent;
  amountNgnMinor: number | null;
  transcript: string;
  /** The backend's reply, already in the person's language. Null offline: the screen builds it. */
  spokenReply: string | null;
  /** True when simple rules made it, so the screen says no AI ran. */
  offline: boolean;
}

/**
 * Contract section 6: AI_UNAVAILABLE opens the offline path. So does anything else that
 * means the model can't answer now: no network, a server error, or a backend deployed
 * without the assistant route. The offline path is always safe: it only proposes.
 */
const FALLBACK = ['AI_UNAVAILABLE', 'NETWORK', 'ROUTE_NOT_FOUND', 'INTERNAL_SERVER_ERROR', 'RATE_LIMITED'];
const fallsBack = (e: unknown) => e instanceof ApiRequestError && FALLBACK.includes(e.code);

export function offlineProposal(text: string, language: Language): Proposal {
  const { intent, amountNgnMinor } = parseOfflineIntent(text, language);
  return { intent, amountNgnMinor, transcript: text, spokenReply: null, offline: true };
}

export async function interpretText(text: string, language: Language, remainingNgnMinor: number): Promise<Proposal> {
  if (!(await connectivity.isOnline())) return offlineProposal(text, language);
  try {
    const r = await withSession(() => api.interpret({ text, audioBase64: null, audioMimeType: null, language, context: { remainingNgnMinor } }));
    return { ...r.proposal, transcript: r.transcript || text, spokenReply: r.spokenReply, offline: false };
  } catch (e) {
    if (fallsBack(e)) return offlineProposal(text, language);
    throw e;
  }
}

/** Null when the assistant can't be reached, so the screen moves to the offline path. */
export async function interpretSpeech(speech: RecordedSpeech, language: Language, remainingNgnMinor: number): Promise<Proposal | null> {
  try {
    const r = await withSession(() => api.interpret({
      text: null, audioBase64: speech.audioBase64, audioMimeType: speech.audioMimeType, language, context: { remainingNgnMinor },
    }));
    return { ...r.proposal, transcript: r.transcript, spokenReply: r.spokenReply, offline: false };
  } catch (e) {
    if (fallsBack(e)) return null;
    throw e;
  }
}
