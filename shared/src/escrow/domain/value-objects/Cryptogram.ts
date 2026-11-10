import { ValueObject } from '../../../shared/domain/ValueObject';
import { Result } from '../../../shared/domain/Result';

export interface CryptogramProps {
  hash: string;
  algorithm: 'HMAC-SHA256' | 'ED25519-SIG';
  nonce: string;
  signature: string;
  timestamp: string;
}

export class Cryptogram extends ValueObject<CryptogramProps> {
  private constructor(props: CryptogramProps) {
    super(props);
  }

  get hash(): string {
    return this.props.hash;
  }

  get algorithm(): string {
    return this.props.algorithm;
  }

  get nonce(): string {
    return this.props.nonce;
  }

  get signature(): string {
    return this.props.signature;
  }

  get timestamp(): string {
    return this.props.timestamp;
  }

  public static create(hash: string, nonce: string, signature: string, algorithm: 'HMAC-SHA256' | 'ED25519-SIG' = 'HMAC-SHA256'): Result<Cryptogram> {
    if (!hash || hash.trim().length === 0) {
      return Result.fail<Cryptogram>('Cryptogram hash cannot be empty');
    }
    if (!nonce || nonce.trim().length === 0) {
      return Result.fail<Cryptogram>('Cryptogram nonce cannot be empty');
    }
    return Result.ok<Cryptogram>(new Cryptogram({
      hash,
      algorithm,
      nonce,
      signature,
      timestamp: new Date().toISOString()
    }));
  }
}
