// ACT-15 voice. Output speaks confirmations (NFR-06) and says nothing when no voice
// exists for the language: the screen still shows everything (FR-34). Input records
// speech for the online assistant, or transcribes on the phone when offline.
import * as Speech from 'expo-speech';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import type { ISpeechInput, ISpeechOutput, RecordedSpeech } from '@tpay/shared/application/ports/device';
import type { Language } from '@tpay/shared/contracts/statuses';
import { bytesToBase64 } from '../crypto/encoding';

// Pidgin has no voice of its own; Nigerian English reads it best.
const VOICE: Record<Language, string> = { en: 'en-NG', pcm: 'en-NG', yo: 'yo-NG', ig: 'ig-NG', ha: 'ha-NG' };
// On-device recognisers ship for English only on most Android phones.
const OFFLINE_LOCALE: Partial<Record<Language, string>> = { en: 'en-US', pcm: 'en-US' };
const MAX_RECORDING_MS = 30_000;

export class ExpoSpeechOutput implements ISpeechOutput {
  private voices: Promise<string[]> | null = null;

  async isAvailable(language: Language): Promise<boolean> {
    this.voices ??= Speech.getAvailableVoicesAsync().then(v => v.map(x => x.language.toLowerCase())).catch(() => []);
    const want = VOICE[language].toLowerCase();
    const prefix = want.split('-')[0] as string;
    const have = await this.voices;
    // An English phone voice is always fine for English and Pidgin.
    return have.some(l => l === want || l.startsWith(`${prefix}-`) || l === prefix) || (prefix === 'en' && Platform.OS !== 'web');
  }

  async speak(text: string, language: Language): Promise<void> {
    try {
      if (!(await this.isAvailable(language))) return;
      Speech.stop();
      Speech.speak(text, { language: VOICE[language], rate: 0.9 });
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
      extension: preset.extension, sampleRate: 16_000, numberOfChannels: 1, bitRate: 32_000, isMeteringEnabled: false,
      ...(Platform.OS === 'android' ? preset.android : Platform.OS === 'ios' ? preset.ios : preset.web),
    } as never);
    this.recorder = recorder;
    await recorder.prepareToRecordAsync();
    recorder.record();
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, MAX_RECORDING_MS);
      this.finish = () => { clearTimeout(timer); resolve(); };
    });
    await recorder.stop();
    this.recorder = null;
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    if (!recorder.uri) throw new Error('NO_RECORDING');
    const file = new File(recorder.uri);
    const audioBase64 = bytesToBase64(await file.bytes());
    try { file.delete(); } catch { /* the cache is cleared anyway */ }
    return { audioBase64, audioMimeType: 'audio/mp4' };
  }

  stop(): void {
    this.finish?.();
    this.finish = null;
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
