import type { AssistantIntent, AssistantScreen, HelpTopic } from '../contracts/api';
import type { Language } from '../contracts/statuses';



// ACT-15 offline (FR-31). Simple rules, not a model, and the screen must say so.
// It only proposes: a person confirms, and the normal payment screens do the rest.

export interface OfflineProposal {
  intent: AssistantIntent;
  // In kobo. Unlike the online assistant, an UNKNOWN proposal keeps an amount it
  // heard, so the screen can offer Collect or Pay with that amount filled in.
  amountNgnMinor: number | null;
  /** Only on a HELP proposal. */
  helpTopic?: HelpTopic;
  /** ADD_STOCK and CHECK_STOCK: the item named, in the person's words. */
  itemName?: string | null;
  /** ADD_STOCK: how many came in. */
  quantity?: number | null;
  /** OPEN_SCREEN: where to go. */
  screen?: AssistantScreen;
}

const MAX_NAIRA = 10_000_000;
const MAX_QUANTITY = 100_000;
const MAX_ITEM_LENGTH = 60;

// Phrases are matched as whole words, in this order, so "pay me" is a collection
// before "pay" is a payment. Yoruba, Igbo and Hausa phrases are added only after a
// native speaker reviews them. Until then digits still work in every language, and
// the screen offers a tap for what to do.
// The vault comes before the wallet, so "add money to my vault" locks and "add money" adds.
const VAULT_WORDS = ['to the vault', 'to my vault', 'into the vault', 'into my vault', 'in the vault', 'in my vault', 'fund the vault', 'fund my vault', 'fund vault', 'top up the vault', 'top up my vault', 'top up vault', 'load the vault', 'load my vault'];
const ACTIONS_EN: [AssistantIntent, string[]][] = [
  ['SHARE_PAY_LINK', ['pay link', 'payment link', 'my link', 'share link', 'send link', 'share my link']],
  ['WITHDRAW', ['withdraw', 'cash out', 'cashout', 'to paypal', 'to my paypal', 'take out my money', 'take my money out']],
  ['UNLOCK_MONEY', ['unlock', 'release my money', 'release the vault', 'close the vault', 'close my vault', 'close vault', 'empty the vault', 'empty my vault']],
  ['LOCK_MONEY', ['lock', ...VAULT_WORDS]],
  ['ADD_MONEY', ['add money', 'fund my wallet', 'fund wallet', 'top up my wallet', 'top up wallet', 'top up', 'deposit', 'load my wallet']],
  ['SET_BUDGET', ['set my budget', 'set budget', 'set a budget', 'change my budget', 'change budget', 'budget to', 'make my budget']],
  ['CHECK_BUDGET', ['budget']],
  ['ADD_STOCK', ['add to stock', 'add to my stock', 'to my stock', 'to stock', 'to the stock', 'restock', 'new stock', 'i bought', 'we bought', 'add stock', 'stock up']],
  ['CHECK_STOCK', ['how many', 'in stock', 'stock left', 'check stock', 'check my stock', 'my stock', 'inventory']],
  ['OPEN_SCREEN', ['open', 'show me', 'show my', 'show', 'go to', 'take me to', 'take me', 'go back', 'go home']],
];
const ACTIONS_PCM: [AssistantIntent, string[]][] = [
  ['SHARE_PAY_LINK', ['pay link', 'payment link', 'my link', 'send link']],
  ['WITHDRAW', ['withdraw', 'comot my money', 'cash out', 'to paypal', 'to my paypal']],
  ['UNLOCK_MONEY', ['unlock', 'open the vault', 'close the vault', 'close vault', 'release my money']],
  ['LOCK_MONEY', ['lock', ...VAULT_WORDS]],
  ['ADD_MONEY', ['add money', 'put money', 'top up', 'deposit', 'fund my wallet']],
  ['SET_BUDGET', ['set my budget', 'set budget', 'change my budget', 'budget to']],
  ['CHECK_BUDGET', ['budget']],
  ['ADD_STOCK', ['add to stock', 'to my stock', 'to stock', 'restock', 'new stock', 'i buy', 'i don buy', 'add stock']],
  ['CHECK_STOCK', ['how many', 'how many remain', 'in stock', 'my stock', 'wetin remain for shelf']],
  ['OPEN_SCREEN', ['open', 'show me', 'show my', 'show', 'carry me go', 'go to']],
];

