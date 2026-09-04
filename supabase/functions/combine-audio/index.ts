import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function detectMp3SampleRate(buffer: Uint8Array): number {
  let offset = 0;
  if (buffer.length >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const size = ((buffer[6] & 0x7F) << 21) |
                 ((buffer[7] & 0x7F) << 14) |
                 ((buffer[8] & 0x7F) << 7) |
                 (buffer[9] & 0x7F);
    offset = 10 + size;
    if ((buffer[5] & 0x10) !== 0) offset += 10;
  }

  const sampleRatesMpeg1 = [44100, 48000, 32000, 0];
  const sampleRatesMpeg2 = [22050, 24000, 16000, 0];
  const sampleRatesMpeg25 = [11025, 12000, 8000, 0];

  while (offset <= buffer.length - 4) {
    if (buffer[offset] === 0xFF && (buffer[offset + 1] & 0xE0) === 0xE0) {
      const b1 = buffer[offset + 1];
      const b2 = buffer[offset + 2];
      const mpegVer = (b1 >> 3) & 0x03;
      const layer = (b1 >> 1) & 0x03;
      if (layer === 1) { // Layer III
        const sampleRateIdx = (b2 >> 2) & 0x03;
        let sr = 44100;
        if (mpegVer === 3) sr = sampleRatesMpeg1[sampleRateIdx];
        else if (mpegVer === 2) sr = sampleRatesMpeg2[sampleRateIdx];
        else if (mpegVer === 0) sr = sampleRatesMpeg25[sampleRateIdx];
        if (sr > 0) return sr;
      }
    }
    offset++;
  }
  return 24000;
}

function generateMp3Silence(seconds: number, sampleRate = 24000): Uint8Array {
  let frameHeader: Uint8Array;
  let frameSize: number;
  let framesPerSec: number;

  if (sampleRate === 44100) {
    frameHeader = new Uint8Array([0xFF, 0xFB, 0x90, 0x64]); // 44.1kHz 128kbps stereo
    frameSize = 417;
    framesPerSec = 38;
  } else {
    frameHeader = new Uint8Array([0xFF, 0xF3, 0x84, 0x00]); // 24kHz 64kbps mono
    frameSize = 192;
    framesPerSec = 24000 / 576; // ~41.67 fps
  }

  const totalFrames = Math.max(1, Math.round(seconds * framesPerSec));
  const totalBytes = totalFrames * frameSize;

  const silenceBuffer = new Uint8Array(totalBytes);
  for (let i = 0; i < totalFrames; i++) {
    silenceBuffer.set(frameHeader, i * frameSize);
  }
  return silenceBuffer;
}

function parseCleanMp3Frames(buffer: Uint8Array): Uint8Array {
  let offset = 0;
  if (buffer.length >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const size = ((buffer[6] & 0x7F) << 21) |
                 ((buffer[7] & 0x7F) << 14) |
                 ((buffer[8] & 0x7F) << 7) |
                 (buffer[9] & 0x7F);
    offset = 10 + size;
    if ((buffer[5] & 0x10) !== 0) offset += 10;
  }

  const cleanFrames: Uint8Array[] = [];
  let totalBytes = 0;

  const bitratesMpeg1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const bitratesMpeg2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const sampleRatesMpeg1 = [44100, 48000, 32000, 0];
  const sampleRatesMpeg2 = [22050, 24000, 16000, 0];
  const sampleRatesMpeg25 = [11025, 12000, 8000, 0];

  while (offset <= buffer.length - 4) {
    if (buffer[offset] === 0xFF && (buffer[offset + 1] & 0xE0) === 0xE0) {
      const b1 = buffer[offset + 1];
      const b2 = buffer[offset + 2];

      const mpegVer = (b1 >> 3) & 0x03;
      const layer = (b1 >> 1) & 0x03;

      if (layer === 1) {
        const bitrateIdx = (b2 >> 4) & 0x0F;
        const sampleRateIdx = (b2 >> 2) & 0x03;
        const padding = (b2 >> 1) & 0x01;

        let bitrate = 0;
        let sampleRate = 0;
        let samplesPerFrame = 1152;

        if (mpegVer === 3) {
          bitrate = bitratesMpeg1[bitrateIdx] * 1000;
          sampleRate = sampleRatesMpeg1[sampleRateIdx];
          samplesPerFrame = 1152;
        } else if (mpegVer === 2 || mpegVer === 0) {
          bitrate = bitratesMpeg2[bitrateIdx] * 1000;
          sampleRate = mpegVer === 2 ? sampleRatesMpeg2[sampleRateIdx] : sampleRatesMpeg25[sampleRateIdx];
          samplesPerFrame = 576;
        }

        if (bitrate > 0 && sampleRate > 0) {
          const frameSize = Math.floor((samplesPerFrame * bitrate / 8) / sampleRate) + padding;
          if (frameSize > 0 && offset + frameSize <= buffer.length) {
            cleanFrames.push(buffer.subarray(offset, offset + frameSize));
            totalBytes += frameSize;
            offset += frameSize;
            continue;
          }
        }
      }
    }
    offset++;
  }

  if (totalBytes === 0) {
    return buffer;
  }

  const result = new Uint8Array(totalBytes);
  let writeOffset = 0;
  for (const frame of cleanFrames) {
    result.set(frame, writeOffset);
    writeOffset += frame.length;
  }
  return result;
}

