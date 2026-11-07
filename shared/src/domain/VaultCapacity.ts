import { REFUSAL } from '../contracts/refusals';
import { Money } from '../shared/domain/Money';
import { Result } from '../shared/domain/Result';
import { ValueObject } from '../shared/domain/ValueObject';




interface VaultCapacityProps {
  authorised: Money;
  reserved: Money;
  settled: Money;
}

export class VaultCapacity extends ValueObject<VaultCapacityProps> {
  private constructor(props: VaultCapacityProps) {
    super(props);
  }
  

  public static create(authorised: Money, reserved: Money, settled: Money): Result<VaultCapacity> {
    const used = reserved.add(settled);
    if (used.isFailure || used.getValue().isGreaterThan(authorised)) {
      return Result.fail(REFUSAL.INSUFFICIENT_VAULT_CAPACITY);
    }
    return Result.ok(new VaultCapacity({ authorised, reserved, settled }));
  }


  get authorised(): Money {
    return this.props.authorised;
  }


  get reserved(): Money {
    return this.props.reserved;
  }


  get settled(): Money {
    return this.props.settled;
  }


  get remaining(): Money {
    return this.authorised.subtract(this.reserved).getValue().subtract(this.settled).getValue();
  }


  public reserve(amount: Money): Result<VaultCapacity> {
    const reserved = this.reserved.add(amount);
    if (reserved.isFailure) {
      return Result.fail(reserved.error as string);
    }
    return VaultCapacity.create(this.authorised, reserved.getValue(), this.settled);
  }


  public settle(amount: Money): Result<VaultCapacity> {
    const reserved = this.reserved.subtract(amount);
    const settled = this.settled.add(amount);
    if (reserved.isFailure || settled.isFailure) {
      return Result.fail('Cannot settle more than is reserved');
    }
    return VaultCapacity.create(this.authorised, reserved.getValue(), settled.getValue());
  }
}