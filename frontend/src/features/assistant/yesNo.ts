// Reads a spoken answer as yes or no. It only decides when one of the two is clearly there, so a
// muddled or mixed answer means "no answer" and the person taps instead. A yes here never pays
// anything: it only confirms what the assistant said it heard, and payments still need the hold.
const YES = ['yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'correct', 'right', 'confirm', 'ehen', 'ee', 'eeh', 'beeni', 'bee ni', 'o da', 'o dara', 'e dey', 'ya', 'eh heh'];
const NO = ['no', 'nope', 'cancel', 'stop', 'wrong', 'rara', 'mba', 'aa', 'ba haka ba', 'no be am'];

const clean = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (said: string, word: string) => ` ${said} `.includes(` ${word} `);

export function readYesNo(transcript: string): 'yes' | 'no' | null {
  const said = clean(transcript);
  if (!said) return null;
  // A negation next to a yes ("not yes", "don't") is never read as a yes.
  const negated = ['not', 'dont', "don't", 'never'].some(w => has(said, w));
  const yes = !negated && YES.some(w => has(said, w));
  const no = NO.some(w => has(said, w));
  if (yes === no) return null;
  return yes ? 'yes' : 'no';
}
