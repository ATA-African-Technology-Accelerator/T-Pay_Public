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
// A whole request, such as "collect two thousand five hundred naira".
const LIVE_SENTENCE_MS = 15_000;
// The phone's recogniser is asked for the person's own language; it simply hears nothing if it has none.
const ANSWER_LOCALE: Record<Language, string> = { en: 'en-NG', pcm: 'en-NG', yo: 'yo-NG', ig: 'ig-NG', ha: 'ha-NG' };
// Metering is in decibels, from very quiet (-160) up to 0. Talking near the phone is well above this.
const SPEECH_DB = -38;
// Long enough for a breath between words, short enough that the answer doesn't feel late.
const QUIET_AFTER_SPEECH_MS = 900;
const WAIT_FOR_SPEECH_MS = 7_000;
const METER_EVERY_MS = 150;
// A whole request has been heard and nothing new for this long: stop listening and answer.
const SETTLE_AFTER_COMPLETE_MS = 700;

/** A natural voice from the server: a base64 WAV clip, or null when it can't be had. */
export type CloudVoice = (text: string, language: Language) => Promise<string | null>;

// Only for a language the phone has no voice for (usually Yoruba, Igbo and Hausa): there the
// server's voice is the only one, so it is worth waiting for. Anywhere else the phone speaks at once.
const CLOUD_WAIT_MS = 8_000;
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

  /**
   * Starts the phone's voice engine in the background. The first time it is used it takes a few
   * seconds to connect (measured: about four on an emulator), which would otherwise be added to
   * the first reply. Asking for its voices connects it.
   */
  warmUp(): void {
    void this.isAvailable('en');
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
      const phoneVoice = await this.isAvailable(language);
      if (turn !== this.turn) return;
      // Speed first: a reply starts the moment it is ready. The server's natural voice takes
      // seconds to make, so it is used only when it is already saved for this exact sentence,
      // or when the phone has no voice for the language at all.
      const cached = this.clips.get(`${language}|${text}`);
      if (natural && cached) { await this.play(cached); return; }
      if (natural && !phoneVoice && this.cloud && Platform.OS !== 'web') {
        const uri = await Promise.race([
          this.clipFor(text, language).catch(() => null),
          new Promise<null>(resolve => setTimeout(() => resolve(null), CLOUD_WAIT_MS)),
        ]);
        if (turn !== this.turn) return; // something newer is being said
        if (uri) await this.play(uri);
        return;
      }
      if (!phoneVoice) return;
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
    return this.listenShort(language, readYesNo);
  }

  /** Listens for one short phrase, such as an amount, and returns what was heard, or null. */
  async listenPhrase(language: Language): Promise<string | null> {
    return this.listenShort(language, text => (text.trim() ? text.trim() : null), false);
  }

  /**
   * English only: the phone's own recogniser, online, turns speech into text while the person is
   * still talking, so the assistant gets a few words instead of an audio file. That is much quicker
   * for the model to read. Null when this phone can't, so audio is sent instead; `text` is null
   * when it listened and heard nothing.
   */
  async transcribeLive(language: Language, complete?: (text: string) => boolean): Promise<{ text: string | null } | null> {
    if (language !== 'en') return null;
    try {
      const module = require('expo-speech-recognition').ExpoSpeechRecognitionModule as typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
      if (!module.isRecognitionAvailable() || !(await module.requestPermissionsAsync()).granted) return null;
    } catch {
      return null;
    }
    return { text: await this.listenShort(language, text => (text.trim() ? text.trim() : null), false, LIVE_SENTENCE_MS, complete) };
  }

  /**
   * The phone's recogniser for a few seconds. `read` turns what was heard into an answer; with
   * `early`, it stops as soon as one is found instead of waiting for the end of the phrase.
   * With `complete`, it stops a moment after the words heard so far make a whole request, instead
   * of waiting for the phone to decide the person has finished (often a second or two of silence).
   */
  private async listenShort<A>(
    language: Language, read: (text: string) => A | null, early = true, maxMs = LISTEN_FOR_ANSWER_MS,
    complete?: (text: string) => boolean,
  ): Promise<A | null> {
    let module: typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
    try {
      module = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
      if (!module.isRecognitionAvailable()) return null;
      if (!(await module.requestPermissionsAsync()).granted) return null;
    } catch {
      return null;
    }
    return new Promise<A | null>(resolve => {
      let answer: A | null = null;
      let settled = false;
      let settle: ReturnType<typeof setTimeout> | undefined;
      const done = () => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(settle); subs.forEach(x => x.remove()); resolve(answer); };
      const timer = setTimeout(() => { module.stop(); done(); }, maxMs);
      const subs = [
        module.addListener('result', e => {
          const heard = e.results[0]?.transcript ?? '';
          answer = read(heard) ?? answer;
          if ((early && answer) || e.isFinal) { module.stop(); return; }
          // More words push the stop back, so "collect two thousand five hundred" isn't cut at "two thousand".
          clearTimeout(settle);
          if (complete?.(heard)) settle = setTimeout(() => { module.stop(); done(); }, SETTLE_AFTER_COMPLETE_MS);
        }),
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
