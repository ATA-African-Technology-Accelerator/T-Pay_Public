import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REFUSAL } from '@tpay/shared/contracts/refusals';
import { capacity, usd } from '../support/offlineFixture';




describe('VaultCapacity', () => {
  it('calculates the remaining amount', () => {
    expect(capacity(667, 100, 200).remaining.minor).toBe(367);
  });

  it('reserves an amount within capacity', () => {
    const updated = capacity(667).reserve(usd(133)).getValue();

    expect(updated.reserved.minor).toBe(133);
    expect(updated.remaining.minor).toBe(534);
  });

  it('refuses an amount above capacity', () => {
    expect(capacity(100).reserve(usd(101)).error).toBe(REFUSAL.INSUFFICIENT_VAULT_CAPACITY);
  });

  it('moves a reserved amount to settled', () => {
    const updated = capacity(667, 133).settle(usd(133)).getValue();

    expect(updated.reserved.minor).toBe(0);
    expect(updated.settled.minor).toBe(133);
  });

  it('refuses to settle more than is reserved', () => {
    expect(capacity(667, 10).settle(usd(11)).isFailure).toBe(true);
  });

  it('never exceeds the authorised amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(fc.integer({ min: 0, max: 200_000 })),
        (authorised, amounts) => {
          let current = capacity(authorised);

          for (const amount of amounts) {
            const reserved = current.reserve(usd(amount));
            if (reserved.isSuccess) {
              current = reserved.getValue();
            }
          }

          expect(current.reserved.minor + current.settled.minor).toBeLessThanOrEqual(authorised);
        },
      ),
    );
  });
});