const PHRASES: Partial<Record<Language, [AssistantIntent, string[]][]>> = {
  en: [
    ...ACTIONS_EN,
    ['CREATE_PAYMENT_REQUEST', ['pay me', 'collect', 'receive', 'charge', 'request']],
    ['RECORD_SALE', ['sold', 'sale', 'i sell']],
    ['CHECK_BALANCE', ['balance', 'how much do i have', 'how much is left', 'check my money']],
    ['PAY_AMOUNT', ['pay', 'send', 'give']],
  ],
  pcm: [
    ...ACTIONS_PCM,
    ['CREATE_PAYMENT_REQUEST', ['pay me', 'make e pay me', 'collect', 'receive', 'abeg collect']],
    ['RECORD_SALE', ['i don sell', 'i sell', 'sold']],
    ['CHECK_BALANCE', ['how much i get', 'how much remain', 'wetin remain', 'check my money', 'balance']],
    ['PAY_AMOUNT', ['make i pay', 'i wan pay', 'pay', 'send', 'give']],
  ],
};

// A question about the app, not a request to act: "how do I pay", "why can't I see send",
// "wetin be offline vault". Asked with no amount, it is answered rather than acted on.
const QUESTION_CUES: Partial<Record<Language, string[]>> = {
  en: ['how', 'why', 'where', 'what', 'help', 'explain', 'can t find', 'cannot find', 'cant find', 'dont see', 'can t see', 'cant see', 'cannot see', 'is my', 'is it safe', 'tell me about'],
  pcm: ['how', 'why', 'where', 'what', 'wetin', 'help', 'explain', 'i no see', 'i no fit see', 'i no fit find', 'can t find', 'cant find', 'cant see', 'dont see', 'is my', 'e safe', 'tell me about'],
};
// Checked in this order, so "send money to PayPal" is withdrawing before "send" is paying.
const HELP_TOPIC_WORDS: [HelpTopic, string[]][] = [
  ['WITHDRAW', ['withdraw', 'paypal', 'cash out', 'bank', 'take my money out']],
  ['SAFETY', ['safe', 'secure', 'steal', 'stolen', 'thief', 'lose', 'lost', 'fraud', 'scam', 'hack', 'copied', 'twice', 'trust']],
  ['GET_PAID', ['get paid', 'pay me', 'collect', 'receive', 'customer', 'sell', 'make dem pay']],
  ['PAY', ['pay', 'send', 'spend', 'buy', 'scan', 'transfer']],
  ['LOCK', ['lock', 'vault', 'offline', 'top up', 'add money', 'fund', 'deposit', 'no network']],
  ['WHAT_CAN_YOU_DO', ['you do', 'you fit do', 'help', 'this app', 't pay', 'tpay', 'work']],
];

