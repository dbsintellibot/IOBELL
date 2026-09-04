
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

  if (data instanceof Blob) {
    return data;
  } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return new Blob([data as BlobPart], { type: 'audio/mpeg' });
  }

  throw new Error('Invalid response from secure endpoint');
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

export async function generateCambAITTS(
  text: string,
  apiKey: string,
  voiceId: number = 147320,
  languageId: number = 1,
  gender: number = 1,
  age: number = 30
): Promise<Blob> {
  const baseUrl = 'https://api.camb.ai';

  const taskRes = await fetch(`${baseUrl}/tts`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      target_language_id: languageId,
      gender,
      age,
    }),
  });

  if (!taskRes.ok) {
    const errorData = await taskRes.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to start Camb.ai TTS task');
  }

  const task = (await taskRes.json()) as { run_id?: string };
  const runId = task.run_id;

  if (!runId) {
    throw new Error('Invalid Camb.ai TTS response: missing run_id');
  }

  const start = Date.now();
  const timeoutMs = 60000;
  const pollIntervalMs = 2000;

  while (Date.now() - start < timeoutMs) {
    const statusRes = await fetch(`${baseUrl}/tts-status/${runId}`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!statusRes.ok) {
      throw new Error('Failed to check Camb.ai TTS status');
    }

    const status = (await statusRes.json()) as { status?: string };

    if (status.status === 'completed') {
      break;
    }

    if (status.status === 'failed') {
      throw new Error('Camb.ai TTS task failed');
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const audioRes = await fetch(`${baseUrl}/tts-result/${runId}`, {
    headers: { 'x-api-key': apiKey },
  });

  if (!audioRes.ok) {
    throw new Error('Failed to download Camb.ai audio');
  }

  return await audioRes.blob();
}

export async function generateElevenLabsTTS(
  text: string,
  apiKey: string,
  voiceId: string = '21m00Tcm4TlvDq8ikWAM',
  modelId: string = 'eleven_monolingual_v1'
): Promise<Blob> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail?.message || 'Failed to generate ElevenLabs speech');
  }

  return await response.blob();
}

export async function generateTopMediaiTTS(
  text: string,
  apiKey: string,
  speaker: string = '00151554-3826-11ee-a861-00163e2ac61b',
  emotion: string = 'Neutral'
): Promise<Blob> {
  const url = 'https://api.topmediai.com/v1/text2speech';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      speaker,
      emotion
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to generate speech via TopMediai');
  }

  return await response.blob();
}
