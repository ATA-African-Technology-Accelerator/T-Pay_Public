// ACT-15 voice. Output speaks confirmations (NFR-06) and says nothing when no voice
// exists for the language: the screen still shows everything (FR-34). Input records
// speech for the online assistant, or transcribes on the phone when offline.
import * as Speech from 'expo-speech';
import { AudioModule, RecordingPresets, createAudioPlayer, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { ISpeechInput, ISpeechOutput, RecordedSpeech } from '@tpay/shared/application/ports/device';
import type { Language } from '@tpay/shared/contracts/statuses';
import { readYesNo } from '../../features/assistant/yesNo';
import { base64ToBytes, bytesToBase64 } from '../crypto/encoding';

// Pidgin has no voice of its own; Nigerian English reads it best.
const VOICE: Record<Language, string> = { en: 'en-NG', pcm: 'en-NG', yo: 'yo-NG', ig: 'ig-NG', ha: 'ha-NG' };
// On-device recognisers ship for English only on most Android phones.
const OFFLINE_LOCALE: Partial<Record<Language, string>> = { en: 'en-US', pcm: 'en-US' };
const MAX_RECORDING_MS = 30_000;
const LISTEN_FOR_ANSWER_MS = 7_000;
// The phone's recogniser is asked for the person's own language; it simply hears nothing if it has none.
const ANSWER_LOCALE: Record<Language, string> = { en: 'en-NG', pcm: 'en-NG', yo: 'yo-NG', ig: 'ig-NG', ha: 'ha-NG' };
// Metering is in decibels, from very quiet (-160) up to 0. Talking near the phone is well above this.
const SPEECH_DB = -38;
const QUIET_AFTER_SPEECH_MS = 1_400;
const WAIT_FOR_SPEECH_MS = 7_000;
const METER_EVERY_MS = 150;

/** A natural voice from the server: a base64 WAV clip, or null when it can't be had. */
export type CloudVoice = (text: string, language: Language) => Promise<string | null>;

// How long to wait for the server's voice before the phone's own voice reads it instead.
const CLOUD_WAIT_MS = 3_000;
const CACHE_LIMIT = 20;
// A reply is a sentence. If playback never reports back, carry on after this.
const MAX_SPEECH_MS = 25_000;

type Player = ReturnType<typeof createAudioPlayer>;

export class ExpoSpeechOutput implements ISpeechOutput {
  private voices: Promise<string[]> | null = null;
  private readonly clips = new Map<string, string>();
  private player: Player | null = null;
  private finishCurrent: (() => void) | null = null;
  private turn = 0;

  /** `cloud` is optional: without it, or when it fails, the phone's own voice is used. */
  constructor(private readonly cloud?: CloudVoice) {}

  /** Stops whatever is being read, so a new sentence never talks over an old one. */
  stop(): void {
    this.turn += 1;
    Speech.stop();
    try { this.player?.remove(); } catch { /* already gone */ }
    this.player = null;
    this.finishCurrent?.();
  }

  private async clipFor(text: string, language: Language): Promise<string | null> {
    const key = `${language}|${text}`;
    const known = this.clips.get(key);
    if (known) return known;
    const wav = await this.cloud?.(text, language);
    if (!wav) return null;
    const file = new File(Paths.cache, `tpay-voice-${Date.now()}.wav`);
    file.create({ overwrite: true });
    file.write(base64ToBytes(wav));
    if (this.clips.size >= CACHE_LIMIT) {
      const oldest = this.clips.keys().next().value as string;
      try { new File(this.clips.get(oldest) as string).delete(); } catch { /* the cache is cleared anyway */ }
      this.clips.delete(oldest);
    }
    this.clips.set(key, file.uri);
    return file.uri;
  }

  /** Starts something that talks, and waits until it has finished (or was stopped). */
  private talk(start: (done: () => void) => void): Promise<void> {
    return new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(timer);
        if (this.finishCurrent === done) this.finishCurrent = null;
        resolve();
      };
      const timer = setTimeout(done, MAX_SPEECH_MS);
      this.finishCurrent = done;
      start(done);
    });
  }

  private async play(uri: string): Promise<void> {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
    await this.talk(done => {
      const player = createAudioPlayer({ uri });
      this.player = player;
      player.addListener('playbackStatusUpdate', status => { if (status.didJustFinish) done(); });
      player.play();
    });
    try { this.player?.remove(); } catch { /* already gone */ }
    this.player = null;
  }

  async isAvailable(language: Language): Promise<boolean> {
    this.voices ??= Speech.getAvailableVoicesAsync().then(v => v.map(x => x.language.toLowerCase())).catch(() => []);
    const want = VOICE[language].toLowerCase();
    const prefix = want.split('-')[0] as string;
    const have = await this.voices;
    // An English phone voice is always fine for English and Pidgin.
    return have.some(l => l === want || l.startsWith(`${prefix}-`) || l === prefix) || (prefix === 'en' && Platform.OS !== 'web');
  }

  /** Resolves when the reading has finished, so the app can listen for an answer straight after. */
  async speak(text: string, language: Language, natural = false): Promise<void> {
    this.stop();
    const turn = this.turn;
    try {
      if (natural && this.cloud && Platform.OS !== 'web') {
        const uri = await Promise.race([
          this.clipFor(text, language).catch(() => null),
          new Promise<null>(resolve => setTimeout(() => resolve(null), CLOUD_WAIT_MS)),
        ]);
        if (turn !== this.turn) return; // something newer is being said
        if (uri) { await this.play(uri); return; }
      }
      if (!(await this.isAvailable(language))) return;
      await this.talk(done => Speech.speak(text, { language: VOICE[language], rate: 0.9, onDone: done, onStopped: done, onError: done }));
    } catch (e) {
      console.warn('Speech output failed', e);
    }
  }
}

