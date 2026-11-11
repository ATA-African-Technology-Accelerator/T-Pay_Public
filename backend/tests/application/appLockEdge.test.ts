// The PIN's hard cases: the boundaries of the lockout, what happens after it ends, odd PINs.
import { beforeEach, describe, expect, it } from 'vitest';
import type { IBiometricUnlock, IPinStore, StoredPin } from '@tpay/shared/application/ports/device';
import { AppLock } from '@tpay/shared/application/use-cases/appLock';
import { NodeP256Signer } from '../../src/adapters/crypto/NodeP256Signer';
import { NodeRandom } from '../../src/adapters/system/NodeRandom';

class MemoryPinStore implements IPinStore {
  public stored: StoredPin | null = null;
  public async load() { return this.stored; }
  public async save(pin: StoredPin) { this.stored = pin; }
}

describe('AppLock edge cases', () => {
  let store: MemoryPinStore;
  let now: Date;
  let lock: AppLock;
  const wrong = () => lock.unlockWithPin('0000');

  beforeEach(async () => {
    store = new MemoryPinStore();
    now = new Date('2026-11-06T10:00:00.000Z');
    const biometrics: IBiometricUnlock = { isAvailable: async () => true, authenticate: async () => true };
    lock = new AppLock({ store, biometrics, signer: new NodeP256Signer(), random: new NodeRandom(), clock: { now: () => now } });
    await lock.setPin('1234');
  });

  it.each(['', '123', '12345', 'abcd', '12 4', '١٢٣٤', '12.4', '1234\n', ' 1234'])('refuses to set the PIN %j', async (pin) => {
    expect((await lock.setPin(pin)).isFailure).toBe(true);
    expect(await lock.unlockWithPin('1234')).toEqual({ status: 'UNLOCKED' });
  });

  it('counts down exactly: 4, 3, 2, 1 left, then locks on the fifth', async () => {
    const left: unknown[] = [];
    for (let i = 0; i < 4; i += 1) left.push((await wrong()).status === 'WRONG_PIN' ? (await store.load())?.failedAttempts : null);
    expect(left).toEqual([1, 2, 3, 4]);
    expect((await wrong()).status).toBe('LOCKED_OUT');
  });

  it('does not accept the right PIN while locked out, and does not extend the lockout by trying', async () => {
    for (let i = 0; i < 5; i += 1) await wrong();
    const lockedUntil = (await store.load())?.lockedUntil;
    now = new Date(now.getTime() + 10_000);

    expect((await lock.unlockWithPin('1234')).status).toBe('LOCKED_OUT');
    expect((await store.load())?.lockedUntil).toBe(lockedUntil);
  });

  it('opens again the moment the lockout ends', async () => {
    for (let i = 0; i < 5; i += 1) await wrong();
    now = new Date(now.getTime() + 30_000);

    expect(await lock.unlockWithPin('1234')).toEqual({ status: 'UNLOCKED' });
  });

  it('gives a fresh set of tries after a lockout, not one strike', async () => {
    for (let i = 0; i < 5; i += 1) await wrong();
    now = new Date(now.getTime() + 31_000);

    expect(await wrong()).toEqual({ status: 'WRONG_PIN', attemptsLeft: 4 });
  });

  it('forgives earlier mistakes after a right PIN', async () => {
    await wrong(); await wrong(); await wrong();
    expect(await lock.unlockWithPin('1234')).toEqual({ status: 'UNLOCKED' });
    expect(await wrong()).toEqual({ status: 'WRONG_PIN', attemptsLeft: 4 });
  });

  it('survives a PIN with leading zeros and one that is all the same digit', async () => {
    await lock.setPin('0001');
    expect(await lock.unlockWithPin('0001')).toEqual({ status: 'UNLOCKED' });
    expect((await lock.unlockWithPin('1')).status).toBe('WRONG_PIN');
    await lock.setPin('1111');
    expect(await lock.unlockWithPin('1111')).toEqual({ status: 'UNLOCKED' });
  });

  it('does not store the PIN itself, and salts it differently each time', async () => {
    const first = { ...(await store.load()) } as StoredPin;
    await lock.setPin('1234');
    const second = (await store.load()) as StoredPin;

    expect(JSON.stringify(first)).not.toContain('1234');
    expect(second.salt).not.toBe(first.salt);
    expect(second.hash).not.toBe(first.hash);
  });

  it('changing the PIN clears an existing lockout', async () => {
    for (let i = 0; i < 5; i += 1) await wrong();
    await lock.setPin('4321');

    expect(await lock.unlockWithPin('4321')).toEqual({ status: 'UNLOCKED' });
  });

  it('a stolen biometric does not reset a lockout to hand out free tries', async () => {
    for (let i = 0; i < 5; i += 1) await wrong();
    // Opening with a fingerprint is allowed (it is the owner), but it must not leave a half-locked state.
    expect((await lock.unlockWithBiometrics()).status).toBe('UNLOCKED');
    expect((await store.load())?.failedAttempts).toBe(0);
  });
});
