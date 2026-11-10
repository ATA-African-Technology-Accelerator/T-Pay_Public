import type { IMarketVaultRepository } from '../../domain/repositories/IMarketVaultRepository';
import { Result } from '../../../shared/domain/Result';

export interface MeltMarketVaultDTO {
  userId: string;
  vaultId?: string;
  refundToAccountId?: string;
}

export interface MeltMarketVaultResponseDTO {
  vaultId: string;
  meltedAmount: number;
  meltedAmountFormatted: string;
  refundedToAccountId: string;
  status: string;
  message: string;
}

export class MeltMarketVaultUseCase {
  private vaultRepo: IMarketVaultRepository;

  constructor(vaultRepo: IMarketVaultRepository) {
    this.vaultRepo = vaultRepo;
  }

  public async execute(
    dto: MeltMarketVaultDTO
  ): Promise<Result<MeltMarketVaultResponseDTO>> {
    const activeVault = await this.vaultRepo.getActiveVault(dto.userId);
    if (!activeVault) {
      return Result.fail<MeltMarketVaultResponseDTO>('No active locked Market Vault found for user');
    }

    const refundTarget = dto.refundToAccountId || 'checking';
    const unspentOrError = activeVault.meltUnspentFunds(refundTarget);
    if (unspentOrError.isFailure) {
      return Result.fail<MeltMarketVaultResponseDTO>(unspentOrError.error!);
    }

    const unspent = unspentOrError.getValue();
    await this.vaultRepo.save(activeVault);

    return Result.ok<MeltMarketVaultResponseDTO>({
      vaultId: activeVault.id.toValue(),
      meltedAmount: unspent.amount,
      meltedAmountFormatted: unspent.format(),
      refundedToAccountId: refundTarget,
      status: activeVault.status,
      message: `Timer expired: ${unspent.format()} unspent funds automatically melted back to your primary PayPal balance.`,
    });
  }
}
