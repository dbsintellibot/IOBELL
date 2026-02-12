
import { supabase } from './supabase';

export async function generateSecureTTS(
  text: string,
  model: string = 'tts-1',
  voice: string = 'alloy'
): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('generate-speech', {
    body: { text, model, voice },
    responseType: 'blob',
  })

  if (error) {
    throw new Error(error.message || 'Failed to generate speech via secure endpoint')
  }

  if (!(data instanceof Blob)) {
     throw new Error('Invalid response from secure endpoint')
  }
  
  return data;
}

export async function generateTTS(
  text: string, 
  apiKey: string, 
  baseUrl: string = 'https://api.openai.com/v1',
  model: string = 'tts-1'
): Promise<Blob> {
  // Ensure baseUrl doesn't end with slash
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const url = `${cleanBaseUrl}/audio/speech`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      input: text,
      voice: 'alloy',
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to generate speech');
  }

  return await response.blob();
}
