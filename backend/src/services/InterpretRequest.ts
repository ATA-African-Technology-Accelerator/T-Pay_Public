import type { InterpretRequest as InterpretBody, InterpretResponse } from '@tpay/shared/contracts/api';
import type { Language } from '@tpay/shared/contracts/statuses';
import { logEvent } from '../logging/logger';
import { modelProposalSchema } from '../validation/schemas';
import type { AssistantInput, Device, IAssistantModel } from './ports';




type Proposal = InterpretResponse['proposal'];
type Outcome = 'ACCEPTED' | 'REJECTED_INVALID' | 'REJECTED_OVER_CAPACITY';
type Refusal = Exclude<Outcome, 'ACCEPTED'>;

const KOBO_PER_NAIRA = 100;
const NO_PROPOSAL: Proposal = { intent: 'UNKNOWN', amountNgnMinor: null, itemName: null };
const HAS_NO_AMOUNT: Proposal['intent'][] = ['CHECK_BALANCE', 'UNKNOWN'];

// Spoken when the model's answer is refused, so the model's own words, which an
// injected instruction could have shaped, never reach the person.
// Needs review by a native speaker of each language before the demo.
const REFUSAL_REPLIES: Record<Refusal, Record<Language, string>> = {
  REJECTED_INVALID: {
    en: "Sorry, I didn't catch that. Please say it again or type it.",
    pcm: 'Abeg, I no hear am well. Talk am again or type am.',
    yo: 'Ẹ jọ̀ọ́, mi ò gbọ́ ọ dáadáa. Ẹ tún sọ ọ́ tàbí kí ẹ tẹ̀ ẹ́.',
    ig: 'Biko, aghọtaghị m nke ọma. Kwuo ya ọzọ ma ọ bụ dee ya.',
    ha: 'Don Allah, ban gane ba. Sake faɗa ko ka rubuta.',
  },
  REJECTED_OVER_CAPACITY: {
    en: 'That is more than your vault has left. Please choose a smaller amount.',
    pcm: 'That money pass wetin remain for your vault. Abeg choose smaller amount.',
    yo: 'Owó yẹn ju èyí tó kù nínú àpò yín lọ. Ẹ jọ̀ọ́ yan iye tó kéré.',
    ig: "Ego ahụ karịrị ihe fọdụrụ n'ime vault gị. Biko họrọ ego dị ntakịrị.",
    ha: 'Kuɗin ya fi abin da ya rage a cikin asusunka. Don Allah zaɓi ƙaramin kuɗi.',
  },
};


// Turns speech or text into a proposal that only pre-fills a screen. It never
// signs, never calls PayPal, and never skips the person's confirmation (FR-46).
export class InterpretRequest {
  constructor(private readonly model: IAssistantModel) {}

  public async execute(device: Device, body: InterpretBody): Promise<InterpretResponse> {
    const input = toInput(body);
    const raw = await this.model.interpret({ input, language: body.language });

    const parsed = modelProposalSchema.safeParse(raw);
    if (!parsed.success) {
      return this.refuse(device, body, input, 'REJECTED_INVALID', input.kind === 'text' ? input.text : '');
    }

    const { amountNaira, intent, itemName, spokenReply, transcript } = parsed.data;
    const proposal: Proposal = HAS_NO_AMOUNT.includes(intent)
      ? { intent, amountNgnMinor: null, itemName: null }
      : { intent, amountNgnMinor: amountNaira === null ? null : amountNaira * KOBO_PER_NAIRA, itemName };

    if (overCapacity(proposal, body.context.remainingNgnMinor)) {
      return this.refuse(device, body, input, 'REJECTED_OVER_CAPACITY', transcript, proposal);
    }

    log(device, body, input, 'ACCEPTED', proposal);
    return { proposal, transcript, spokenReply, needsConfirmation: true };
  }


  private refuse(
    device: Device,
    body: InterpretBody,
    input: AssistantInput,
    outcome: Refusal,
    transcript: string,
    refused: Proposal | null = null,
  ): InterpretResponse {
    log(device, body, input, outcome, refused);
    return {
      proposal: NO_PROPOSAL,
      transcript,
      spokenReply: REFUSAL_REPLIES[outcome][body.language],
      needsConfirmation: true,
    };
  }
}


function toInput({ audioBase64, audioMimeType, text }: InterpretBody): AssistantInput {
  return text !== null
    ? { kind: 'text', text }
    : { kind: 'audio', audioBase64: audioBase64 as string, audioMimeType: audioMimeType as string };
}


// Only paying spends the customer's vault, so only that intent is held to its capacity.
function overCapacity({ amountNgnMinor, intent }: Proposal, remainingNgnMinor: number): boolean {
  return intent === 'PAY_AMOUNT' && amountNgnMinor !== null && amountNgnMinor > remainingNgnMinor;
}


// Every AI-assisted action is logged with its proposal and validation result
// (FR-46). The person's words are personal data, so they are not logged.
function log(device: Device, body: InterpretBody, input: AssistantInput, outcome: Outcome, proposal: Proposal | null) {
  logEvent('assistant.interpret', {
    deviceId: device.id,
    language: body.language,
    input: input.kind,
    outcome,
    intent: proposal?.intent ?? null,
    amountNgnMinor: proposal?.amountNgnMinor ?? null,
  });
}
