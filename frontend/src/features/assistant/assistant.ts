// ACT-15. The assistant only proposes. It never signs and never sees keys or tokens
// (FR-46). Online it asks the backend's model. Offline it asks the model on the phone,
// if the person downloaded it, and otherwise the simple rules. Every answer passes the
// same checks before a person sees it, and a person always confirms.
import type { RecordedSpeech } from '@tpay/shared/application/ports/device';
import type { AssistantIntent } from '@tpay/shared/contracts/api';
import type { Language } from '@tpay/shared/contracts/statuses';
import { checkModelProposal, type ProposalOutcome } from '@tpay/shared/domain/assistantProposal';
import { parseOfflineIntent } from '@tpay/shared/domain/offlineIntent';
import { ApiRequestError } from '../../adapters/api/httpApi';
import { api, clock, connectivity, localModel, store } from '../../composition';
import { withSession } from '../../session/guard';

export interface Proposal {
  intent: AssistantIntent;
  amountNgnMinor: number | null;
  transcript: string;
  /** The backend's reply, already in the person's language. Null offline: the screen builds it. */
  spokenReply: string | null;
  /** True when the phone answered without the network. */
  offline: boolean;
  /** True when the model on the phone answered, false when the simple rules did. */
  onDevice: boolean;
  /** The model asked to pay more than the vault has left, so it was refused. */
  overCapacity: boolean;
}

/**
 * Contract section 6: AI_UNAVAILABLE opens the offline path. So does anything else that
 * means the model can't answer now: no network, a server error, or a backend deployed
 * without the assistant route. The offline path is always safe: it only proposes.
 */
const FALLBACK = ['AI_UNAVAILABLE', 'NETWORK', 'ROUTE_NOT_FOUND', 'INTERNAL_SERVER_ERROR', 'RATE_LIMITED'];
const fallsBack = (e: unknown) => e instanceof ApiRequestError && FALLBACK.includes(e.code);

const LOG = 'assistant.log';
const LOG_SIZE = 50;

/** FR-46: each AI-assisted answer is kept with its outcome. What the person said is not. */
async function record(source: 'phone' | 'rules', outcome: ProposalOutcome, intent: AssistantIntent, amountNgnMinor: number | null) {
  const log = (await store.getMeta<unknown[]>(LOG)) ?? [];
  await store.setMeta(LOG, [{ at: clock.now().toISOString(), source, outcome, intent, amountNgnMinor }, ...log].slice(0, LOG_SIZE));
}

/** The simple rules: always available, in every build. */
export function rulesProposal(text: string, language: Language): Proposal {
  const { intent, amountNgnMinor } = parseOfflineIntent(text, language);
  return { intent, amountNgnMinor, transcript: text, spokenReply: null, offline: true, onDevice: false, overCapacity: false };
}

/**
 * Offline: the rules and the phone's model together. The rules are fixed, reviewed code,
 * so whatever they recognise wins; the model only fills what they couldn't read, such as
 * a Yoruba number word. Tested on the real model, a 0.5B model sometimes reverses "pay me"
 * into a payment, and this is what stops that reaching the screen.
 */
export async function offlineAnswer(text: string, language: Language, remainingNgnMinor: number): Promise<Proposal> {
  const rules = rulesProposal(text, language);
  if ((await localModel.refresh()).kind !== 'ready') return rules;
  let model: ReturnType<typeof checkModelProposal>;
  try {
    model = checkModelProposal(await localModel.propose(text, language), Number.MAX_SAFE_INTEGER);
  } catch {
    // A slow or failed model never blocks the person: the rules answer instead.
    return rules;
  }
  if (model.outcome !== 'ACCEPTED') {
    await record('phone', model.outcome, model.proposal.intent, null).catch(() => undefined);
    return rules;
  }

  const intent = rules.intent !== 'UNKNOWN' ? rules.intent : model.proposal.intent;
  const amount = intent === 'CHECK_BALANCE' || intent === 'UNKNOWN' ? null : rules.amountNgnMinor ?? model.proposal.amountNgnMinor;
  const usedModel = intent !== rules.intent || amount !== rules.amountNgnMinor;
  // The same capacity rule the backend applies to Gemini, on the merged answer.
  if (intent === 'PAY_AMOUNT' && amount !== null && amount > remainingNgnMinor) {
    await record('phone', 'REJECTED_OVER_CAPACITY', intent, amount).catch(() => undefined);
    return { ...rules, intent: 'UNKNOWN', amountNgnMinor: null, onDevice: usedModel, overCapacity: true };
  }
  await record(usedModel ? 'phone' : 'rules', 'ACCEPTED', intent, amount).catch(() => undefined);
  return { ...rules, intent, amountNgnMinor: amount, onDevice: usedModel };
}

export async function interpretText(text: string, language: Language, remainingNgnMinor: number): Promise<Proposal> {
  if (!(await connectivity.isOnline())) return offlineAnswer(text, language, remainingNgnMinor);
  try {
    const r = await withSession(() => api.interpret({ text, audioBase64: null, audioMimeType: null, language, context: { remainingNgnMinor } }));
    return { ...r.proposal, transcript: r.transcript || text, spokenReply: r.spokenReply, offline: false, onDevice: false, overCapacity: false };
  } catch (e) {
    if (fallsBack(e)) return offlineAnswer(text, language, remainingNgnMinor);
    throw e;
  }
}

/** Null when the assistant can't be reached, so the screen moves to the offline path. */
export async function interpretSpeech(speech: RecordedSpeech, language: Language, remainingNgnMinor: number): Promise<Proposal | null> {
  try {
    const r = await withSession(() => api.interpret({
      text: null, audioBase64: speech.audioBase64, audioMimeType: speech.audioMimeType, language, context: { remainingNgnMinor },
    }));
    return { ...r.proposal, transcript: r.transcript, spokenReply: r.spokenReply, offline: false, onDevice: false, overCapacity: false };
  } catch (e) {
    if (fallsBack(e)) return null;
    throw e;
  }
}
