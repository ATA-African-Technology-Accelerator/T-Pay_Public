import { Money } from '../shared/domain/Money';
import { Result } from '../shared/domain/Result';



const FX_RATE_PATTERN = /^\d+\.\d{2}$/;



export function convertNgnToUsd(amount: Money, fxRate: string): Result<Money> {
  if (amount.currency !== 'NGN') {
    return Result.fail<Money>('Only naira can be converted to US dollars');
  }
  if (!FX_RATE_PATTERN.test(fxRate)) {
    return Result.fail<Money>('FX rate must look like 1500.00');
  }
  const rateInMinorUnits = Number(fxRate.replace('.', ''));
  if (rateInMinorUnits === 0) {
    return Result.fail<Money>('FX rate must be above zero');
  }
  const cents = Math.round((amount.minor * 100) / rateInMinorUnits);
  return Money.fromMinor(cents, 'USD');
}