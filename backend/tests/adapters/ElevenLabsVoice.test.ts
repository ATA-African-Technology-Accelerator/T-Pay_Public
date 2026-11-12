import { describe, expect, it, vi } from 'vitest';
import { ElevenLabsVoice } from '../../src/adapters/ai/ElevenLabsVoice';
import type { IAssistantModel } from '../../src/services/ports';

const geminiClip = { audioBase64: 'd2F2', audioMimeType: 'audio/wav' as const };
const fallback = (): IAssistantModel => ({ interpret: vi.fn(async () => ({ intent: 'UNKNOWN' })), speak: vi.fn(async () => geminiClip) });
const mp3 = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
const keys = { apiKey: 'test-key', voiceId: 'voice-1' };

describe('ElevenLabsVoice', () => {
  it('reads English in the ElevenLabs voice, as MP3', async () => {
    const fetcher = vi.fn(async () => mp3());
    const voice = new ElevenLabsVoice(keys, fallback(), fetcher as unknown as typeof fetch);
    const clip = await voice.speak({ text: 'You wan collect one thousand naira?', language: 'pcm' });
    expect(clip).toEqual({ audioBase64: Buffer.from([1, 2, 3]).toString('base64'), audioMimeType: 'audio/mpeg' });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/text-to-speech/voice-1');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('test-key');
    expect(JSON.parse(init.body as string)).toMatchObject({ text: 'You wan collect one thousand naira?', model_id: 'eleven_flash_v2_5' });
  });

  it('keeps the other voice for Yoruba, Igbo and Hausa', async () => {
    const fetcher = vi.fn(async () => mp3());
    const other = fallback();
    const clip = await new ElevenLabsVoice(keys, other, fetcher as unknown as typeof fetch).speak({ text: 'Ẹ káàbọ̀', language: 'yo' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(clip).toBe(geminiClip);
  });

  it('falls back when ElevenLabs fails or is not set up', async () => {
    const failing = vi.fn(async () => new Response('busy', { status: 429 }));
    expect(await new ElevenLabsVoice(keys, fallback(), failing as unknown as typeof fetch).speak({ text: 'Hi', language: 'en' })).toBe(geminiClip);
    const unused = vi.fn();
    expect(await new ElevenLabsVoice({ apiKey: undefined, voiceId: 'v' }, fallback(), unused as unknown as typeof fetch).speak({ text: 'Hi', language: 'en' })).toBe(geminiClip);
    expect(unused).not.toHaveBeenCalled();
  });

  it('uses Liam when the configured voice needs a paid plan, and stops asking for it', async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes('/library-voice') ? new Response('{}', { status: 402 }) : mp3()));
    const voice = new ElevenLabsVoice({ apiKey: 'k', voiceId: 'library-voice' }, fallback(), fetcher as unknown as typeof fetch);
    expect((await voice.speak({ text: 'One', language: 'en' })).audioMimeType).toBe('audio/mpeg');
    await voice.speak({ text: 'Two', language: 'en' });
    const urls = fetcher.mock.calls.map(c => String(c[0]));
    expect(urls.filter(u => u.includes('/library-voice'))).toHaveLength(1);
    expect(urls.filter(u => u.includes('/TX3LPaxmHKxFdv7VOQHJ'))).toHaveLength(2);
  });

  it('reads a repeated sentence only once', async () => {
    const fetcher = vi.fn(async () => mp3());
    const voice = new ElevenLabsVoice(keys, fallback(), fetcher as unknown as typeof fetch);
    await voice.speak({ text: 'Say yes or no.', language: 'en' });
    await voice.speak({ text: 'Say yes or no.', language: 'en' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('leaves understanding requests to the other model', async () => {
    const other = fallback();
    await new ElevenLabsVoice(keys, other).interpret({ input: { kind: 'text', text: 'pay 2k' }, language: 'en' });
    expect(other.interpret).toHaveBeenCalled();
  });
});
