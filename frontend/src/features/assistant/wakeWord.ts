// "Hey T-Pay", or just "T-Pay". Speech engines write the name many ways ("T-Pay", "tpay", "tea pay",
// "tee pay", "T. Pay", "TP"), so all of them count. In the middle of talk the name needs a greeting
// before it ("hey", "okay", "oya"): a market is full of people saying "pay", and the name alone
// would wake the assistant all day. Said on its own, at the start, it counts too.
const GREETING = '(?:hey|hi|hello|ok|okay|oya|abeg|hay|heh|eh|yo)';
const NAME = '(?:(?:t|tee|tea|ti|d|dee)\\s*pay|tpay|teepay|teapay|tipay|tp)';
const WAKE = new RegExp(`\\b${GREETING}\\s+${NAME}\\b`);
const WAKE_AT_START = new RegExp(`^${NAME}\\b`);

export const WAKE_HINTS = ['Hey T-Pay', 'T-Pay', 'Okay T-Pay'];

function normalise(text: string): string {
  return text.toLowerCase().replace(/[-.,!?'’]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * What was said after "Hey T-Pay", or null when it wasn't said. An empty string means the person
 * only called it, so the app should listen for the request. With `alone`, the text is one whole
 * piece the recogniser heard, and "T-Pay" at its very start counts without a greeting.
 */
export function afterWakeWord(text: string, options: { alone?: boolean } = {}): string | null {
  const line = normalise(text);
  const found = WAKE.exec(line) ?? (options.alone ? WAKE_AT_START.exec(line) : null);
  if (!found) return null;
  return line.slice(found.index + found[0].length).trim();
}
