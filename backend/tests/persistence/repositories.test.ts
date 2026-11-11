import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryDeviceRepository } from '../../src/adapters/persistence/InMemoryDeviceRepository';
import { InMemoryIdempotencyStore } from '../../src/adapters/persistence/InMemoryIdempotencyStore';
import { InMemoryTransactionRepository } from '../../src/adapters/persistence/InMemoryTransactionRepository';
import { InMemoryWalletRepository } from '../../src/adapters/persistence/InMemoryWalletRepository';
import { InMemoryVoucherRepository } from '../../src/adapters/persistence/InMemoryVoucherRepository';
import { InMemoryVaultRepository } from '../../src/adapters/persistence/InMemoryVaultRepository';
import { PostgresDeviceRepository } from '../../src/adapters/persistence/PostgresDeviceRepository';
import { PostgresIdempotencyStore } from '../../src/adapters/persistence/PostgresIdempotencyStore';
import { PostgresTransactionRepository } from '../../src/adapters/persistence/PostgresTransactionRepository';
import { PostgresVaultRepository } from '../../src/adapters/persistence/PostgresVaultRepository';
import { PostgresVoucherRepository } from '../../src/adapters/persistence/PostgresVoucherRepository';
import { PostgresWalletRepository } from '../../src/adapters/persistence/PostgresWalletRepository';
import type {
  IDeviceRepository, IIdempotencyStore, ITransactionRepository, IVaultRepository, IWalletRepository, Withdrawal,
} from '../../src/services/ports';
import { device, transaction, vault } from '../support/deviceFactory';
import { createTestDatabase, testDatabaseUrl } from '../support/testDatabase';





interface Repositories {
  devices: IDeviceRepository;
  transactions: ITransactionRepository;
  vaults: IVaultRepository;
  idempotency: IIdempotencyStore;
  wallet: IWalletRepository;
  close(): Promise<void>;
}

const inMemory = async (): Promise<Repositories> => {
  const transactions = new InMemoryTransactionRepository();
  const vaults = new InMemoryVaultRepository();
  return {
    devices: new InMemoryDeviceRepository(),
    transactions,
    vaults,
    idempotency: new InMemoryIdempotencyStore(),
    wallet: new InMemoryWalletRepository(new InMemoryVoucherRepository(vaults, transactions), transactions),
    close: async () => {},
  };
};

const postgres = async (): Promise<Repositories> => {
  const { pool, close } = await createTestDatabase();
  return {
    devices: new PostgresDeviceRepository(pool),
    transactions: new PostgresTransactionRepository(pool),
    vaults: new PostgresVaultRepository(pool),
    idempotency: new PostgresIdempotencyStore(pool),
    wallet: new PostgresWalletRepository(pool),
    close,
  };
};

const implementations = [
  { name: 'in memory', create: inMemory },
  ...(testDatabaseUrl ? [{ name: 'Postgres', create: postgres }] : []),
];

