import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import type { TransactionType, WithdrawRequest, WithdrawResponse } from '@tpay/shared/contracts/api';
import { ApiError } from './ApiError';
import { backoffMs } from './backoff';
import type {
  Device, IPaymentGateway, ITransactionRepository, IWalletRepository, LedgerRecord, PayoutResult,
  WalletSession, Withdrawal,
} from './ports';
import { balanceNgn, balanceUsd } from './walletBalance';




const CENTS_PER_DOLLAR = 100;
// A new withdrawal is sent to PayPal straight away by the request that made it. The background job
// leaves it alone for this long, so the two never send the same payout at the same moment.
const SUBMIT_GRACE_MS = 2 * 60 * 1000;
// PayPal's answers that mean "this payout is already being handled", never "it failed".
const DUPLICATE = /DUPLICATE|ALREADY|SENDER_BATCH_ID|IDEMPOTEN|CONFLICT/i;
// Automatic cash-out: nothing under a dollar is sent, and after one fails (an email with no PayPal
// account, say) the account is left alone for a day instead of failing every half minute.
const MIN_CASH_OUT_USD_MINOR = 100;
const CASH_OUT_PAUSE_MS = 24 * 60 * 60 * 1000;


export interface WithdrawToPayPalDependencies {
  wallet: IWalletRepository;
  transactions: ITransactionRepository;
  gateway: IPaymentGateway;
  clock: IClock;
  random: IRandom;
  fxRate: string;
}


export class WithdrawToPayPal {
  constructor(private readonly dependencies: WithdrawToPayPalDependencies) {}

  public async execute(device: Device, { amountUsdMinor, recipientEmail }: WithdrawRequest): Promise<WithdrawResponse> {
    const { wallet } = this.dependencies;
    const reserved = await wallet.withWalletLock(device.id, (session) =>
      this.reserve(session, device, amountUsdMinor, recipientEmail ?? device.payoutEmail));
    const withdrawal = await this.submit(reserved);
    return { withdrawalId: withdrawal.id, status: withdrawal.status, paypalBatchId: withdrawal.paypalBatchId };
  }


  /**
   * Sends money received offline on to the person's own PayPal, all of it in one payout. It never
   * sends money they added themselves, never more than the balance, and never the same money twice:
   * what is due is what was received offline less what was already sent this way.
   */
  public async cashOutReceived(device: Device): Promise<Withdrawal | null> {
    if (device.autoCashOut === false || device.revokedAt) return null;
    const reserved = await this.dependencies.wallet.withWalletLock<Withdrawal | null>(device.id, async (session) => {
      const due = Math.min(this.dueForCashOut(session.ledger), balanceUsd(session.ledger));
      if (due < MIN_CASH_OUT_USD_MINOR || this.recentlyFailed(session.ledger)) return null;
      return this.reserve(session, device, due, device.payoutEmail, true);
    });
    return reserved ? this.submit(reserved) : null;
  }


  private dueForCashOut(ledger: LedgerRecord[]): number {
    const sum = (match: (entry: LedgerRecord) => boolean) => ledger.filter(match).reduce((total, entry) => total + entry.amountUsdMinor, 0);
    const received = sum((e) => e.type === 'CREDIT') - sum((e) => e.type === 'REVERSAL');
    const sent = sum((e) => e.type === 'WITHDRAWAL' && e.autoCashOut === true) - sum((e) => e.type === 'WITHDRAWAL_RETURNED' && e.autoCashOut === true);
    return received - sent;
  }


  private recentlyFailed(ledger: LedgerRecord[]): boolean {
    const now = this.dependencies.clock.now().getTime();
    return ledger.some((e) => e.type === 'WITHDRAWAL_RETURNED' && e.autoCashOut === true && now - e.createdAt.getTime() < CASH_OUT_PAUSE_MS);
  }


  public async processDue(): Promise<void> {
    const { clock, wallet } = this.dependencies;
    for (const withdrawal of await wallet.findDueWithdrawals(clock.now())) {
      try {
        await (withdrawal.paypalBatchId ? this.checkPayout(withdrawal) : this.submit(withdrawal));
      } catch (error) {
        console.error(`Could not process ${withdrawal.id}`, error instanceof Error ? error.message : error);
      }
    }
  }


  private async reserve(session: WalletSession, device: Device, amountUsdMinor: number, receiverEmail: string, autoCashOut = false): Promise<Withdrawal> {
    const { clock, random } = this.dependencies;
    const available = balanceUsd(session.ledger);
    if (amountUsdMinor > available) {
      throw new ApiError('INSUFFICIENT_BALANCE', 'This is more than the available balance');
    }

    const now = clock.now();
    const withdrawal: Withdrawal = {
      id: `wdr_${random.uuid()}`,
      deviceId: device.id,
      receiverEmail,
      amountUsdMinor,
      amountNgnMinor: this.toNgnMinor(amountUsdMinor, available, balanceNgn(session.ledger)),
      status: 'PENDING',
      paypalBatchId: null,
      attempts: 0,
      nextAttemptAt: new Date(now.getTime() + SUBMIT_GRACE_MS),
      createdAt: now,
      updatedAt: now,
      autoCashOut,
    };
    await session.insertWithdrawal(withdrawal);
    await session.addLedgerEntry(this.ledgerEntry(withdrawal, 'WITHDRAWAL'));
    await this.recordEvent(session, withdrawal, 'WITHDRAWAL_REQUESTED');
    return withdrawal;
  }


