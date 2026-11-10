/// <reference types="jest" />
// Offline, the phone's model answers first and the rules answer whenever it can't.
// Every model answer is checked before anyone sees it.
import { MemoryKv } from '../../../adapters/storage/kvCore';
import { LocalStore } from '../../../adapters/storage/localStore';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('../../../session/guard', () => ({ withSession: (call: () => unknown) => call() }));

let mockState: { kind: string } = { kind: 'ready' };
const mockPropose = jest.fn();
const mockStore = new LocalStore(Promise.resolve(new MemoryKv()));
jest.mock('../../../composition', () => ({
  api: {}, store: mockStore, clock: { now: () => new Date('2026-11-10T10:00:00Z') },
  connectivity: { isOnline: async () => false },
  localModel: { refresh: async () => mockState, propose: (...args: unknown[]) => mockPropose(...args) },
}));

const { interpretText } = require('../assistant') as typeof import('../assistant');
const LEFT = 500_000;

beforeEach(() => { mockState = { kind: 'ready' }; mockPropose.mockReset(); });

it('uses the phone model for what the rules can’t read', async () => {
  mockPropose.mockResolvedValue('{"intent":"CREATE_PAYMENT_REQUEST","amountNaira":1500,"itemName":null}');
  expect(await interpretText('gba ẹgbẹ̀rún kan àti ẹ̀ẹ́dẹ́gbẹ̀ta', 'yo', LEFT))
    .toMatchObject({ intent: 'CREATE_PAYMENT_REQUEST', amountNgnMinor: 150_000, offline: true, onDevice: true });
  expect((await mockStore.getMeta<{ source: string; outcome: string }[]>('assistant.log'))?.[0]).toMatchObject({ source: 'phone', outcome: 'ACCEPTED' });
});

it('never wakes the model when the rules already understood, so the answer is instant', async () => {
  mockPropose.mockResolvedValue({ intent: 'PAY_AMOUNT', amountNaira: 500, itemName: null });
  expect(await interpretText('make e pay me five hundred', 'pcm', LEFT))
    .toMatchObject({ intent: 'CREATE_PAYMENT_REQUEST', amountNgnMinor: 50_000, onDevice: false });
  expect(await interpretText('how much I get', 'pcm', LEFT)).toMatchObject({ intent: 'CHECK_BALANCE' });
  expect(mockPropose).not.toHaveBeenCalled();
});

it('takes only the amount from the model when the rules know the intent', async () => {
  mockPropose.mockResolvedValue({ intent: 'CREATE_PAYMENT_REQUEST', amountNaira: 2000, itemName: null });
  expect(await interpretText('collect ẹgbàá', 'en', LEFT)).toMatchObject({ intent: 'CREATE_PAYMENT_REQUEST', amountNgnMinor: 200_000, onDevice: true });
});

it('never passes on a payment above what the vault has left', async () => {
  mockPropose.mockResolvedValue({ intent: 'PAY_AMOUNT', amountNaira: 9000, itemName: null });
  expect(await interpretText('pay 9000', 'en', LEFT)).toMatchObject({ intent: 'UNKNOWN', amountNgnMinor: null, overCapacity: true });
  expect(await interpretText('san ẹgbàárùn-ún', 'yo', LEFT)).toMatchObject({ intent: 'UNKNOWN', amountNgnMinor: null, overCapacity: true });
});

it('falls back to the rules when the model breaks the format, is unsure, fails or is slow', async () => {
  const unreadable = 'gba ẹgbẹ̀rún kan'; // the rules know no Yoruba words, so the model is asked
  mockPropose.mockResolvedValueOnce('{"intent":"TRANSFER_ALL","amountNaira":999999,"itemName":null}');
  expect(await interpretText(unreadable, 'yo', LEFT)).toMatchObject({ intent: 'UNKNOWN', onDevice: false });
  mockPropose.mockResolvedValueOnce({ intent: 'UNKNOWN', amountNaira: null, itemName: null });
  expect(await interpretText(unreadable, 'yo', LEFT)).toMatchObject({ intent: 'UNKNOWN', onDevice: false });
  mockPropose.mockRejectedValueOnce(new Error('MODEL_TIMEOUT'));
  expect(await interpretText(unreadable, 'yo', LEFT)).toMatchObject({ intent: 'UNKNOWN', onDevice: false });
  expect(mockPropose).toHaveBeenCalledTimes(3);
});

it('uses only the rules when the model was never downloaded', async () => {
  mockState = { kind: 'absent' };
  expect(await interpretText('collect 50', 'en', LEFT)).toMatchObject({ intent: 'CREATE_PAYMENT_REQUEST', amountNgnMinor: 5_000, onDevice: false });
  expect(mockPropose).not.toHaveBeenCalled();
});
