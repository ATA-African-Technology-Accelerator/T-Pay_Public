import type { AppDependencies } from '../app';
import { createServices } from './createServices';




const JOB_INTERVAL_MS = 30_000;


export function createBackgroundJobs(dependencies: AppDependencies) {
  const { renewVaultHold, settlement, vaultRelease, withdrawToPayPal } = createServices(dependencies);
  const { clock, vaults } = dependencies;

  const guarded = async (name: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      console.error(`Background job failed: ${name}`, error instanceof Error ? error.message : error);
    }
  };

  const runOnce = async () => {
    await guarded('hold renewals', () => renewVaultHold.processDue());
    await guarded('voucher retries', () => settlement.retryDue());
    for (const vault of await vaults.findDueForRelease(clock.now())) {
      await guarded(`release ${vault.id}`, () => vaultRelease.release(vault));
    }
    await guarded('withdrawals', () => withdrawToPayPal.processDue());
  };

  return {
    runOnce,
    start: () => setInterval(() => void guarded('job run', runOnce), JOB_INTERVAL_MS),
  };
}