// Where "open…" or "show…" goes. Checked in this order.
const SCREEN_WORDS: [AssistantScreen, string[]][] = [
  ['ACTIVITY', ['activity', 'history', 'transactions', 'transaction', 'receipts', 'payments']],
  ['WALLET', ['wallet', 'received', 'money received', 'ledger', 'paypal']],
  ['VAULT', ['vault', 'offline']],
  ['STOCK', ['stock', 'inventory', 'shelf']],
  ['BUDGET', ['budget']],
  ['SETTINGS', ['settings', 'setting', 'profile', 'account']],
  ['HELP', ['help', 'faq', 'questions']],
  ['HOME', ['home', 'main', 'start']],
];
// Questions answered with a number, never a help answer.
const ASKS: AssistantIntent[] = ['CHECK_BALANCE', 'CHECK_STOCK', 'CHECK_BUDGET'];
// Words around an item's name that are not part of it.
const ITEM_FILLER = new Set(['add', 'added', 'more', 'new', 'i', 'we', 'bought', 'buy', 'don', 'restock', 'stock', 'up', 'please', 'abeg', 'the', 'a', 'an', 'my', 'some', 'how', 'many', 'much', 'check', 'units', 'unit', 'pieces', 'piece', 'pcs']);
const ITEM_STOP = new Set(['to', 'into', 'in', 'for', 'at', 'do', 'does', 'are', 'is', 'have', 'has', 'left', 'remain', 'remaining', 'dey', 'on', 'naira']);

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
  const kobo = readDigits(words) ?? readWords(words, language);
  const helpTopic = kobo === null ? readQuestion(words, language) : null;
  if (helpTopic) return { intent: 'HELP', amountNgnMinor: null, helpTopic };
  const intent = negated(words) ? 'UNKNOWN' : matchIntent(words, language);
  switch (intent) {
    case 'CHECK_BALANCE': case 'CHECK_BUDGET': case 'UNLOCK_MONEY': case 'SHARE_PAY_LINK':
      return { intent, amountNgnMinor: null };
    case 'CHECK_STOCK':
      return { intent, amountNgnMinor: null, itemName: readItem(words, false) };
    case 'ADD_STOCK': {
      // The number is how many, not money: "add 10 Coke to stock".
      const count = kobo !== null && kobo % KOBO_PER_NAIRA === 0 ? kobo / KOBO_PER_NAIRA : null;
      return { intent, amountNgnMinor: null, itemName: readItem(words, true), quantity: count !== null && count <= MAX_QUANTITY ? count : null };
    }
    case 'OPEN_SCREEN': {
      const screen = readScreen(words);
      if (screen) return { intent, amountNgnMinor: null, screen };
      // "Show my balance": not a screen, so read it as anything else.
      const other = matchIntent(words, language, 'OPEN_SCREEN');
      return { intent: other, amountNgnMinor: other === 'CHECK_BALANCE' ? null : kobo };
    }
    default:
      return { intent, amountNgnMinor: kobo };
  }
}


function readScreen(words: string[]): AssistantScreen | null {
  const line = ` ${words.join(' ')} `;
  for (const [screen, names] of SCREEN_WORDS) if (names.some((n) => line.includes(` ${n} `))) return screen;
  return null;
}


// "add 10 bags of rice to stock" → "bags of rice"; "how many Coke do I have" → "coke". The name is
// the words after the number (or after "how many"), up to a word like "to" or "left"; failing that,
// the words before the number.
function readItem(words: string[], afterNumber: boolean): string | null {
  const isNumber = (w: string) => /^\d+(\.\d+)?$/.test(w) || w in ONES || w in TENS || w === 'hundred' || w in SCALES;
  const take = (from: string[]) => {
    const picked: string[] = [];
    for (const w of from) {
      if (ITEM_STOP.has(w) && picked.length) break;
      if (ITEM_STOP.has(w) || ITEM_FILLER.has(w) || isNumber(w)) continue;
      picked.push(w);
    }
    return picked.join(' ').trim();
  };
  const at = afterNumber ? words.findIndex(isNumber) : Math.max(words.indexOf('many'), words.indexOf('much'));
  const after = at >= 0 ? take(words.slice(at + 1)) : '';
  const name = after || take(at >= 0 ? words.slice(0, at) : words);
  return name && name.length <= MAX_ITEM_LENGTH ? name : null;
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


// "How much…" is a balance question, and a balance phrase always wins over a help question.
function readQuestion(words: string[], language: Language): HelpTopic | null {
  const line = ` ${words.join(' ')} `;
  const has = (phrase: string) => line.includes(` ${phrase} `);
  if (has('how much') || ASKS.includes(matchIntent(words, language))) return null;
  if (!(QUESTION_CUES[language] ?? []).some(has)) return null;
  for (const [topic, phrases] of HELP_TOPIC_WORDS) if (phrases.some(has)) return topic;
  return 'WHAT_CAN_YOU_DO';
}


function matchIntent(words: string[], language: Language, skip?: AssistantIntent): AssistantIntent {
  const line = ` ${words.join(' ')} `;
  for (const [intent, phrases] of PHRASES[language] ?? []) {
    if (intent === skip) continue;
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
