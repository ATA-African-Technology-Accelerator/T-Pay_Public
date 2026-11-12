import type { Language } from '@tpay/shared/contracts/statuses';
import { ApiError } from '../../services/ApiError';
import type { AssistantModelRequest, IAssistantModel, SpokenClip } from '../../services/ports';




// ElevenLabs reads the assistant's replies in a natural human voice. Flash is its quickest model
// (a short sentence comes back in well under a second), which matters more here than the last bit
// of polish: a reply that waits feels broken. It can be changed with ELEVENLABS_MODEL.
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_flash_v2_5';
const BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
// Small and quick to send to a phone on a slow network, and still clear for speech.
const OUTPUT_FORMAT = 'mp3_44100_64';
const TIMEOUT_MS = 8_000;
// ElevenLabs has English voices that read Nigerian Pidgin well. It has no Yoruba, Igbo or
// Hausa yet, so those keep the other voice.
const LANGUAGES: Language[] = ['en', 'pcm'];
// Liam, one of ElevenLabs' own voices, which every plan may use. Voices from its library need a
// paid plan through the API, so a library voice that is refused is replaced by this one.
export const DEFAULT_ELEVENLABS_VOICE = 'TX3LPaxmHKxFdv7VOQHJ';
const PAID_PLAN_REQUIRED = 402;
// Many replies repeat word for word ("Say yes or no", "Okay"). Each one read again costs quota,
// so the last few hundred are kept.
const CACHE_LIMIT = 300;


export interface ElevenLabsConfig {
  apiKey: string | undefined;
  /** Optional: Liam when unset. */
  voiceId?: string | undefined;
  model?: string;
}


/**
 * The assistant with ElevenLabs as its voice. Understanding requests stays with the other model,
 * and so does any language ElevenLabs can't speak, or any moment it can't be reached.
 */
export class ElevenLabsVoice implements IAssistantModel {
  private readonly clips = new Map<string, SpokenClip>();
  /** Set once the configured voice is refused for this plan, so it isn't asked for again. */
  private voiceRefused = false;

  constructor(
    private readonly config: ElevenLabsConfig,
    private readonly fallback: IAssistantModel,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public interpret(request: AssistantModelRequest): Promise<unknown> {
    return this.fallback.interpret(request);
  }

  public async speak(request: { text: string; language: Language }): Promise<SpokenClip> {
    const { apiKey } = this.config;
    if (!apiKey || !LANGUAGES.includes(request.language)) {
      return this.fallback.speak(request);
    }
    const voice = this.voiceRefused ? DEFAULT_ELEVENLABS_VOICE : this.config.voiceId || DEFAULT_ELEVENLABS_VOICE;
    const key = `${voice}|${request.text}`;
    const known = this.clips.get(key);
    if (known) return known;
    try {
      const clip = await this.elevenLabs(apiKey, voice, request.text).catch(async (error: unknown) => {
        if (!(error instanceof VoiceRefused) || voice === DEFAULT_ELEVENLABS_VOICE) throw error;
        this.voiceRefused = true;
        console.warn('ElevenLabs refused the configured voice on this plan; using Liam instead');
        return this.elevenLabs(apiKey, DEFAULT_ELEVENLABS_VOICE, request.text);
      });
      if (this.clips.size >= CACHE_LIMIT) this.clips.delete(this.clips.keys().next().value as string);
      this.clips.set(key, clip);
      return clip;
    } catch {
      // The phone also has its own voice, so a failure here never leaves the person without a reply.
      return this.fallback.speak(request);
    }
  }

  private async elevenLabs(apiKey: string, voiceId: string, text: string): Promise<SpokenClip> {
    const response = await this.fetcher(`${BASE_URL}/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: this.config.model ?? DEFAULT_ELEVENLABS_MODEL,
        // A calm, steady voice that still sounds like a person, not a reading machine.
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === PAID_PLAN_REQUIRED) {
      throw new VoiceRefused();
    }
    if (!response.ok) {
      throw new ApiError('AI_UNAVAILABLE', `ElevenLabs answered ${response.status}`);
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) {
      throw new ApiError('AI_UNAVAILABLE', 'ElevenLabs returned no audio');
    }
    return { audioBase64: audio.toString('base64'), audioMimeType: 'audio/mpeg' };
  }
}


class VoiceRefused extends Error {}
