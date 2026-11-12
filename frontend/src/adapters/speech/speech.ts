// ACT-15 voice. Output speaks confirmations (NFR-06) and says nothing when no voice
// exists for the language: the screen still shows everything (FR-34). Input records
// speech for the online assistant, or transcribes on the phone when offline.
import * as Speech from 'expo-speech';
import { AudioModule, RecordingPresets, createAudioPlayer, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { ISpeechInput, ISpeechOutput, RecordedSpeech } from '@tpay/shared/application/ports/device';
import type { Language } from '@tpay/shared/contracts/statuses';
import { readYesNo } from '../../features/assistant/yesNo';
import { WAKE_HINTS, afterWakeWord } from '../../features/assistant/wakeWord';
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
// The person said something, then nothing new for this long: they have finished.
const QUIET_AFTER_WORDS_MS = 1_400;
// After asking the recogniser to stop, how long to wait for its last words before answering anyway.
const STOP_GRACE_MS = 600;

/** A natural voice from the server: a base64 clip (WAV or MP3), or null when it can't be had. */
export type CloudVoice = (text: string, language: Language) => Promise<{ audioBase64: string; audioMimeType: string } | null>;

// The natural voice (ElevenLabs, through the server) is what the assistant sounds like. A sentence
// takes about a second to make, so it is waited for this long; on a slow network the phone's own
// voice reads it instead, and the natural clip is still saved for the next time it is said.
const NATURAL_WAIT_MS = 2_500;
// For a language the phone has no voice for (usually Yoruba, Igbo and Hausa) the server's voice is
// the only one, so it is worth waiting longer for.
const CLOUD_WAIT_MS = 8_000;
// Clips are kept on the phone between launches: the same sentence is never made (or paid for) twice.
const CACHE_LIMIT = 200;
const CLIP_DIR = 'tpay-voice';
// A reply is a sentence. If playback never reports back, carry on after this.
const MAX_SPEECH_MS = 25_000;

type Player = ReturnType<typeof createAudioPlayer>;

export class ExpoSpeechOutput implements ISpeechOutput {
  private voices: Promise<string[]> | null = null;
  private readonly making = new Map<string, Promise<string | null>>();
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

  private folder(): Directory | null {
    try {
      const dir = new Directory(Paths.document, CLIP_DIR);
      if (!dir.exists) dir.create({ intermediates: true });
      return dir;
    } catch {
      return null;
    }
  }

  /** The saved clip for this exact sentence, or null. */
  private savedClip(text: string, language: Language): string | null {
    const dir = this.folder();
    if (!dir) return null;
    const name = clipName(text, language);
    for (const ext of ['mp3', 'wav']) {
      try { const file = new File(dir, `${name}.${ext}`); if (file.exists) return file.uri; } catch { /* not saved */ }
    }
    return null;
  }

  /** Makes the clip once, even when asked for twice at the same time, and saves it. */
  private clipFor(text: string, language: Language): Promise<string | null> {
    const key = clipName(text, language);
    const pending = this.making.get(key);
    if (pending) return pending;
    const made = (async () => {
      const clip = await this.cloud?.(text, language);
      const dir = this.folder();
      if (!clip || !dir) return null;
      const entries = dir.list();
      if (entries.length >= CACHE_LIMIT) {
        // Oldest first, a quarter at a time, so the folder never grows without end.
        const files = entries.filter((e): e is File => e instanceof File)
          .sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
        files.slice(0, Math.ceil(CACHE_LIMIT / 4)).forEach(f => { try { f.delete(); } catch { /* gone already */ } });
      }
      const file = new File(dir, `${key}.${clip.audioMimeType === 'audio/mpeg' ? 'mp3' : 'wav'}`);
      file.create({ overwrite: true });
      file.write(base64ToBytes(clip.audioBase64));
      return file.uri;
    })().catch(() => null).finally(() => { this.making.delete(key); });
    this.making.set(key, made);
    return made;
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
      // The assistant speaks in the natural voice. A sentence already said is played from the phone
      // at once; a new one is waited for briefly, and read by the phone's voice if it is slow.
      if (natural && this.cloud && Platform.OS !== 'web') {
        const saved = this.savedClip(text, language);
        if (saved) { await this.play(saved); return; }
        const uri = await Promise.race([
          this.clipFor(text, language),
          new Promise<null>(resolve => setTimeout(() => resolve(null), phoneVoice ? NATURAL_WAIT_MS : CLOUD_WAIT_MS)),
        ]);
        if (turn !== this.turn) return; // something newer is being said
        if (uri) { await this.play(uri); return; }
        if (!phoneVoice) return;
      }
      if (!phoneVoice) return;
      await this.talk(done => Speech.speak(text, { language: VOICE[language], rate: 0.9, onDone: done, onStopped: done, onError: done }));
    } catch (e) {
      console.warn('Speech output failed', e);
    }
  }
}

