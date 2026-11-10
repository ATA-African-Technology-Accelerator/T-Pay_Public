import type { ITextToSpeechPort } from '../../application/ports/AssistantPorts';

export class WebSpeechSynthesisAdapter implements ITextToSpeechPort {
  public async speak(text: string, language: string = 'en'): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Select localized voice if available
      const voices = window.speechSynthesis.getVoices();
      const ngVoice = voices.find(
        (v) => v.lang.includes('NG') || v.name.includes('Nigeria') || v.name.includes('African')
      );
      if (ngVoice) {
        utterance.voice = ngVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[WebSpeechSynthesisAdapter] Speech synthesis warning:', e);
    }
  }

  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}
