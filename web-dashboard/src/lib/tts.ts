import { supabase } from './supabase';

export async function generateSecureTTS(
  provider: string,
  text: string,
  settings: any = {}
): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('generate-speech', {
    body: { provider, text, settings },
    // @ts-expect-error - responseType is valid but missing in types
    responseType: 'blob',
  })

  if (error) {
    let detailMsg = error.message;

    // Attempt to extract detailed error message from response context body
    if ((error as any).context && typeof (error as any).context.text === 'function') {
      try {
        const bodyText = await (error as any).context.text();
        const parsed = JSON.parse(bodyText);
        if (parsed?.error) detailMsg = parsed.error;
      } catch (_) {
        // preserve default message
      }
    }

    // If a custom provider (e.g. openai) failed, automatically fallback to google-free
    if (provider !== 'google-free') {
      console.warn(`Provider ${provider} failed (${detailMsg}). Falling back to Google Free TTS...`);
      return generateSecureTTS('google-free', text, settings);
    }

    throw new Error(detailMsg || `Failed to generate speech via secure endpoint for ${provider}`)
  }

  if (data instanceof Blob) {
    return data;
  } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return new Blob([data as BlobPart], { type: 'audio/mpeg' });
  }

  throw new Error('Invalid response from secure endpoint');
}

export async function generateTTS(
  text: string, 
  _apiKey: string, // Kept for signature compatibility, but ignored
  baseUrl: string = 'https://api.openai.com/v1',
  model: string = 'tts-1',
  voice: string = 'alloy'
): Promise<Blob> {
  return generateSecureTTS('openai', text, { baseUrl, model, voice });
}

export async function generateTopMediaiTTS(
  text: string,
  _apiKey: string, // Ignored
  speaker: string = '00151554-3826-11ee-a861-00163e2ac61b',
  emotion: string = 'Neutral'
): Promise<Blob> {
  return generateSecureTTS('topmediai', text, { speaker, emotion });
}

export async function generateCambAITTS(
  text: string,
  _apiKey: string, // Ignored
  voiceId: number = 147320,
  language: number = 1,
  gender: number = 1,
  age: number = 30
): Promise<Blob> {
  return generateSecureTTS('cambai', text, { voiceId, language, gender, age });
}

export async function generateElevenLabsTTS(
  text: string,
  _apiKey: string, // Ignored
  voiceId: string = '21m00Tcm4TlvDq8ikWAM',
  modelId: string = 'eleven_monolingual_v1'
): Promise<Blob> {
  return generateSecureTTS('elevenlabs', text, { voiceId, modelId });
}

export async function generateGoogleFreeTTS(
  text: string,
  language: string = 'en',
  gender: string = 'female'
): Promise<Blob> {
  return generateSecureTTS('google-free', text, { language, gender });
}