/** A short, stable file name for a sentence (FNV-1a, twice, for 64 bits). */
function clipName(text: string, language: Language): string {
  const value = `${language}|${text}`;
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ value.length;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(36)}${b.toString(36)}`;
}

type Recorder = InstanceType<typeof AudioModule.AudioRecorder>;
type Recogniser = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;

// After "Hey T-Pay", how long to wait for the rest of the request before acting on it.
const WAKE_SETTLE_MS = 1_200;
// Only "Hey T-Pay" with nothing after it: answer quickly, the person is waiting.
const WAKE_ALONE_MS = 700;
// Most phones stop listening after a few quiet seconds, even when asked to keep going. That is
// normal: listening simply starts again at once.
const WAKE_RESTART_MS = 250;
// A real error, or a session that ends almost as soon as it starts, is retried less and less
// often (so a broken recogniser doesn't restart, and on some phones beep, every moment), but
// never given up on: after a minute or so it is tried again.
const WAKE_RETRY_MS = 500;
const WAKE_MAX_BACKOFF_MS = 60_000;
const WAKE_INSTANT_END_MS = 1_500;
// Silence, not a fault.
const WAKE_QUIET = ['no-speech', 'speech-timeout', 'aborted'];
// The phone said no for good: no microphone permission.
const WAKE_FATAL = ['not-allowed', 'service-not-allowed'];
const wakeLog = (...args: unknown[]) => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[wake]', ...args); };

export class ExpoSpeechInput implements ISpeechInput {
  private recorder: Recorder | null = null;
  private finish: (() => void) | null = null;
  /** Ends the current "Hey T-Pay" session, if one is running; resolves once the recogniser is free. */
  private haltWake: (() => Promise<void>) | null = null;
  /** The recogniser said the English speech pack isn't on the phone yet. */
  private wakePackMissing = false;
  private wakeWatchers = new Set<() => void>();

  /** Called whenever what wakeWordStatus() would say may have changed. */
  onWakeWordStatus(watch: () => void): () => void {
    this.wakeWatchers.add(watch);
    return () => { this.wakeWatchers.delete(watch); };
  }

  /** Whether this phone can listen for "Hey T-Pay" at all. */
  async canWakeWord(): Promise<boolean> {
    try {
      const module = require('expo-speech-recognition').ExpoSpeechRecognitionModule as Recogniser;
      return module.isRecognitionAvailable();
    } catch {
      return false;
    }
  }

  /**
   * True when "Hey T-Pay" is heard on the phone itself. Otherwise the phone's normal recogniser is
   * used, which sends what the microphone hears to the phone's speech service while the app is open.
   */
  wakeWordOnDevice(): boolean {
    if (this.wakePackMissing) return false;
    try {
      const module = require('expo-speech-recognition').ExpoSpeechRecognitionModule as Recogniser;
      return module.supportsOnDeviceRecognition();
    } catch {
      return false;
    }
  }

  /**
   * 'ready', 'download' when the phone can do it once its English speech pack is downloaded, or
   * 'unsupported'. Phones that don't report their installed packs count as ready until the
   * recogniser itself says the pack is missing.
   */
  async wakeWordStatus(): Promise<'ready' | 'download' | 'unsupported'> {
    if (!(await this.canWakeWord())) return 'unsupported';
    if (this.wakePackMissing) return 'download';
    if (!this.wakeWordOnDevice()) return 'ready';
    try {
      const module = require('expo-speech-recognition').ExpoSpeechRecognitionModule as Recogniser;
      const { installedLocales } = await module.getSupportedLocales({ androidRecognitionServicePackage: 'com.google.android.as' });
      if (installedLocales.length && !installedLocales.some(l => l.toLowerCase().startsWith('en'))) return 'download';
    } catch { /* not reported on this phone */ }
    return 'ready';
  }

  /** Asks Android to download the English speech pack. True once it is there or on its way. */
  async downloadWakeWordPack(): Promise<boolean> {
    try {
      const module = require('expo-speech-recognition').ExpoSpeechRecognitionModule as Recogniser;
      await module.androidTriggerOfflineModelDownload({ locale: 'en-US' });
      this.wakePackMissing = false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Listens on the phone for "Hey T-Pay" until the returned function is called, restarting whenever
   * the recogniser stops by itself. `onWake` gets what was said after the name, or '' when the person
   * only called it. It stops listening before calling `onWake`.
   */
  startWakeWord(onWake: (rest: string) => void): () => void {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const run = async () => {
      if (stopped) return;
      if (!(await this.canWakeWord())) { wakeLog('no recogniser on this phone'); return; }
      const module = await this.recogniser();
      if (!module || stopped) { wakeLog('no microphone permission'); return; }
      const onDevice = this.wakeWordOnDevice();

      const finals: string[] = [];
      let interim = '';
      let rest: string | null = null;
      let settle: ReturnType<typeof setTimeout> | undefined;
      let ended = false;
      let release: () => void = () => undefined;
      const free = new Promise<void>(resolve => { release = resolve; });
      const startedAt = Date.now();

      // `fault` is a real error. A quiet end is normal and starts again at once.
      const end = (again: boolean, fault = false) => {
        if (ended) return;
        ended = true;
        clearTimeout(settle);
        subs.forEach(x => x.remove());
        this.haltWake = null;
        const instant = Date.now() - startedAt < WAKE_INSTANT_END_MS;
        failures = fault || instant ? failures + 1 : 0;
        if (!again || stopped) return;
        const wait = failures ? Math.min(WAKE_RETRY_MS * 2 ** (failures - 1), WAKE_MAX_BACKOFF_MS) : WAKE_RESTART_MS;
        retry = setTimeout(() => { void run(); }, wait);
      };
      const halt = () => {
        if (!ended) { try { module.stop(); } catch { /* already stopped */ } end(false); }
        // The recogniser is free once it reports the end, or after a short wait on phones that don't.
        return Promise.race([free, new Promise<void>(r => setTimeout(r, STOP_GRACE_MS))]);
      };
      const subs = [
        module.addListener('result', e => {
          const said = e.results[0]?.transcript ?? '';
          if (e.isFinal) { if (said.trim()) finals.push(said.trim()); finals.splice(0, Math.max(0, finals.length - 2)); interim = ''; } else interim = said;
          wakeLog(e.isFinal ? 'final' : 'heard', said);
          // The last two pieces are enough: "hey" and "T-Pay" can land in different ones. The newest
          // piece on its own is checked too, so "T-Pay, collect two thousand" counts when it starts one.
          const latest = interim || finals[finals.length - 1] || '';
          const heard = afterWakeWord([...finals, interim].join(' ')) ?? afterWakeWord(latest, { alone: true });
          if (heard === null) return;
          rest = heard;
          clearTimeout(settle);
          settle = setTimeout(() => {
            wakeLog('woke with', JSON.stringify(rest));
            void halt().then(() => { if (!stopped) onWake(rest ?? ''); });
          }, rest ? WAKE_SETTLE_MS : WAKE_ALONE_MS);
        }),
        module.addListener('error', e => {
          wakeLog('error', e.error, e.message);
          if (e.error === 'language-not-supported' && onDevice) {
            // No English pack on the phone yet: offer the download, and listen the normal way meanwhile.
            this.wakePackMissing = true;
            this.wakeWatchers.forEach(w => w());
            end(true);
            return;
          }
          if (WAKE_FATAL.includes(e.error)) { stopped = true; end(false); release(); return; }
          end(true, !WAKE_QUIET.includes(e.error));
        }),
        module.addListener('end', () => { release(); end(true); }),
      ];
      this.haltWake = halt;
      wakeLog('listening', onDevice ? 'on the phone' : 'with the speech service', 'after', failures, 'failures');
      try {
        module.start({
          lang: 'en-US', interimResults: true, continuous: true, maxAlternatives: 1,
          requiresOnDeviceRecognition: onDevice, contextualStrings: WAKE_HINTS,
          androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 60_000, EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 60_000 },
        });
      } catch (e) {
        wakeLog('could not start', e);
        end(true, true);
      }
    };

    void run();
    return () => {
      stopped = true;
      clearTimeout(retry);
      void this.haltWake?.();
    };
  }

  async canRecord(): Promise<boolean> {
    return (await requestRecordingPermissionsAsync()).granted;
  }

  /** Records until stop() is called, or for at most 30 seconds. */
  async record(): Promise<RecordedSpeech> {
    if (!(await this.canRecord())) throw new Error('MICROPHONE_DENIED');
    await this.haltWake?.();
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
    const heard = await this.listen(ANSWER_LOCALE[language], { maxMs: LISTEN_FOR_ANSWER_MS, done: text => readYesNo(text) !== null });
    return heard ? readYesNo(heard) : null;
  }

  /** Listens for one short phrase, such as an amount, and returns what was heard, or null. */
  async listenPhrase(language: Language, complete?: (text: string) => boolean): Promise<string | null> {
    return this.listen(ANSWER_LOCALE[language], { maxMs: LISTEN_FOR_ANSWER_MS, settle: complete });
  }

  /**
   * English and Pidgin: the phone's own recogniser turns speech into words while the person is still
   * talking, so the assistant gets text, which is far quicker than sending audio. Null when this
   * phone can't, so audio is sent instead; `text` is null when it listened and heard nothing.
   * `complete` says when the words so far make a whole request, so listening can end at once.
   */
  async transcribeLive(language: Language, complete?: (text: string) => boolean): Promise<{ text: string | null } | null> {
    if (language !== 'en' && language !== 'pcm') return null;
    if (!(await this.recogniser())) return null;
    return { text: await this.listen(ANSWER_LOCALE[language], { maxMs: LIVE_SENTENCE_MS, settle: complete }) };
  }

  /**
   * With no network. Null when this phone can't recognise the language at all (the screen then offers
   * typing); `text` is null when it listened and heard nothing. Uses the on-device recogniser when the
   * phone says it has one, and otherwise the normal one, which works offline on most phones that have
   * downloaded the language.
   */
  async transcribeOffline(language: Language, complete?: (text: string) => boolean): Promise<{ text: string | null } | null> {
    const locale = OFFLINE_LOCALE[language];
    const module = locale ? await this.recogniser() : null;
    if (!module || !locale) return null;
    let onDevice = false;
    try { onDevice = module.supportsOnDeviceRecognition(); } catch { /* older phones */ }
    const failed = { value: false };
    const text = await this.listen(locale, { maxMs: LIVE_SENTENCE_MS, settle: complete, onDevice, failed });
    return failed.value && !text ? null : { text };
  }

  private async recogniser(): Promise<Recogniser | null> {
    try {
      const module = require('expo-speech-recognition').ExpoSpeechRecognitionModule as Recogniser;
      if (!module.isRecognitionAvailable()) return null;
      return (await module.requestPermissionsAsync()).granted ? module : null;
    } catch {
      return null;
    }
  }

  /**
   * Listens until the person is done, and returns everything they said, or null for nothing. It keeps
   * listening through a pause, so "collect... two thousand" arrives whole. It ends when stop() is
   * called (the finger lifts), a moment after `settle` says the words make a whole request, after a
   * short quiet once they started talking, when `done` is satisfied, or at `maxMs`.
   */
  private async listen(lang: string, options: {
    maxMs: number; settle?: (text: string) => boolean; done?: (text: string) => boolean;
    onDevice?: boolean; failed?: { value: boolean };
  }): Promise<string | null> {
    await this.haltWake?.();
    const module = await this.recogniser();
    if (!module) { if (options.failed) options.failed.value = true; return null; }
    return new Promise<string | null>(resolve => {
      const finals: string[] = [];
      let interim = '';
      let settled = false;
      let stopping = false;
      const text = () => [...finals, interim].join(' ').replace(/\s+/g, ' ').trim();
      const timers: ReturnType<typeof setTimeout>[] = [];
      const clear = () => { while (timers.length) clearTimeout(timers.pop()); };
      const finish = () => { if (settled) return; settled = true; clear(); clearTimeout(cap); clearTimeout(noSpeech); subs.forEach(x => x.remove()); resolve(text() || null); };
      const stop = () => { if (stopping) return; stopping = true; try { module.stop(); } catch { /* already stopped */ } setTimeout(finish, STOP_GRACE_MS); };
      const cap = setTimeout(stop, options.maxMs);
      const noSpeech = setTimeout(() => { if (!text()) stop(); }, WAIT_FOR_SPEECH_MS);
      const subs = [
        module.addListener('result', e => {
          const said = e.results[0]?.transcript ?? '';
          if (e.isFinal) { if (said.trim()) finals.push(said.trim()); interim = ''; } else interim = said;
          const now = text();
          if (!now) return;
          clear();
          if (options.done?.(now)) { stop(); return; }
          timers.push(setTimeout(stop, options.settle?.(now) ? SETTLE_AFTER_COMPLETE_MS : QUIET_AFTER_WORDS_MS));
        }),
        module.addListener('error', e => {
          // "no-speech" and "speech-timeout" just mean silence; anything else means it can't listen here.
          if (options.failed && e.error !== 'no-speech' && e.error !== 'speech-timeout' && e.error !== 'aborted') options.failed.value = true;
          finish();
        }),
        module.addListener('end', finish),
      ];
      this.finish = stop;
      module.start({
        lang, interimResults: true, continuous: true, maxAlternatives: 1,
        requiresOnDeviceRecognition: options.onDevice ?? false,
        androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500, EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2500 },
      });
    });
  }
}
