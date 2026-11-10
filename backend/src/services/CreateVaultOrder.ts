import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import type { CreateVaultRequest, CreateVaultResponse } from '@tpay/shared/contracts/api';
import { convertNgnToUsd } from '@tpay/shared/domain/convertNgnToUsd';
import { Money } from '@tpay/shared/shared/domain/Money';
import { ApiError } from './ApiError';
import type { Device, IPaymentGateway, IVaultRepository } from './ports';

export interface CreateVaultOrderDependencies {
  vaults: IVaultRepository;
  gateway: IPaymentGateway;
  random: IRandom;
  clock: IClock;
  fxRate: string;
  publicBaseUrl: string;
}

export class CreateVaultOrder {
  constructor(private readonly dependencies: CreateVaultOrderDependencies) {}

  public async execute(device: Device, request: CreateVaultRequest): Promise<CreateVaultResponse> {
    const { clock, fxRate, gateway, random, vaults } = this.dependencies;
    const amountUsdMinor = this.toUsdMinor(request.amountNgnMinor);

    const open = await vaults.findOpenForDevice(device.id);
    if (open && open.status !== 'PENDING_APPROVAL') {
      throw new ApiError('ACTIVE_VAULT_EXISTS', 'This device already has an open vault');
    }

    const vaultId = `vlt_${random.uuid()}`;
    const order = await gateway.createOrder({
      requestId: `${vaultId}-order`,
      vaultId,
      amountUsdMinor,
      returnUrl: this.returnUrl(vaultId, 'approved'),
      cancelUrl: this.returnUrl(vaultId, 'cancelled'),
    });

    if (open) {
      await vaults.abandon(open.id);
    }
    const created = await vaults.create({
      id: vaultId,
      deviceId: device.id,
      status: 'PENDING_APPROVAL',
      amountNgnMinor: request.amountNgnMinor,
      authorisedUsdMinor: amountUsdMinor,
      fxRate,
      durationHours: request.durationHours,
      paypalOrderId: order.orderId,
      paypalAuthorizationId: null,
      spendBy: null,
      settleBy: null,
      honorEndsAt: null,
      declaredLastSequence: null,
      declaredTotalUsdMinor: null,
      releasedAt: null,
      createdAt: clock.now(),
    });
    if (!created) {
      throw new ApiError('ACTIVE_VAULT_EXISTS', 'This device already has an open vault');
    }

    return {
      vaultId,
      status: 'PENDING_APPROVAL',
      amountNgnMinor: request.amountNgnMinor,
      amountUsdMinor,
      fxRate,
      approvalUrl: order.approvalUrl,
    };
  }

  private toUsdMinor(amountNgnMinor: number): number {
    const converted = convertNgnToUsd(Money.fromMinor(amountNgnMinor, 'NGN').getValue(), this.dependencies.fxRate);
    const cents = converted.isSuccess ? converted.getValue().minor : 0;
    if (cents === 0) {
      throw new ApiError('VALIDATION_FAILED', 'The amount is too small to lock');
    }
    return cents;
  }

  private returnUrl(vaultId: string, outcome: 'approved' | 'cancelled'): string {
    const query = new URLSearchParams({ vaultId, outcome });
    return `${this.dependencies.publicBaseUrl}/api/paypal/return?${query}`;
  }
}
