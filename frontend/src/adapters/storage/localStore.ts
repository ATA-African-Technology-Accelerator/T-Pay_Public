// The three local repositories the shared core asks for (frontend workflow section 6),
// plus the few writes that must land together. SQLite owns domain state (FR-35): screens
// read it through the app state, which reloads whenever something here changes.
import type {
  ILocalVaultRepository, ILocalVoucherRepository, ISeenVoucherRepository, LocalVault, LocalVoucher,
} from '@tpay/shared/application/ports/storage';
import type { MeltVaultResponse, SignedVaultCertificate, VaultView } from '@tpay/shared/contracts/api';
import type { PaymentRequestPayload } from '@tpay/shared/contracts/messages';
import type { VoucherStatus } from '@tpay/shared/contracts/statuses';
import type { Kv, Write } from './kvCore';

/** The current vault as this phone knows it. */
export interface AppVault extends LocalVault {
  vaultId: string;
  /** The latest backend view. Its settleBy and PayPal authorisation ID change while the hold is renewed. */
  view: VaultView | null;
  lockedAt: string;
  /** Set once the spend statement has been sent; no voucher may be signed after it. */
  melt: MeltVaultResponse | null;
}

/** One voucher, from the payer's or the payee's side. */
export interface AppVoucher extends LocalVoucher {
  id: string;
  vaultCertificate: SignedVaultCertificate;
  /** The payment request it answers. The payer needs it to check the receipt. */
  request: PaymentRequestPayload | null;
  /** Exactly what this phone shows or sends again: the voucher frame for a payer, the receipt frame for a payee. */
  frame: string;
  counterparty: string;
  voucherId: string | null;
  /** An error code that means: stop sending this one. */
  stopped: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A vault order waiting for PayPal approval. */
export interface PendingVault {
  vaultId: string;
  approvalUrl: string;
  amountNgnMinor: number;
  amountUsdMinor: number;
  fxRate: string;
  durationHours: number;
  /** Kept for the authorise call, so a retry after a lost answer isn't a second request. */
  authorizeKey: string;
  createdAt: string;
}

const TERMINAL: VoucherStatus[] = ['SETTLED', 'SETTLEMENT_BLOCKED', 'REJECTED_CONFLICT', 'REJECTED_OVERSPEND'];
export const isTerminal = (status: VoucherStatus) => TERMINAL.includes(status);

export const voucherKey = (view: 'PAYER' | 'PAYEE', vaultId: string, sequence: number) => `${view}:${vaultId}:${sequence}`;
const seenKey = (vaultId: string, sequence: number) => `${vaultId}:${sequence}`;
const CURRENT = 'current';

export class DuplicateVoucher extends Error {}

/** The shared ports, narrowed to what this phone stores. */
export interface AppVaultRepository extends ILocalVaultRepository {
  findCurrent(): Promise<AppVault | null>;
  save(vault: AppVault): Promise<void>;
}

export interface AppVoucherRepository extends ILocalVoucherRepository {
  list(): Promise<AppVoucher[]>;
  listUnsettled(): Promise<AppVoucher[]>;
  find(id: string): Promise<AppVoucher | null>;
  save(voucher: AppVoucher): Promise<void>;
}

type Listener = () => void;

export class LocalStore {
  private readonly listeners = new Set<Listener>();

  // The database opens once, in the background; every call waits for it.
  constructor(private readonly ready: Promise<Kv>) {}

  readonly vaults: AppVaultRepository = {
    findCurrent: async () => (await this.ready).get<AppVault>('vaults', CURRENT),
    save: async (vault: AppVault) => this.write([{ table: "vaults", key: CURRENT, value: vault }]),
  };

  readonly vouchers: AppVoucherRepository = {
    list: async () => (await (await this.ready).all<AppVoucher>('vouchers')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    listUnsettled: async () => (await this.vouchers.list()).filter(v => !isTerminal(v.status) && v.status !== 'DRAFT' && !v.stopped),
    find: async id => (await this.ready).get<AppVoucher>('vouchers', id),
    save: async (voucher: AppVoucher) => {
      const v = voucher;
      await this.write([{ table: 'vouchers', key: v.id, value: v }]);
    },
  };

  readonly seen: ISeenVoucherRepository = {
    hasSeen: async (vaultId, sequence) => (await (await this.ready).get('seen', seenKey(vaultId, sequence))) !== null,
    markSeen: (vaultId, sequence) => this.write([{ table: 'seen', key: seenKey(vaultId, sequence), value: true }]),
  };

  /**
   * ACT-07: the signed voucher and the vault it used, in one write. Nothing leaves the
   * phone before this lands, so a sequence is never lost or reused with other content
   * (FR-13), and the backend, which needs sequences 1 to n, can always release the hold.
   */
  async recordIssued(vault: AppVault, voucher: AppVoucher): Promise<void> {
    if (await (await this.ready).get('vouchers', voucher.id)) throw new DuplicateVoucher(voucher.id);
    await this.write([
      { table: 'vaults', key: CURRENT, value: vault },
      { table: 'vouchers', key: voucher.id, value: voucher },
    ]);
  }

  /** ACT-08: remember the vault and sequence and keep the payee's copy, together (FR-39). */
  async recordAccepted(voucher: AppVoucher): Promise<void> {
    const { vaultId, sequence } = voucher.voucher.payload;
    if (await this.seen.hasSeen(vaultId, sequence)) throw new DuplicateVoucher(voucher.id);
    await this.write([
      { table: 'seen', key: seenKey(vaultId, sequence), value: true },
      { table: 'vouchers', key: voucher.id, value: voucher },
    ]);
  }

  async getMeta<T>(key: string): Promise<T | null> {
    return (await this.ready).get<T>('meta', key);
  }

  setMeta(key: string, value: unknown | null): Promise<void> {
    return this.write([{ table: 'meta', key, value }]);
  }

  /** A revoked or reinstalled identity starts again with nothing. */
  async wipe(): Promise<void> {
    await (await this.ready).clear();
    this.emit();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private async write(writes: Write[]): Promise<void> {
    await (await this.ready).batch(writes);
    this.emit();
  }

  private emit() {
    this.listeners.forEach(l => l());
  }
}
