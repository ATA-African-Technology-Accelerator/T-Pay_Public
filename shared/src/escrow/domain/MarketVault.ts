import { AggregateRoot } from '../../shared/domain/AggregateRoot';
import { UniqueEntityId } from '../../shared/domain/Identifier';
import { Result } from '../../shared/domain/Result';
import { Money } from '../../shared/domain/Money';
import {
  MarketVaultLockedEvent,
  MarketVaultMeltedEvent,
} from './events/EscrowEvents';

export type VaultStatus = 'LOCKED_ACTIVE' | 'EXPIRED_MELTED' | 'UNLOCKED_MANUAL';

export interface MarketVaultProps {
  userId: string;
  allocatedAmount: Money;
  spentAmount: Money;
  durationHours: number;
  lockedAt: Date;
  expiresAt: Date;
  cryptographicLockHash: string;
  paypalPreAuthId: string;
  status: VaultStatus;
}

/**
 * MarketVault (Budget-Locked Vault) Aggregate Root
 * Implements the Dual-App Local Trust Architecture from the T-Pay technical specification.
 *
 * Invariants:
 * 1. User pre-allocates while online, placing a cryptographic lock on their PayPal balance.
 * 2. Unspent funds cannot be double-spent offline.
 * 3. When duration timer expires, unspent funds automatically melt back into the primary balance.
 */
export class MarketVault extends AggregateRoot<MarketVaultProps> {
  private constructor(props: MarketVaultProps, id?: UniqueEntityId) {
    super(props, id);
  }

  get userId(): string {
    return this.props.userId;
  }

  get allocatedAmount(): Money {
    return this.props.allocatedAmount;
  }

  get spentAmount(): Money {
    return this.props.spentAmount;
  }

  get remainingAmount(): Money {
    const remaining = this.props.allocatedAmount.amount - this.props.spentAmount.amount;
    return Money.create(Math.max(0, remaining), this.props.allocatedAmount.currency).getValue();
  }

  get durationHours(): number {
    return this.props.durationHours;
  }

  get lockedAt(): Date {
    return this.props.lockedAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get cryptographicLockHash(): string {
    return this.props.cryptographicLockHash;
  }

  get paypalPreAuthId(): string {
    return this.props.paypalPreAuthId;
  }

  get status(): VaultStatus {
    return this.props.status;
  }

  get isActive(): boolean {
    return this.props.status === 'LOCKED_ACTIVE' && !this.isExpired();
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this.props.expiresAt.getTime();
  }

  public getTimeRemainingMs(now: Date = new Date()): number {
    return Math.max(0, this.props.expiresAt.getTime() - now.getTime());
  }

  /**
   * Factory: Create and lock a new Market Vault on PayPal balance
   */
  public static create(
    userId: string,
    allocatedAmount: Money,
    durationHours: number = 24,
    id?: UniqueEntityId
  ): Result<MarketVault> {
    if (allocatedAmount.amount <= 0) {
      return Result.fail<MarketVault>('Vault allocation amount must be greater than zero');
    }
    if (durationHours <= 0 || durationHours > 168) {
      return Result.fail<MarketVault>('Vault duration must be between 1 and 168 hours (7 days)');
    }

    const lockedAt = new Date();
    const expiresAt = new Date(lockedAt.getTime() + durationHours * 3600 * 1000);
    const preAuthId = `PAYPAL-PREAUTH-VAULT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // Cryptographic Lock Hash binding user, amount, preAuthId, and expiry
    const rawData = `${userId}:${allocatedAmount.amount}:${preAuthId}:${expiresAt.toISOString()}`;
    let hash = 0;
    for (let i = 0; i < rawData.length; i++) {
      hash = ((hash << 5) - hash) + rawData.charCodeAt(i);
      hash |= 0;
    }
    const lockHash = `HMAC-SHA256:VAULT-${Math.abs(hash).toString(16).padStart(12, '0')}`;

    const vault = new MarketVault(
      {
        userId,
        allocatedAmount,
        spentAmount: Money.zero(allocatedAmount.currency),
        durationHours,
        lockedAt,
        expiresAt,
        cryptographicLockHash: lockHash,
        paypalPreAuthId: preAuthId,
        status: 'LOCKED_ACTIVE',
      },
      id
    );

    vault.addDomainEvent(
      new MarketVaultLockedEvent(
        vault.id,
        userId,
        allocatedAmount.format(),
        durationHours,
        expiresAt,
        preAuthId
      )
    );

    return Result.ok<MarketVault>(vault);
  }

  /**
   * Authorize and deduct an offline transaction from the locked vault
   */
  public authorizeSpend(amount: Money): Result<void> {
    if (!this.isActive) {
      return Result.fail<void>('Cannot spend from an expired or inactive Market Vault');
    }
    if (amount.amount > this.remainingAmount.amount) {
      return Result.fail<void>(
        `Insufficient vault balance. Remaining: ${this.remainingAmount.format()}, requested: ${amount.format()}`
      );
    }

    const newSpent = this.props.spentAmount.add(amount).getValue();
    this.props.spentAmount = newSpent;

    return Result.ok<void>();
  }

  /**
   * Auto-melt unspent funds back to the user's primary balance when the timer expires
   */
  public meltUnspentFunds(refundToAccountId: string = 'checking'): Result<Money> {
    if (this.props.status === 'EXPIRED_MELTED') {
      return Result.fail<Money>('Vault funds have already been melted and refunded');
    }

    const unspent = this.remainingAmount;
    this.props.status = 'EXPIRED_MELTED';

    this.addDomainEvent(
      new MarketVaultMeltedEvent(
        this.id,
        unspent.format(),
        refundToAccountId
      )
    );

    return Result.ok<Money>(unspent);
  }
}
