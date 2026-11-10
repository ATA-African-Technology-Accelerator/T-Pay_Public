import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import { HONOR_PERIOD_MS } from './AuthorizeVault';
import type { IPaymentGateway, IVaultRepository, IVoucherRepository, Vault, VaultSession } from './ports';
import { settledUsd } from './vaultView';




const RETRY_SOON_MS = 60 * 60 * 1000;
const RETRY_TOMORROW_MS = 24 * 60 * 60 * 1000;
const RENEWABLE: Vault['status'][] = ['ACTIVE', 'SPEND_CLOSED'];


export interface RenewVaultHoldDependencies {
  vaults: IVaultRepository;
  vouchers: IVoucherRepository;
  gateway: IPaymentGateway;
  clock: IClock;
  random: IRandom;
}


// A vault waits for its customer to come back to T-Pay, which can take days.
// PayPal guarantees an authorisation for only three days, so each time the
// honor period ends the hold is reauthorised for whatever has not been captured.
export class RenewVaultHold {
  constructor(private readonly dependencies: RenewVaultHoldDependencies) {}

  public async processDue(): Promise<void> {
    const { clock, vaults } = this.dependencies;
    for (const vault of await vaults.findDueForReauthorization(clock.now())) {
      try {
        await this.renew(vault.id);
      } catch (error) {
        console.error(`Could not renew the hold on ${vault.id}`, error instanceof Error ? error.message : error);
      }
    }
  }


  // The vault row stays locked during the PayPal call. A capture claims its lease
  // under the same lock and reads the authorisation ID afterwards, so no capture
  // can use an ID that is being replaced.
  public renew(vaultId: string): Promise<void> {
    return this.dependencies.vouchers.withVaultLock(vaultId, async (session) => {
      const now = this.dependencies.clock.now();
      if (!isDue(session.vault, now) || captureInFlight(session, now)) {
        return;
      }
      const uncaptured = session.vault.authorisedUsdMinor - settledUsd(session.vouchers);
      if (uncaptured <= 0) {
        await session.updateVault({ honorEndsAt: null });
        return;
      }
      await this.reauthorize(session, uncaptured, now);
    });
  }


  private async reauthorize(session: VaultSession, amountUsdMinor: number, now: Date): Promise<void> {
    const authorizationId = session.vault.paypalAuthorizationId as string;
    const result = await this.dependencies.gateway.reauthorize({
      authorizationId,
      // Stable until the ID changes, so a retry after a timeout cannot reauthorise twice.
      requestId: `${authorizationId}-reauthorize`,
      amountUsdMinor,
    });

    switch (result.outcome) {
      case 'REAUTHORIZED':
        await session.updateVault({
          paypalAuthorizationId: result.authorizationId,
          honorEndsAt: new Date(now.getTime() + HONOR_PERIOD_MS),
        });
        return;
      case 'RETRY':
        await session.updateVault({ honorEndsAt: new Date(now.getTime() + RETRY_SOON_MS) });
        return;
      case 'REFUSED':
        await session.addAlert({
          id: `alr_${this.dependencies.random.uuid()}`,
          type: 'REAUTHORIZATION_FAILED',
          vaultId: session.vault.id,
          voucherId: null,
          details: { reason: result.reason, authorizationId, amountUsdMinor },
          createdAt: now,
        });
        await session.updateVault({ honorEndsAt: new Date(now.getTime() + RETRY_TOMORROW_MS) });
    }
  }
}


function isDue(vault: Vault, now: Date): boolean {
  return RENEWABLE.includes(vault.status)
    && vault.paypalAuthorizationId !== null
    && vault.honorEndsAt !== null
    && vault.honorEndsAt <= now
    && vault.settleBy !== null
    && vault.settleBy > now;
}


function captureInFlight({ vouchers }: VaultSession, now: Date): boolean {
  return vouchers.some(({ leaseUntil }) => leaseUntil !== null && leaseUntil > now);
}
