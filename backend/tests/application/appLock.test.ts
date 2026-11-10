import { beforeEach, describe, expect, it } from 'vitest';
import type { IBiometricUnlock, IPinStore, StoredPin } from '@tpay/shared/application/ports/device';
import { AppLock } from '@tpay/shared/application/use-cases/appLock';
import { NodeP256Signer } from '../../src/adapters/crypto/NodeP256Signer';
import { NodeRandom } from '../../src/adapters/system/NodeRandom';

const START = new Date('2026-11-06T10:00:00.000Z');

class MemoryPinStore implements IPinStore {
  public stored: StoredPin | null = null;

  public async load(): Promise<StoredPin | null> {
    return this.stored;
  }

  public async save(pin: StoredPin): Promise<void> {
    this.stored = pin;
  }
}

describe('AppLock', () => {
  let store: MemoryPinStore;
  let now: Date;
  let biometrics: IBiometricUnlock & { accepts: boolean };
  let lock: AppLock;

  const failFiveTimes = async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await lock.unlockWithPin('9999');
    }
  };

  beforeEach(() => {
    store = new MemoryPinStore();
    now = START;
    biometrics = {
      accepts: true,
      isAvailable: async () => true,
      authenticate: async () => biometrics.accepts,
    };
    lock = new AppLock({
      store,
      biometrics,
      signer: new NodeP256Signer(),
      random: new NodeRandom(),
      clock: { now: () => now },
    });
  });

  it('starts with no PIN', async () => {
    expect(await lock.hasPin()).toBe(false);
    expect(await lock.unlockWithPin('1234')).toEqual({ status: 'NO_PIN' });
  });

  it.each(['123', '12345', '12a4', ''])('refuses %j as a PIN', async (pin) => {
    expect((await lock.setPin(pin)).isFailure).toBe(true);
    expect(await lock.hasPin()).toBe(false);
  });

  it('never stores the PIN itself', async () => {
    await lock.setPin('1234');

    expect(JSON.stringify(store.stored)).not.toContain('1234');
  });

  it('unlocks with the right PIN', async () => {
    await lock.setPin('1234');

    expect(await lock.unlockWithPin('1234')).toEqual({ status: 'UNLOCKED' });
  });

  it('counts down wrong attempts', async () => {
    await lock.setPin('1234');

    expect(await lock.unlockWithPin('0000')).toEqual({ status: 'WRONG_PIN', attemptsLeft: 4 });
    expect(await lock.unlockWithPin('0000')).toEqual({ status: 'WRONG_PIN', attemptsLeft: 3 });
  });

  it('locks for 30 seconds after five wrong attempts, even with the right PIN', async () => {
    await lock.setPin('1234');
    await failFiveTimes();

    expect(await lock.unlockWithPin('1234')).toEqual({
      status: 'LOCKED_OUT',
      retryAt: '2026-11-06T10:00:30.000Z',
    });
  });

  it('allows the right PIN once the lockout ends', async () => {
    await lock.setPin('1234');
    await failFiveTimes();
    now = new Date(START.getTime() + 30_000);

    expect(await lock.unlockWithPin('1234')).toEqual({ status: 'UNLOCKED' });
  });

  it('keeps the lockout when the app restarts', async () => {
    await lock.setPin('1234');
    await failFiveTimes();
    const restarted = new AppLock({
      store,
      biometrics,
      signer: new NodeP256Signer(),
      random: new NodeRandom(),
      clock: { now: () => now },
    });

    expect((await restarted.unlockWithPin('1234')).status).toBe('LOCKED_OUT');
  });

  it('clears wrong attempts after a correct PIN', async () => {
    await lock.setPin('1234');
    await lock.unlockWithPin('0000');
    await lock.unlockWithPin('1234');

    expect(await lock.unlockWithPin('0000')).toEqual({ status: 'WRONG_PIN', attemptsLeft: 4 });
  });

  it('unlocks with the fingerprint and clears a lockout', async () => {
    await lock.setPin('1234');
    await failFiveTimes();

    expect(await lock.unlockWithBiometrics()).toEqual({ status: 'UNLOCKED' });
    expect(await lock.unlockWithPin('1234')).toEqual({ status: 'UNLOCKED' });
  });

  it('stays locked when the fingerprint fails', async () => {
    await lock.setPin('1234');
    biometrics.accepts = false;

    expect(await lock.unlockWithBiometrics()).toEqual({ status: 'BIOMETRIC_FAILED' });
  });
});