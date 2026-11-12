/// <reference types="jest" />
// Offline, the phone's model answers first and the rules answer whenever it can't.
// Every model answer is checked before anyone sees it.
import { MemoryKv } from '../../../adapters/storage/kvCore';
import { LocalStore } from '../../../adapters/storage/localStore';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('../../../session/guard', () => ({ withSession: (call: () => unknown) => call() }));

let mockState: { kind: string } = { kind: 'ready' };
let mockOnline = false;
const mockInterpret = jest.fn();
const mockPropose = jest.fn();
const mockStore = new LocalStore(Promise.resolve(new MemoryKv()));
jest.mock('../../../composition', () => ({
  api: { interpret: (...args: unknown[]) => mockInterpret(...args) }, store: mockStore, clock: { now: () => new Date('2026-11-10T10:00:00Z') },
  connectivity: { isOnline: async () => mockOnline },
  localModel: { refresh: async () => mockState, propose: (...args: unknown[]) => mockPropose(...args) },
}));

const { interpretText } = require('../assistant') as typeof import('../assistant');
const LEFT = 500_000;

beforeEach(() => { mockState = { kind: 'ready' }; mockOnline = false; mockPropose.mockReset(); mockInterpret.mockReset(); });

describe('online', () => {
  beforeEach(() => { mockOnline = true; });

  it('answers a clear request on the phone at once, with no wait for the server', async () => {
    expect(await interpretText('collect 2k', 'en', LEFT)).toMatchObject({ intent: 'CREATE_PAYMENT_REQUEST', amountNgnMinor: 200_000, offline: false, spokenReply: null });
    expect(await interpretText('pay five hundred naira', 'en', LEFT)).toMatchObject({ intent: 'PAY_AMOUNT', amountNgnMinor: 50_000, offline: false });
    expect(await interpretText('how much do I have', 'en', LEFT)).toMatchObject({ intent: 'CHECK_BALANCE', offline: false });
    expect(mockInterpret).not.toHaveBeenCalled();
  });

  it('still refuses a payment above what the vault has left', async () => {
    expect(await interpretText('pay 9000', 'en', LEFT)).toMatchObject({ intent: 'UNKNOWN', overCapacity: true });
    expect(mockInterpret).not.toHaveBeenCalled();
  });

  it('asks the server for what the rules can’t read in full: a sale, a missing amount, another language', async () => {
    mockInterpret.mockResolvedValue({ proposal: { intent: 'RECORD_SALE', amountNgnMinor: 100_000, itemName: 'Coke' }, transcript: 't', spokenReply: 'You sold Coke?' });
    await interpretText('I sold two Coke for 1000', 'en', LEFT);
    await interpretText('collect money', 'en', LEFT);
    await interpretText('gba ẹgbẹ̀rún kan', 'yo', LEFT);
    expect(mockInterpret).toHaveBeenCalledTimes(3);
  });
});

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

describe('questions about the app', () => {
  it('answers "how do I pay" on the phone, online or not, with no trip to the server', async () => {
    mockOnline = true;
    expect(await interpretText('how do I pay', 'en', 0)).toMatchObject({ intent: 'HELP', helpTopic: 'PAY', spokenReply: null });
    expect(mockInterpret).not.toHaveBeenCalled();
  });

  it('never reads out the model\'s own words for a question', async () => {
    mockOnline = true;
    mockInterpret.mockResolvedValue({
      proposal: { intent: 'HELP', amountNgnMinor: null, itemName: null, helpTopic: 'LOCK' }, transcript: 'abeg explain am', spokenReply: 'anything', needsConfirmation: true,
    });
    expect(await interpretText('abeg explain am', 'pcm', 0)).toMatchObject({ intent: 'HELP', helpTopic: 'LOCK', spokenReply: null });
  });

  it('keeps the amount of a payment refused for having no vault, so it can offer to lock it', async () => {
    expect(await interpretText('pay 2000', 'en', 0)).toMatchObject({ overCapacity: true, requestedNgnMinor: 200_000 });
  });
});
