/// <reference types="jest" />
import { afterWakeWord } from '../wakeWord';

describe('Hey T-Pay', () => {
  it.each([
    ['Hey T-Pay', ''],
    ['hey tpay', ''],
    ['Hey tea pay', ''],
    ['Hey tee pay.', ''],
    ['okay T. Pay', ''],
    ['hey TP', ''],
    ['Oya T-Pay collect two thousand', 'collect two thousand'],
    ['so I said hey T-Pay, how do I pay?', 'how do i pay'],
  ])('hears "%s"', (said, rest) => {
    expect(afterWakeWord(said)).toBe(rest);
  });

  it.each(['pay me two thousand', 'T-Pay', 'they pay well', 'hey', 'hey taxi pay me', 'can I get a tea pay you later'])('ignores "%s" in the middle of talk', said => {
    expect(afterWakeWord(said)).toBeNull();
  });

  it.each([
    ['T-Pay', ''],
    ['tpay collect 2000', 'collect 2000'],
    ['Tea pay, how much do I have', 'how much do i have'],
  ])('hears "%s" said on its own', (said, rest) => {
    expect(afterWakeWord(said, { alone: true })).toBe(rest);
  });

  it.each(['they pay well', 'I will pay T-Pay later', 'pay me'])('still ignores "%s" said on its own', said => {
    expect(afterWakeWord(said, { alone: true })).toBeNull();
  });
});
