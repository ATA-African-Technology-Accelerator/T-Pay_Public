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
    ['CHECK_BALANCE', ['balance', 'how much do i have', 'how much is left', 'check my money']],
    ['PAY_AMOUNT', ['pay', 'send', 'give']],
  ],
  pcm: [
    ['CREATE_PAYMENT_REQUEST', ['pay me', 'make e pay me', 'collect', 'receive', 'abeg collect']],
    ['RECORD_SALE', ['i don sell', 'i sell', 'sold']],
    ['CHECK_BALANCE', ['how much i get', 'how much remain', 'wetin remain', 'check my money', 'balance']],
    ['PAY_AMOUNT', ['make i pay', 'i wan pay', 'pay', 'send', 'give']],
  ],
};

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1_000, k: 1_000, million: 1_000_000 };
// Words bigger than any amount the app allows. Hearing one means "too much", never "one".
const TOO_BIG = new Set(['billion', 'trillion', 'bn']);
// A person saying not to pay is not asking to pay.
const NEGATIONS = new Set(['not', 'dont', 'never', 'cancel', 'stop']);
const KOBO_PER_NAIRA = 100;


export function parseOfflineIntent(text: string, language: Language): OfflineProposal {
  const words = normalise(text);
  const intent = negated(words) ? 'UNKNOWN' : matchIntent(words, language);
  const kobo = readDigits(words) ?? readWords(words, language);
  const amountNgnMinor = intent === 'CHECK_BALANCE' ? null : kobo;
  return { intent, amountNgnMinor };
}


function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[₦]/g, ' ')
    // "NGN 500", "N500" and "500naira" are how people type naira.
    .replace(/\bngn\b/g, ' ')
    .replace(/\bn(?=\d)/g, ' ')
    .replace(/(\d)naira\b/g, '$1 naira')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/(\d)(k)\b/g, '$1 $2')
    .replace(/don't|don’t/g, 'dont')
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}


function negated(words: string[]): boolean {
  return words.some((word) => NEGATIONS.has(word)) || words.join(' ').includes('do not');
}


function matchIntent(words: string[], language: Language): AssistantIntent {
  const line = ` ${words.join(' ')} `;
  for (const [intent, phrases] of PHRASES[language] ?? []) {
    if (phrases.some((phrase) => line.includes(` ${phrase} `))) return intent;
  }
  return 'UNKNOWN';
}


// "1500", "1,500", "1 500", "1.5k", "100.50", "2 thousand", in kobo. With several numbers, the
// largest is the money: "sold 3 loaves for 1500" is 1500, not 3. A number that starts with 0, and
// the groups straight after it, is a phone or account number, never an amount.
function readDigits(words: string[]): number | null {
  let best: number | null = null;
  let inPhoneNumber = false;
  for (let index = 0; index < words.length; index += 1) {
    let word = words[index] as string;
    if (!/^\d+(\.\d+)?$/.test(word)) { inPhoneNumber = false; continue; }
    if (inPhoneNumber || /^0\d/.test(word)) { inPhoneNumber = true; continue; }
    // "1 000" and "1 500 000": a short number followed by groups of exactly three digits.
    while (/^\d{1,3}$/.test(word) && /^\d{3}$/.test(words[index + 1] ?? '')) {
      word += words[index + 1];
      index += 1;
    }
    const scale = SCALES[words[index + 1] ?? ''] ?? 1;
    if (TOO_BIG.has(words[index + 1] ?? '')) continue;
    const kobo = clamp(Math.round(Number(word) * scale * KOBO_PER_NAIRA));
    if (kobo !== null && (best === null || kobo > best)) best = kobo;
  }
  return best;
}


// English number words, which Pidgin uses too: "one thousand five hundred", "a thousand".
function readWords(words: string[], language: Language): number | null {
  if (language !== 'en' && language !== 'pcm') return null;
  let total = 0;
  let group = 0;
  let heard = false;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] as string;
    const next = words[index + 1] ?? '';
    if (word === 'a' && (next === 'hundred' || next in SCALES)) { group += 1; heard = true; }
    else if (word in ONES) { group += ONES[word] as number; heard = true; }
    else if (word in TENS) { group += TENS[word] as number; heard = true; }
    else if (word === 'hundred' && heard) { group = (group || 1) * 100; }
    else if (word in SCALES && heard) {
      const scale = SCALES[word] as number;
      // "one million million": a scale straight after a scale multiplies the whole amount.
      if (group === 0 && total > 0) total *= scale;
      else { total += (group || 1) * scale; group = 0; }
    }
    else if (TOO_BIG.has(word) && heard) return null;
    else if (word !== 'and' && heard) break;
  }
  return heard ? clamp((total + group) * KOBO_PER_NAIRA) : null;
}


function clamp(kobo: number): number | null {
  return Number.isSafeInteger(kobo) && kobo >= KOBO_PER_NAIRA && kobo <= MAX_NAIRA * KOBO_PER_NAIRA ? kobo : null;
}
