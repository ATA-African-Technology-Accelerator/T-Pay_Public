import { ValueObject } from '../../../shared/domain/ValueObject';
import { Result } from '../../../shared/domain/Result';

export interface DeviceIdentityProps {
  deviceId: string;
  name: string;
  accountNumber: string;
  publicKey?: string;
}

export class DeviceIdentity extends ValueObject<DeviceIdentityProps> {
  private constructor(props: DeviceIdentityProps) {
    super(props);
  }

  get deviceId(): string {
    return this.props.deviceId;
  }

  get name(): string {
    return this.props.name;
  }

  get accountNumber(): string {
    return this.props.accountNumber;
  }

  get publicKey(): string | undefined {
    return this.props.publicKey;
  }

  public static create(deviceId: string, name: string, accountNumber: string, publicKey?: string): Result<DeviceIdentity> {
    if (!deviceId || deviceId.trim().length === 0) {
      return Result.fail<DeviceIdentity>('Device ID is required');
    }
    if (!name || name.trim().length === 0) {
      return Result.fail<DeviceIdentity>('Device owner name is required');
    }
    return Result.ok<DeviceIdentity>(new DeviceIdentity({ deviceId, name, accountNumber, publicKey }));
  }
}