type Recorder = InstanceType<typeof AudioModule.AudioRecorder>;

export class ExpoSpeechInput implements ISpeechInput {
  private recorder: Recorder | null = null;
  private finish: (() => void) | null = null;

  async canRecord(): Promise<boolean> {
    return (await requestRecordingPermissionsAsync()).granted;
  }

  /** Records until stop() is called, or for at most 30 seconds. */
  async record(): Promise<RecordedSpeech> {
    if (!(await this.canRecord())) throw new Error('MICROPHONE_DENIED');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    const preset = RecordingPresets.HIGH_QUALITY;
    const recorder: Recorder = new AudioModule.AudioRecorder({
      extension: preset.extension, sampleRate: 16_000, numberOfChannels: 1, bitRate: 32_000, isMeteringEnabled: true,
      ...(Platform.OS === 'android' ? preset.android : Platform.OS === 'ios' ? preset.ios : preset.web),
    } as never);
    this.recorder = recorder;
    await recorder.prepareToRecordAsync();
    recorder.record();
    // Stops by itself a moment after the person stops talking. Tapping the button stops it too.
    let heard = false;
    let metered = false; // some phones report no level; then nothing is concluded from silence
    await new Promise<void>(resolve => {
      const started = Date.now();
      let quietSince = started;
      const finish = () => { clearTimeout(timer); clearInterval(meter); resolve(); };
      const timer = setTimeout(finish, MAX_RECORDING_MS);
      const meter = setInterval(() => {
        const level = recorder.getStatus().metering;
        const now = Date.now();
        if (typeof level === 'number') metered = true;
        if (typeof level === 'number' && level > SPEECH_DB) { heard = true; quietSince = now; return; }
        if (heard ? now - quietSince > QUIET_AFTER_SPEECH_MS : now - started > WAIT_FOR_SPEECH_MS) finish();
      }, METER_EVERY_MS);
      this.finish = finish;
    });
    await recorder.stop();
    this.recorder = null;
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    if (!recorder.uri) throw new Error('NO_RECORDING');
    if (!heard && metered) throw new Error('NO_SPEECH');
    const file = new File(recorder.uri);
    const audioBase64 = bytesToBase64(await file.bytes());
    try { file.delete(); } catch { /* the cache is cleared anyway */ }
    return { audioBase64, audioMimeType: 'audio/mp4' };
  }

  stop(): void {
    this.finish?.();
    this.finish = null;
  }

  /** Listens for a short answer, and says whether it was a yes, a no, or neither (null). */
  async listenYesNo(language: Language): Promise<'yes' | 'no' | null> {
    let module: typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
    try {
      module = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
      if (!module.isRecognitionAvailable()) return null;
      if (!(await module.requestPermissionsAsync()).granted) return null;
    } catch {
      return null;
    }
    return new Promise<'yes' | 'no' | null>(resolve => {
      let answer: 'yes' | 'no' | null = null;
      let settled = false;
      const done = () => { if (settled) return; settled = true; clearTimeout(timer); subs.forEach(x => x.remove()); resolve(answer); };
      const timer = setTimeout(() => { module.stop(); done(); }, LISTEN_FOR_ANSWER_MS);
      const subs = [
        module.addListener('result', e => { answer = readYesNo(e.results[0]?.transcript ?? '') ?? answer; if (answer || e.isFinal) { module.stop(); } }),
        module.addListener('error', done),
        module.addListener('end', done),
      ];
      this.finish = () => { module.stop(); };
      module.start({ lang: ANSWER_LOCALE[language], interimResults: true, continuous: false });
    });
  }

  /** Null when this phone can't recognise the language offline; the screen then offers typing. */
  async transcribeOffline(language: Language): Promise<string | null> {
    const locale = OFFLINE_LOCALE[language];
    if (!locale) return null;
    let module: typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
    try {
      module = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
      if (!module.isRecognitionAvailable() || !module.supportsOnDeviceRecognition()) return null;
      if (!(await module.requestPermissionsAsync()).granted) return null;
    } catch {
      return null;
    }
    return new Promise<string | null>(resolve => {
      let best: string | null = null;
      const subs = [
        module.addListener('result', e => { const text = e.results[0]?.transcript; if (text) best = text; if (e.isFinal) done(); }),
        module.addListener('error', () => done()),
        module.addListener('end', () => done()),
      ];
      let settled = false;
      const done = () => { if (settled) return; settled = true; subs.forEach(s => s.remove()); resolve(best); };
      this.finish = () => { module.stop(); };
      module.start({ lang: locale, requiresOnDeviceRecognition: true, interimResults: false, continuous: false });
    });
  }
}
