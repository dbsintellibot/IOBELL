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
    throw new Error(error.message || `Failed to generate speech via secure endpoint for ${provider}`)
  }

  if (!(data instanceof Blob)) {
     throw new Error('Invalid response from secure endpoint')
  }
  
  return data;
}

export async function generateTTS(
  text: string, 
  apiKey: string, // Kept for signature compatibility, but ignored
  baseUrl: string = 'https://api.openai.com/v1',
  model: string = 'tts-1',
  voice: string = 'alloy'
): Promise<Blob> {
  return generateSecureTTS('openai', text, { baseUrl, model, voice });
}

export async function generateTopMediaiTTS(
  text: string,
  apiKey: string, // Ignored
  speaker: string = '00151554-3826-11ee-a861-00163e2ac61b',
  emotion: string = 'Neutral'
): Promise<Blob> {
  return generateSecureTTS('topmediai', text, { speaker, emotion });
}

export async function generateCambAITTS(
  text: string,
  apiKey: string, // Ignored
  voiceId: number = 147320,
  language: number = 1,
  gender: number = 1,
  age: number = 30
): Promise<Blob> {
  return generateSecureTTS('cambai', text, { voiceId, language, gender, age });
}

export async function generateElevenLabsTTS(
  text: string,
  apiKey: string, // Ignored
  voiceId: string = '21m00Tcm4TlvDq8ikWAM',
  modelId: string = 'eleven_monolingual_v1'
): Promise<Blob> {
  return generateSecureTTS('elevenlabs', text, { voiceId, modelId });
}
