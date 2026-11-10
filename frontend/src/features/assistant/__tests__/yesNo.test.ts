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
