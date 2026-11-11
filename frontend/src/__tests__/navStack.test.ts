/// <reference types="jest" />
import { stackAfterReset } from '../navStack';

describe('stackAfterReset', () => {
  it.each(['ledger', 'activity', 'vault', 'settings', 'speak', 'stock', 'budget', 'help', 'addMoney'] as const)('keeps Home under %s, so Back goes Home', (name) => {
    expect(stackAfterReset({ name } as never).map(r => r.name)).toEqual(['home', name]);
  });

  it.each(['home', 'lock', 'createPin', 'splash', 'language', 'details'] as const)('%s stands alone', (name) => {
    expect(stackAfterReset({ name } as never).map(r => r.name)).toEqual([name]);
  });
});
