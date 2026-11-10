import type { AssistantIntent } from '../contracts/api';
import type { Language } from '../contracts/statuses';



// ACT-15 offline (FR-31). Simple rules, not a model, and the screen must say so.
// It only proposes: a person confirms, and the normal payment screens do the rest.

export interface OfflineProposal {
  intent: AssistantIntent;
  // In kobo. Unlike the online assistant, an UNKNOWN proposal keeps an amount it
  // heard, so the screen can offer Collect or Pay with that amount filled in.
  amountNgnMinor: number | null;
}

const MAX_NAIRA = 10_000_000;

// Phrases are matched as whole words, in this order, so "pay me" is a collection
// before "pay" is a payment. Yoruba, Igbo and Hausa phrases are added only after a
// native speaker reviews them. Until then digits still work in every language, and
// the screen offers a tap for what to do.
const PHRASES: Partial<Record<Language, [AssistantIntent, string[]][]>> = {
  en: [
    ['CREATE_PAYMENT_REQUEST', ['pay me', 'collect', 'receive', 'charge', 'request']],
    ['RECORD_SALE', ['sold', 'sale', 'i sell']],
    ['CHECK_BALANCE', ['balance', 'how much do i have', 'how much is left', 'my money', 'check']],
    ['PAY_AMOUNT', ['pay', 'send', 'give']],
  ],
  pcm: [
    ['CREATE_PAYMENT_REQUEST', ['pay me', 'make e pay me', 'collect', 'receive', 'abeg collect']],
    ['RECORD_SALE', ['i don sell', 'i sell', 'sold']],
    ['CHECK_BALANCE', ['how much i get', 'how much remain', 'wetin remain', 'my money', 'balance', 'check']],
    ['PAY_AMOUNT', ['make i pay', 'i wan pay', 'pay', 'send', 'give']],
  ],
};

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1_000, k: 1_000, million: 1_000_000 };


export function parseOfflineIntent(text: string, language: Language): OfflineProposal {
  const words = normalise(text);
  const intent = matchIntent(words, language);
  const naira = readDigits(words) ?? readWords(words, language);
  const amountNgnMinor = intent === 'CHECK_BALANCE' || naira === null ? null : naira * 100;
  return { intent, amountNgnMinor };
}


function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[₦]/g, ' ')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/(\d)(k)\b/g, '$1 $2')
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}


function matchIntent(words: string[], language: Language): AssistantIntent {
  const line = ` ${words.join(' ')} `;
  for (const [intent, phrases] of PHRASES[language] ?? []) {
    if (phrases.some((phrase) => line.includes(` ${phrase} `))) return intent;
  }
  return 'UNKNOWN';
}


// "1500", "1,500", "1.5k", "2 thousand"
function readDigits(words: string[]): number | null {
  const index = words.findIndex((word) => /^\d+(\.\d+)?$/.test(word));
  if (index === -1) return null;
  const scale = SCALES[words[index + 1] ?? ''] ?? 1;
  return clamp(Math.round(Number(words[index]) * scale));
}


// English number words, which Pidgin uses too: "one thousand five hundred".
function readWords(words: string[], language: Language): number | null {
  if (language !== 'en' && language !== 'pcm') return null;
  let total = 0;
  let group = 0;
  let heard = false;
  for (const word of words) {
    if (word in ONES) { group += ONES[word] as number; heard = true; }
    else if (word in TENS) { group += TENS[word] as number; heard = true; }
    else if (word === 'hundred' && heard) { group = (group || 1) * 100; }
    else if (word in SCALES && heard) { total += (group || 1) * (SCALES[word] as number); group = 0; }
    else if (word !== 'and' && heard) break;
  }
  return heard ? clamp(total + group) : null;
}


function clamp(naira: number): number | null {
  return Number.isSafeInteger(naira) && naira > 0 && naira <= MAX_NAIRA ? naira : null;
}