// SSRF Security: Validate audio URLs against trusted origins only
function validateAudioUrl(targetUrl: string): string {
  let finalUrl = targetUrl.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hjlwzkwiweocnfztshmy.supabase.co';

  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/audio-files/${finalUrl}`;
  }

  try {
    const parsed = new URL(finalUrl);
    // Allow HTTPS protocols only
    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed for external audio fetching');
    }
    
    // Prevent internal network scanning / SSRF (localhost, 127.0.0.1, 169.254.169.254, internal IP ranges)
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '169.254.169.254' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.')
    ) {
      throw new Error('Access to private/internal network addresses is forbidden');
    }
  } catch (err: any) {
    throw new Error(`Invalid audio URL format or forbidden host: ${err.message}`);
  }

  return finalUrl;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let chimeUrl = url.searchParams.get('chime_url') || '';
    let audioUrl = url.searchParams.get('audio_url') || '';
    let delaySec = parseInt(url.searchParams.get('delay_sec') || '3');

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        chimeUrl = body.chime_url || chimeUrl;
        audioUrl = body.audio_url || audioUrl;
        delaySec = body.delay_sec ? parseInt(body.delay_sec) : delaySec;
      } catch (_) {}
    }

    if (delaySec < 2) delaySec = 2;
    if (delaySec > 5) delaySec = 5;

    if (!audioUrl) {
      return new Response(JSON.stringify({ error: 'audio_url is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const fetchAudioBytes = async (targetUrl: string): Promise<Uint8Array> => {
      const validatedUrl = validateAudioUrl(targetUrl);
      const res = await fetch(validatedUrl, {
        headers: {
          'User-Agent': 'AutoBell-AudioEngine/1.0'
        }
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch audio from source: ${res.statusText}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    };

    let chimeBytes: Uint8Array | null = null;
    if (chimeUrl) {
      try {
        chimeBytes = await fetchAudioBytes(chimeUrl);
      } catch (err) {
        console.warn('Could not fetch chime audio:', err);
      }
    }

    const mainAudioBytes = await fetchAudioBytes(audioUrl);

    const cleanChime = chimeBytes ? parseCleanMp3Frames(chimeBytes) : new Uint8Array(0);
    const cleanMain = parseCleanMp3Frames(mainAudioBytes);

    const chimeSr = cleanChime.length > 0 ? detectMp3SampleRate(cleanChime) : 0;
    const mainSr = cleanMain.length > 0 ? detectMp3SampleRate(cleanMain) : 24000;

    let combinedBuffer: Uint8Array;
    if (cleanChime.length > 0 && (chimeSr === mainSr || chimeSr === 0)) {
      const silenceSampleRate = chimeSr > 0 ? chimeSr : mainSr;
      const cleanSilence = generateMp3Silence(delaySec, silenceSampleRate);
      const totalLen = cleanChime.length + cleanSilence.length + cleanMain.length;
      combinedBuffer = new Uint8Array(totalLen);
      combinedBuffer.set(cleanChime, 0);
      combinedBuffer.set(cleanSilence, cleanChime.length);
      combinedBuffer.set(cleanMain, cleanChime.length + cleanSilence.length);
    } else {
      combinedBuffer = cleanMain;
    }

    return new Response(combinedBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Content-Length': combinedBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (err: any) {
    console.error('combine-audio error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
