import type { VoiceIntent } from '../../domain/value-objects/VoiceIntent';

export interface ISLMModelPort {
  parseSpokenIntent(spokenTranscript: string): Promise<VoiceIntent>;
  isOfflineCapable(): boolean;
}

export interface ITextToSpeechPort {
  speak(text: string, language?: string): Promise<void>;
  stop(): void;
}
