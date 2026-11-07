import type { ISigner } from '@tpay/shared/application/ports/crypto';
import type { MeltVaultRequest, MeltVaultResponse } from '@tpay/shared/contracts/api';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import { verifyMessage } from '@tpay/shared/domain/signedMessages';
import { ApiError } from './ApiError';
import type { Device, IVaultRepository, IVoucherRepository, Vault } from './ports';
import { findBlockingVouchers, type VaultRelease } from './VaultRelease';




export interface MeltVaultDependencies {
  vaults: IVaultRepository;
  vouchers: IVoucherRepository;
  signer: ISigner;
}


export class MeltVault {
  constructor(
    private readonly dependencies: MeltVaultDependencies,
    private readonly vaultRelease: VaultRelease,
  ) {}

  public async execute(device: Device, vaultId: string, request: MeltVaultRequest): Promise<MeltVaultResponse> {
    const vault = await this.findVault(device, vaultId);
    await this.assertStatement(device, vaultId, request);
    if (vault.status !== 'CLOSED') {
      await this.stopSpending(vaultId, request);
      await this.vaultRelease.releaseIfClear(vaultId);
    }
    return this.present(await this.findVault(device, vaultId));
  }


  private async findVault(device: Device, vaultId: string): Promise<Vault> {
    const vault = await this.dependencies.vaults.findById(vaultId);
    if (vault?.deviceId !== device.id || !vault.paypalAuthorizationId) {
      throw new ApiError('VAULT_NOT_FOUND', 'This vault does not exist');
    }
    return vault;
  }


  private async assertStatement(device: Device, vaultId: string, { spendStatement }: MeltVaultRequest): Promise<void> {
    const valid = await verifyMessage(
      MESSAGE_PREFIX.SPEND_STATEMENT,
      spendStatement,
      device.publicKey,
      this.dependencies.signer,
    );
    if (!valid || spendStatement.payload.vaultId !== vaultId) {
      throw new ApiError('INVALID_SIGNATURE', 'The spend statement is not valid');
    }
  }


  private stopSpending(vaultId: string, { spendStatement }: MeltVaultRequest): Promise<void> {
    const { lastSequence, totalIssuedUsdMinor } = spendStatement.payload;
    return this.dependencies.vouchers.withVaultLock(vaultId, async ({ updateVault, vault }) => {
      if (vault.declaredLastSequence !== null) {
        return;
      }
      await updateVault({
        status: vault.status === 'ACTIVE' ? 'SPEND_CLOSED' : vault.status,
        declaredLastSequence: lastSequence,
        declaredTotalUsdMinor: totalIssuedUsdMinor,
      });
    });
  }


  private async present(vault: Vault): Promise<MeltVaultResponse> {
    const closed = vault.status === 'CLOSED';
    const vouchers = await this.dependencies.vouchers.listForVault(vault.id);
    return {
      vaultId: vault.id,
      status: vault.status,
      releasedAt: vault.releasedAt?.toISOString() ?? null,
      releaseScheduledFor: closed ? null : (vault.settleBy as Date).toISOString(),
      blockingVoucherIds: closed ? [] : findBlockingVouchers(vouchers).map(({ id }) => id),
    };
  }
}
