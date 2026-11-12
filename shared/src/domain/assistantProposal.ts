import type { AssistantIntent, InterpretResponse } from '../contracts/api';



// ACT-15 on the phone. A language model running offline answers in this shape and
// nothing else, and its answer passes the same checks the backend applies to Gemini
// (FR-32): a fixed intent list, whole naira turned into kobo, no amount for a balance
// check, and no payment above what the vault has left. The model only proposes.

export const ASSISTANT_INTENTS: readonly AssistantIntent[] = [
  'CREATE_PAYMENT_REQUEST', 'PAY_AMOUNT', 'RECORD_SALE', 'CHECK_BALANCE', 'UNKNOWN',
];

const MAX_NAIRA = 10_000_000;
const MAX_ITEM_LENGTH = 80;
const KOBO_PER_NAIRA = 100;
const HAS_NO_AMOUNT: AssistantIntent[] = ['CHECK_BALANCE', 'UNKNOWN'];

export type ModelProposal = InterpretResponse['proposal'];
export type ProposalOutcome = 'ACCEPTED' | 'REJECTED_INVALID' | 'REJECTED_OVER_CAPACITY';

export const NO_PROPOSAL: ModelProposal = { intent: 'UNKNOWN', amountNgnMinor: null, itemName: null };

/** JSON Schema for constrained decoding. It guides the model; checkModelProposal protects. */
export const MODEL_PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [...ASSISTANT_INTENTS] },
    amountNaira: { type: ['integer', 'null'] },
    itemName: { type: ['string', 'null'] },
  },
  required: ['intent', 'amountNaira', 'itemName'],
  additionalProperties: false,
} as const;


export function checkModelProposal(raw: unknown, remainingNgnMinor: number): { proposal: ModelProposal; outcome: ProposalOutcome } {
  const parsed = parse(raw);
  if (!parsed) return { proposal: NO_PROPOSAL, outcome: 'REJECTED_INVALID' };

  const proposal: ModelProposal = HAS_NO_AMOUNT.includes(parsed.intent)
    ? { intent: parsed.intent, amountNgnMinor: null, itemName: null }
    : { intent: parsed.intent, amountNgnMinor: parsed.amountNaira === null ? null : parsed.amountNaira * KOBO_PER_NAIRA, itemName: parsed.itemName };

  // Only paying spends the customer's vault, so only that intent is held to it.
  if (proposal.intent === 'PAY_AMOUNT' && proposal.amountNgnMinor !== null && proposal.amountNgnMinor > remainingNgnMinor) {
    return { proposal: NO_PROPOSAL, outcome: 'REJECTED_OVER_CAPACITY' };
  }
  return { proposal, outcome: 'ACCEPTED' };
}


function parse(raw: unknown): { intent: AssistantIntent; amountNaira: number | null; itemName: string | null } | null {
  const value = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 3 || !['intent', 'amountNaira', 'itemName'].every((k) => keys.includes(k))) return null;

  const { intent, amountNaira, itemName } = record;
  if (!ASSISTANT_INTENTS.includes(intent as AssistantIntent)) return null;
  if (amountNaira !== null && !(Number.isSafeInteger(amountNaira) && (amountNaira as number) > 0 && (amountNaira as number) <= MAX_NAIRA)) return null;
  if (itemName !== null && (typeof itemName !== 'string' || !itemName.trim() || itemName.trim().length > MAX_ITEM_LENGTH)) return null;
  return { intent: intent as AssistantIntent, amountNaira: amountNaira as number | null, itemName: typeof itemName === 'string' ? itemName.trim() : null };
}


function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
