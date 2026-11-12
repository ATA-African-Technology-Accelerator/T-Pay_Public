/// <reference types="jest" />
// "Hey T-Pay" listening: wakes with what was said after the name, keeps listening through quiet
// spells, and never restarts the recogniser in a tight loop.
type Handler = (e: any) => void;
const handlers: Record<string, Handler[]> = {};
const mockModule = {
  onDevice: true,
  starts: 0,
  isRecognitionAvailable: () => true,
  supportsOnDeviceRecognition: () => mockModule.onDevice,
  requestPermissionsAsync: async () => ({ granted: true }),
  addListener: (name: string, fn: Handler) => {
    (handlers[name] ??= []).push(fn);
    return { remove: () => { handlers[name] = (handlers[name] ?? []).filter(f => f !== fn); } };
  },
  start: jest.fn(() => { mockModule.starts += 1; }),
  stop: jest.fn(() => { emit('end', {}); }),
};
function emit(name: string, e: unknown) { [...(handlers[name] ?? [])].forEach(f => f(e)); }

jest.mock('expo-speech-recognition', () => ({ ExpoSpeechRecognitionModule: mockModule }));
jest.mock('expo-speech', () => ({ stop: jest.fn(), speak: jest.fn() }));
jest.mock('expo-audio', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../../crypto/encoding', () => ({ base64ToBytes: jest.fn(), bytesToBase64: jest.fn() }));

const { ExpoSpeechInput } = require('../speech') as typeof import('../speech');
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

beforeEach(() => {
  jest.useFakeTimers();
  mockModule.onDevice = true; mockModule.starts = 0; mockModule.start.mockClear();
  for (const k of Object.keys(handlers)) delete handlers[k];
});
afterEach(() => jest.useRealTimers());

it('wakes with the request said after the name, on the phone when it can', async () => {
  const onWake = jest.fn();
  const stop = new ExpoSpeechInput().startWakeWord(onWake);
  await flush();
  expect(mockModule.start).toHaveBeenCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: true }));
  emit('result', { isFinal: false, results: [{ transcript: 'hey T-Pay collect' }] });
  emit('result', { isFinal: true, results: [{ transcript: 'hey T-Pay collect two thousand' }] });
  jest.advanceTimersByTime(1_300);
  await flush();
  expect(onWake).toHaveBeenCalledWith('collect two thousand');
  stop();
});

it('ignores talk without the name', async () => {
  const onWake = jest.fn();
  const stop = new ExpoSpeechInput().startWakeWord(onWake);
  await flush();
  emit('result', { isFinal: true, results: [{ transcript: 'pay me two thousand' }] });
  jest.advanceTimersByTime(3_000);
  expect(onWake).not.toHaveBeenCalled();
  stop();
});

it('listens with the phone\'s normal recogniser when it has none of its own', async () => {
  mockModule.onDevice = false;
  const stop = new ExpoSpeechInput().startWakeWord(jest.fn());
  await flush();
  expect(mockModule.start).toHaveBeenCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: false }));
  stop();
});

it('starts again at once after a quiet spell, for as long as the app is open', async () => {
  const stop = new ExpoSpeechInput().startWakeWord(jest.fn());
  for (let i = 0; i < 10; i += 1) {
    await flush();
    jest.advanceTimersByTime(6_000); // listened for a while, heard nothing
    emit('error', { error: 'no-speech', message: '' });
    jest.advanceTimersByTime(300);
  }
  await flush();
  expect(mockModule.starts).toBe(11);
  stop();
});

it('wakes on "T-Pay" said on its own', async () => {
  const onWake = jest.fn();
  const stop = new ExpoSpeechInput().startWakeWord(onWake);
  await flush();
  emit('result', { isFinal: true, results: [{ transcript: 'T-Pay' }] });
  jest.advanceTimersByTime(800);
  await flush();
  expect(onWake).toHaveBeenCalledWith('');
  stop();
});

it('backs off when the recogniser keeps stopping at once, but never gives up', async () => {
  const stop = new ExpoSpeechInput().startWakeWord(jest.fn());
  for (let i = 0; i < 12; i += 1) {
    await flush();
    emit('end', {});
    jest.advanceTimersByTime(5_000);
  }
  await flush();
  const early = mockModule.starts;
  expect(early).toBeLessThan(10); // spaced out: 0.5 s, 1 s, 2 s, 4 s...
  jest.advanceTimersByTime(120_000);
  await flush();
  expect(mockModule.starts).toBeGreaterThan(early); // and tried again later
  stop();
});

it('wakes when the name is only in the recogniser\'s second guess', async () => {
  const onWake = jest.fn();
  const stop = new ExpoSpeechInput().startWakeWord(onWake);
  await flush();
  emit('result', { isFinal: true, results: [{ transcript: 'hey they pay collect' }, { transcript: 'hey T-Pay collect' }] });
  jest.advanceTimersByTime(1_300);
  await flush();
  expect(onWake).toHaveBeenCalledWith('collect');
  stop();
});

it('reports what it is doing, for the check in Settings', async () => {
  const input = new ExpoSpeechInput();
  const seen: string[] = [];
  input.onWakeCheck(c => seen.push(`${c.state}:${c.heard ?? ''}`));
  const stop = input.startWakeWord(jest.fn());
  await flush();
  emit('result', { isFinal: false, results: [{ transcript: 'good morning' }] });
  stop();
  expect(seen).toEqual(expect.arrayContaining(['listening:', 'listening:good morning', 'off:good morning']));
});
