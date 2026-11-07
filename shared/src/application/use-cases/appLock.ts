import { Result } from '../../shared/domain/Result';
import type { ISigner } from '../ports/crypto';
import type { IBiometricUnlock, IPinStore, StoredPin } from '../ports/device';
import type { IClock, IRandom } from '../ports/system';








const PIN_PATTERN = /^\d{4}$/;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;


export type UnlockResult =
  | { status: 'UNLOCKED' }
  | { status: 'NO_PIN' }
  | { status: 'WRONG_PIN'; attemptsLeft: number }
  | { status: 'LOCKED_OUT'; retryAt: string }
  | { status: 'BIOMETRIC_FAILED' };


export interface AppLockDependencies {
  store: IPinStore;
  biometrics: IBiometricUnlock;
  signer: ISigner;
  random: IRandom;
  clock: IClock;
}

export class AppLock {
  constructor(private readonly dependencies: AppLockDependencies) {}

  public async hasPin(): Promise<boolean> {
    return (await this.dependencies.store.load()) !== null;
  }


  public async setPin(pin: string): Promise<Result<void>> {
    if (!PIN_PATTERN.test(pin)) {
      return Result.fail('The PIN must be 4 digits');
    }
    const salt = this.dependencies.random.nonce();
    await this.dependencies.store.save({
      salt,
      hash: await this.hashPin(pin, salt),
      failedAttempts: 0,
      lockedUntil: null,
    });
    return Result.ok();
  }


  public async unlockWithPin(pin: string): Promise<UnlockResult> {
    const stored = await this.dependencies.store.load();
    if (!stored) return { status: 'NO_PIN' };

    if (this.isLockedOut(stored)) {
      return { status: 'LOCKED_OUT', retryAt: stored.lockedUntil as string };
    }
    if ((await this.hashPin(pin, stored.salt)) === stored.hash) {
      await this.clearFailures(stored);
      return { status: 'UNLOCKED' };
    }
    return this.recordFailure(stored);
  }


  public async unlockWithBiometrics(): Promise<UnlockResult> {
    const { biometrics, store } = this.dependencies;
    const stored = await store.load();
    if (!stored) return { status: 'NO_PIN' };

    const accepted = (await biometrics.isAvailable()) && (await biometrics.authenticate());
    if (!accepted) return { status: 'BIOMETRIC_FAILED' };

    await this.clearFailures(stored);
    return { status: 'UNLOCKED' };
  }


  private hashPin(pin: string, salt: string): Promise<string> {
    return this.dependencies.signer.hash(`${salt}:${pin}`);
  }


  private isLockedOut({ lockedUntil }: StoredPin): boolean {
    return lockedUntil !== null && new Date(lockedUntil) > this.dependencies.clock.now();
  }


  private clearFailures(stored: StoredPin): Promise<void> {
    return this.dependencies.store.save({ ...stored, failedAttempts: 0, lockedUntil: null });
  }

  
  private async recordFailure(stored: StoredPin): Promise<UnlockResult> {
    const { clock, store } = this.dependencies;
    const failedAttempts = stored.failedAttempts + 1;

    if (failedAttempts < MAX_ATTEMPTS) {
      await store.save({ ...stored, failedAttempts, lockedUntil: null });
      return { status: 'WRONG_PIN', attemptsLeft: MAX_ATTEMPTS - failedAttempts };
    }
    const retryAt = new Date(clock.now().getTime() + LOCKOUT_MS).toISOString();
    await store.save({ ...stored, failedAttempts: 0, lockedUntil: retryAt });
    return { status: 'LOCKED_OUT', retryAt };
  }
}