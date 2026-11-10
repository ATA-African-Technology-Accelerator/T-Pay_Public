import type { IClock } from '@tpay/shared/application/ports/system';



export class SystemClock implements IClock {
  public now(): Date {
    return new Date();
  }
}