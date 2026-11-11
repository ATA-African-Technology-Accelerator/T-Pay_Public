import { readYesNo } from '../yesNo';

describe('readYesNo', () => {
  it.each(['Yes', 'yeah sure', 'Okay!', 'E dey', 'Bẹ́ẹ̀ni', 'ee'])('hears %j as yes', said => {
    expect(readYesNo(said)).toBe('yes');
  });

  it.each(['No', 'nope', 'cancel it', 'Rara', 'mba', 'no be am'])('hears %j as no', said => {
    expect(readYesNo(said)).toBe('no');
  });

  it.each(['', 'maybe', 'yes no', 'one thousand naira', 'nothing'])('is unsure about %j', said => {
    expect(readYesNo(said)).toBeNull();
  });
});

describe('readYesNo hard cases', () => {
  it.each([
    ['yes please', 'yes'], ['YES!!!', 'yes'], ['okay then', 'yes'], ['yeah yeah', 'yes'], ['ehen', 'yes'],
    ['no thanks', 'no'], ['no no no', 'no'], ['NO', 'no'], ['cancel', 'no'], ['stop', 'no'],
  ])('%j is %s', (said, expected) => {
    expect(readYesNo(said)).toBe(expected);
  });

  it.each(['not yes', 'yes or no', 'I said no, yes', 'no wahala'])('is careful with %j', (said) => {
    // A negation, or both words, is not a clear yes. It may be read as no or as nothing, never as yes.
    expect(readYesNo(said)).not.toBe('yes');
  });

  it('does not hear a yes inside another word', () => {
    expect(readYesNo('yesterday')).toBeNull();
    expect(readYesNo('know')).toBeNull();
    expect(readYesNo('another')).toBeNull();
  });

  it('copes with a very long transcript', () => {
    expect(readYesNo(`${'blah '.repeat(20_000)} yes`)).toBe('yes');
  });
});
