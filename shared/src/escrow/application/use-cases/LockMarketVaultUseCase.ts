import type { IMarketVaultRepository } from '../../domain/repositories/IMarketVaultRepository';
import { MarketVault } from '../../domain/MarketVault';
import { Money } from '../../../shared/domain/Money';
import type { Currency } from '../../../shared/domain/Money';
import { Result } from '../../../shared/domain/Result';

export interface LockMarketVaultDTO {
  userId: string;
  amount: number;
  currency?: Currency;
  durationHours: number;
}

export interface LockMarketVaultResponseDTO {
  vaultId: string;
  allocatedAmountFormatted: string;
  remainingAmountFormatted: string;
  durationHours: number;
  lockedAtIso: string;
  expiresAtIso: string;
  cryptographicLockHash: string;
  paypalPreAuthId: string;
  status: string;
}

export class LockMarketVaultUseCase {
  private vaultRepo: IMarketVaultRepository;

  constructor(vaultRepo: IMarketVaultRepository) {
    this.vaultRepo = vaultRepo;
  }

  public async execute(
    dto: LockMarketVaultDTO
  ): Promise<Result<LockMarketVaultResponseDTO>> {
    const moneyOrError = Money.create(dto.amount, dto.currency || 'NGN');
    if (moneyOrError.isFailure) {
      return Result.fail<LockMarketVaultResponseDTO>(moneyOrError.error!);
    }

    const vaultOrError = MarketVault.create(
      dto.userId,
      moneyOrError.getValue(),
      dto.durationHours
    );

    if (vaultOrError.isFailure) {
      return Result.fail<LockMarketVaultResponseDTO>(vaultOrError.error!);
    }

    const vault = vaultOrError.getValue();
    await this.vaultRepo.save(vault);

    return Result.ok<LockMarketVaultResponseDTO>({
      vaultId: vault.id.toValue(),
      allocatedAmountFormatted: vault.allocatedAmount.format(),
      remainingAmountFormatted: vault.remainingAmount.format(),
      durationHours: vault.durationHours,
      lockedAtIso: vault.lockedAt.toISOString(),
      expiresAtIso: vault.expiresAt.toISOString(),
      cryptographicLockHash: vault.cryptographicLockHash,
      paypalPreAuthId: vault.paypalPreAuthId,
      status: vault.status,
    });
  }
}