describe.each(implementations)('$name repositories', ({ create }) => {
  let repositories: Repositories;

  beforeAll(async () => {
    repositories = await create();
  });

  afterAll(async () => {
    await repositories.close();
  });

  describe('devices', () => {
    it('finds a saved device by public key and token hash', async () => {
      const saved = device('find');
      await repositories.devices.save(saved);

      expect(await repositories.devices.findByPublicKey(saved.publicKey)).toEqual(saved);
      expect(await repositories.devices.findByTokenHash(saved.tokenHash)).toEqual(saved);
    });

    it('finds a saved device by id and key id', async () => {
      const saved = device('lookup');
      await repositories.devices.save(saved);

      expect(await repositories.devices.findById(saved.id)).toEqual(saved);
      expect(await repositories.devices.findByKeyId(saved.keyId)).toEqual(saved);
    });

    it('returns null for an unknown device', async () => {
      expect(await repositories.devices.findById('unknown')).toBeNull();
      expect(await repositories.devices.findByKeyId('unknown')).toBeNull();
      expect(await repositories.devices.findByPublicKey('unknown')).toBeNull();
      expect(await repositories.devices.findByTokenHash('unknown')).toBeNull();
    });

    it('updates a device that already exists', async () => {
      await repositories.devices.save(device('update'));
      const changed = device('update', { displayName: 'Mama Nkechi Stores', language: 'yo' });

      expect(await repositories.devices.save(changed)).toEqual(changed);
      expect(await repositories.devices.findByPublicKey(changed.publicKey)).toEqual(changed);
    });

    it('keeps one identity when two saves race on the same key', async () => {
      const first = device('race');
      const second = device('race', { id: 'dev_other', keyId: 'key_other', tokenHash: 'hash_new' });
      await repositories.devices.save(first);

      expect(await repositories.devices.save(second)).toEqual({ ...first, tokenHash: 'hash_new' });
    });

    it('never clears a revocation', async () => {
      const revokedAt = new Date('2026-11-07T10:00:00.000Z');
      await repositories.devices.save(device('revoked', { revokedAt }));

      const saved = await repositories.devices.save(device('revoked'));

      expect(saved.revokedAt).toEqual(revokedAt);
    });
  });

  describe('transactions', () => {
    const page = (deviceId: string, cursor: string | null = null, limit = 10) =>
      repositories.transactions.listForDevice(deviceId, cursor, limit);

    beforeAll(async () => {
      await repositories.devices.save(device('a'));
      await repositories.devices.save(device('b'));
      await repositories.devices.save(device('paged'));
    });

    it('lists only the events of one device, newest first', async () => {
      await repositories.transactions.append(transaction('txn_a1', 'dev_a'));
      await repositories.transactions.append(transaction('txn_a2', 'dev_a'));
      await repositories.transactions.append(transaction('txn_b1', 'dev_b'));

      const { items } = await page('dev_a');

      expect(items.map((item) => item.id)).toEqual(['txn_a2', 'txn_a1']);
      expect(items[0]).toEqual(transaction('txn_a2', 'dev_a'));
    });

    it('keeps empty optional fields as null', async () => {
      const event = transaction('txn_null', 'dev_b', {
        type: 'VAULT_LOCKED',
        amountNgnMinor: null,
        amountUsdMinor: null,
        vaultId: null,
        voucherId: null,
        paypalReferenceId: null,
      });
      await repositories.transactions.append(event);

      expect((await page('dev_b')).items[0]).toEqual(event);
    });

    it('records a repeated event only once', async () => {
      await repositories.transactions.append(transaction('txn_once', 'dev_b'));
      await repositories.transactions.append(transaction('txn_once', 'dev_b'));

      const ids = (await page('dev_b')).items.map((item) => item.id);

      expect(ids.filter((id) => id === 'txn_once')).toHaveLength(1);
    });

    it('pages through history with a cursor', async () => {
      for (const id of ['txn_1', 'txn_2', 'txn_3']) {
        await repositories.transactions.append(transaction(id, 'dev_paged'));
      }

      const first = await page('dev_paged', null, 2);
      const second = await page('dev_paged', first.nextCursor, 2);

      expect(first.items.map((item) => item.id)).toEqual(['txn_3', 'txn_2']);
      expect(second.items.map((item) => item.id)).toEqual(['txn_1']);
      expect(second.nextCursor).toBeNull();
    });
  });

  describe('vaults', () => {
    const lock = {
      paypalAuthorizationId: 'AUTH-1',
      spendBy: new Date('2026-11-07T10:00:00.000Z'),
      settleBy: new Date('2026-11-08T10:00:00.000Z'),
      honorEndsAt: new Date('2026-11-07T22:00:00.000Z'),
    };

    beforeAll(async () => {
      for (const name of ['v1', 'v2', 'v3', 'v4']) {
        await repositories.devices.save(device(name));
      }
    });

    it('stores a vault and finds it by id and device', async () => {
      const created = vault('find', 'dev_v1');

      expect(await repositories.vaults.create(created)).toBe(true);
      expect(await repositories.vaults.findById(created.id)).toEqual({ ...created, fundedBy: 'PAYPAL' });
      expect(await repositories.vaults.findOpenForDevice('dev_v1')).toEqual({ ...created, fundedBy: 'PAYPAL' });
    });

    it('returns null for an unknown vault', async () => {
      expect(await repositories.vaults.findById('vlt_unknown')).toBeNull();
      expect(await repositories.vaults.findOpenForDevice('dev_unknown')).toBeNull();
    });

    it('allows only one open vault per device', async () => {
      await repositories.vaults.create(vault('first', 'dev_v2'));

      expect(await repositories.vaults.create(vault('second', 'dev_v2'))).toBe(false);
      expect((await repositories.vaults.findOpenForDevice('dev_v2'))?.id).toBe('vlt_first');
    });

    it('activates a pending vault only once', async () => {
      await repositories.vaults.create(vault('lock', 'dev_v3'));

      const active = await repositories.vaults.activate('vlt_lock', lock);
      const again = await repositories.vaults.activate('vlt_lock', { ...lock, paypalAuthorizationId: 'AUTH-2' });

      expect(active).toMatchObject({ status: 'ACTIVE', ...lock });
      expect((await repositories.vaults.findByAuthorizationId('AUTH-1'))?.id).toBe('vlt_lock');
      expect((await repositories.vaults.findByOrderId('ORDER-lock'))?.id).toBe('vlt_lock');
      expect(again).toBeNull();
    });

    it('lists open vaults once their settle-by time has passed', async () => {
      const due = await repositories.vaults.findDueForRelease(lock.settleBy);
      const early = await repositories.vaults.findDueForRelease(new Date('2026-11-08T09:59:59.000Z'));

      expect(due.map(({ id }) => id)).toContain('vlt_lock');
      expect(early.map(({ id }) => id)).not.toContain('vlt_lock');
    });

    it('lists vaults whose honor period has ended, until settle-by', async () => {
      const due = await repositories.vaults.findDueForReauthorization(lock.honorEndsAt);
      const early = await repositories.vaults.findDueForReauthorization(new Date('2026-11-07T21:59:59.000Z'));
      const late = await repositories.vaults.findDueForReauthorization(lock.settleBy);

      expect(due.map(({ id }) => id)).toContain('vlt_lock');
      expect(early.map(({ id }) => id)).not.toContain('vlt_lock');
      expect(late.map(({ id }) => id)).not.toContain('vlt_lock');
    });

    it('frees the device when a pending vault is abandoned, but never an active one', async () => {
      await repositories.vaults.abandon('vlt_lock');
      expect((await repositories.vaults.findById('vlt_lock'))?.status).toBe('ACTIVE');

      await repositories.vaults.create(vault('stale', 'dev_v4'));
      await repositories.vaults.abandon('vlt_stale');

      expect(await repositories.vaults.findOpenForDevice('dev_v4')).toBeNull();
      expect(await repositories.vaults.create(vault('fresh', 'dev_v4'))).toBe(true);
    });
  });

  describe('idempotency keys', () => {
    const response = { status: 201, body: { data: { vaultId: 'vlt_1' } } };

    beforeAll(async () => {
      await repositories.devices.save(device('i1'));
      await repositories.devices.save(device('i2'));
    });

    it('claims a new key, then replays the stored response', async () => {
      const { idempotency } = repositories;

      expect(await idempotency.claim('dev_i1', 'k1', 'hash')).toEqual({ outcome: 'NEW' });
      await idempotency.complete('dev_i1', 'k1', response);

      expect(await idempotency.claim('dev_i1', 'k1', 'hash')).toEqual({ outcome: 'REPLAY', response });
    });

    it('treats a different body or an unfinished request as a conflict', async () => {
      const { idempotency } = repositories;
      await idempotency.claim('dev_i1', 'k2', 'hash');

      expect(await idempotency.claim('dev_i1', 'k2', 'hash')).toEqual({ outcome: 'CONFLICT' });
      await idempotency.complete('dev_i1', 'k2', response);
      expect(await idempotency.claim('dev_i1', 'k2', 'other')).toEqual({ outcome: 'CONFLICT' });
    });

    it('lets a failed request try again with the same key', async () => {
      const { idempotency } = repositories;
      await idempotency.claim('dev_i1', 'k3', 'hash');
      await idempotency.release('dev_i1', 'k3');

      expect(await idempotency.claim('dev_i1', 'k3', 'hash')).toEqual({ outcome: 'NEW' });
    });

    it('keeps keys separate per device', async () => {
      await repositories.idempotency.claim('dev_i1', 'shared', 'hash');

      expect(await repositories.idempotency.claim('dev_i2', 'shared', 'hash')).toEqual({ outcome: 'NEW' });
    });
  });

  describe('wallet', () => {
    const NOW = new Date('2026-11-06T10:00:00.000Z');
    const withdrawal = (id: string, overrides: Partial<Withdrawal> = {}): Withdrawal => ({
      id,
      deviceId: 'dev_w1',
      receiverEmail: 'seller@example.com',
      amountUsdMinor: 133,
      amountNgnMinor: 200_000,
      status: 'PENDING',
      paypalBatchId: null,
      attempts: 0,
      nextAttemptAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      autoCashOut: false,
      ...overrides,
    });
    const entry = (id: string, type: 'WITHDRAWAL' | 'WITHDRAWAL_RETURNED', withdrawalId: string) => ({
      id,
      deviceId: 'dev_w1',
      type,
      amountUsdMinor: 133,
      amountNgnMinor: 200_000,
      voucherId: null,
      withdrawalId,
      depositId: null,
      paypalCaptureId: null,
      createdAt: NOW,
    });

    beforeAll(async () => {
      await repositories.devices.save(device('w1'));
    });

    it('stores a withdrawal and its ledger entry together', async () => {
      await repositories.wallet.withWalletLock('dev_w1', async (session) => {
        await session.insertWithdrawal(withdrawal('wdr_1'));
        await session.addLedgerEntry(entry('led_1', 'WITHDRAWAL', 'wdr_1'));
      });

      expect(await repositories.wallet.findWithdrawal('wdr_1')).toEqual(withdrawal('wdr_1'));
      await repositories.wallet.withWalletLock('dev_w1', async ({ ledger }) => {
        expect(ledger).toEqual([{ ...entry('led_1', 'WITHDRAWAL', 'wdr_1'), vaultId: null, autoCashOut: false }]);
      });
    });

    it('updates a withdrawal', async () => {
      const updated = await repositories.wallet.withWalletLock('dev_w1', ({ updateWithdrawal }) =>
        updateWithdrawal('wdr_1', { paypalBatchId: 'BATCH-1', attempts: 2 }));

      expect(updated).toEqual(withdrawal('wdr_1', { paypalBatchId: 'BATCH-1', attempts: 2 }));
    });

    it('records one return per withdrawal', async () => {
      await repositories.wallet.withWalletLock('dev_w1', async ({ addLedgerEntry }) => {
        await addLedgerEntry(entry('led_2', 'WITHDRAWAL_RETURNED', 'wdr_1'));
        await addLedgerEntry(entry('led_3', 'WITHDRAWAL_RETURNED', 'wdr_1'));
      });

      await repositories.wallet.withWalletLock('dev_w1', async ({ ledger }) => {
        expect(ledger.map(({ id }) => id)).toEqual(['led_1', 'led_2']);
      });
    });

    it('lists pending withdrawals that are due', async () => {
      const later = new Date('2026-11-06T11:00:00.000Z');
      await repositories.wallet.withWalletLock('dev_w1', async ({ insertWithdrawal }) => {
        await insertWithdrawal(withdrawal('wdr_due', { nextAttemptAt: NOW }));
        await insertWithdrawal(withdrawal('wdr_later', { nextAttemptAt: later }));
        await insertWithdrawal(withdrawal('wdr_done', { status: 'COMPLETED' }));
      });

      const due = await repositories.wallet.findDueWithdrawals(NOW);

      expect(due.map(({ id }) => id)).toContain('wdr_due');
      expect(due.map(({ id }) => id)).not.toContain('wdr_later');
      expect(due.map(({ id }) => id)).not.toContain('wdr_done');
    });
  });
});