  private toNgnMinor(amountUsdMinor: number, availableUsd: number, availableNgn: number): number {
    if (amountUsdMinor === availableUsd) {
      return availableNgn;
    }
    const rate = Number(this.dependencies.fxRate.replace('.', ''));
    return Math.min(Math.round((amountUsdMinor * rate) / CENTS_PER_DOLLAR), availableNgn);
  }


  private async submit(withdrawal: Withdrawal): Promise<Withdrawal> {
    const result = await this.dependencies.gateway.createPayout({
      senderBatchId: withdrawal.id,
      receiverEmail: withdrawal.receiverEmail,
      amountUsdMinor: withdrawal.amountUsdMinor,
    });
    return this.dependencies.wallet.withWalletLock(withdrawal.deviceId, (session) =>
      this.applyPayoutResult(session, withdrawal, result));
  }


  private applyPayoutResult(session: WalletSession, withdrawal: Withdrawal, result: PayoutResult): Promise<Withdrawal> {
    // Money only goes back to the wallet when PayPal clearly refused this payout. A refusal that
    // says the payout already exists means it is on its way: returning the money then would let
    // the same money be withdrawn twice.
    if (result.outcome === 'REJECTED' && !DUPLICATE.test(result.reason)) {
      console.error(`PayPal refused ${withdrawal.id}: ${result.reason}`);
      return this.fail(session, withdrawal);
    }
    if (result.outcome === 'REJECTED') {
      console.error(`PayPal says ${withdrawal.id} already exists (${result.reason}); checking again, not refunding`);
    }
    return this.scheduleCheck(
      session,
      withdrawal,
      result.outcome === 'ACCEPTED' ? { paypalBatchId: result.batchId } : {},
    );
  }


  private async checkPayout(withdrawal: Withdrawal): Promise<void> {
    const { gateway, wallet } = this.dependencies;
    const status = await gateway.getPayoutStatus(withdrawal.paypalBatchId as string);
    await wallet.withWalletLock(withdrawal.deviceId, (session) => {
      if (status === 'COMPLETED') {
        return this.complete(session, withdrawal);
      }
      return status === 'FAILED' ? this.fail(session, withdrawal) : this.scheduleCheck(session, withdrawal, {});
    });
  }


  private scheduleCheck(
    session: WalletSession,
    withdrawal: Withdrawal,
    changes: Pick<Partial<Withdrawal>, 'paypalBatchId'>,
  ): Promise<Withdrawal> {
    const now = this.dependencies.clock.now();
    const attempts = withdrawal.attempts + 1;
    return session.updateWithdrawal(withdrawal.id, {
      ...changes,
      attempts,
      nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
      updatedAt: now,
    });
  }


  private async complete(session: WalletSession, withdrawal: Withdrawal): Promise<Withdrawal> {
    const completed = await session.updateWithdrawal(withdrawal.id, {
      status: 'COMPLETED',
      nextAttemptAt: null,
      updatedAt: this.dependencies.clock.now(),
    });
    await this.recordEvent(session, completed, 'WITHDRAWAL_COMPLETED');
    return completed;
  }


  private async fail(session: WalletSession, withdrawal: Withdrawal): Promise<Withdrawal> {
    const failed = await session.updateWithdrawal(withdrawal.id, {
      status: 'FAILED',
      nextAttemptAt: null,
      updatedAt: this.dependencies.clock.now(),
    });
    await session.addLedgerEntry(this.ledgerEntry(failed, 'WITHDRAWAL_RETURNED'));
    await this.recordEvent(session, failed, 'WITHDRAWAL_FAILED');
    return failed;
  }


  private ledgerEntry(withdrawal: Withdrawal, type: LedgerRecord['type']): LedgerRecord {
    const { clock, random } = this.dependencies;
    return {
      id: `led_${random.uuid()}`,
      deviceId: withdrawal.deviceId,
      type,
      amountUsdMinor: withdrawal.amountUsdMinor,
      amountNgnMinor: withdrawal.amountNgnMinor,
      voucherId: null,
      withdrawalId: withdrawal.id,
      depositId: null,
      paypalCaptureId: null,
      createdAt: clock.now(),
      ...(withdrawal.autoCashOut ? { autoCashOut: true } : {}),
    };
  }


  private recordEvent(session: WalletSession, withdrawal: Withdrawal, type: TransactionType): Promise<void> {
    const suffix = type.replace('WITHDRAWAL_', '').toLowerCase();
    return session.addEvent({
      id: `txn_${withdrawal.id}_${suffix}`,
      deviceId: withdrawal.deviceId,
      type,
      amountNgnMinor: withdrawal.amountNgnMinor,
      amountUsdMinor: withdrawal.amountUsdMinor,
      vaultId: null,
      voucherId: null,
      paypalReferenceId: withdrawal.paypalBatchId,
      occurredAt: this.dependencies.clock.now(),
    });
  }
}
