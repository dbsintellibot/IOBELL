import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getGcpAccessToken(serviceAccount: any): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: serviceAccount.private_key_id,
  };

  const claimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    exp: exp,
    iat: iat,
  };

  const base64url = (str: string) => {
    const bytes = new TextEncoder().encode(str);
    return btoa(String.fromCharCode(...bytes))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const unsignedJwt = base64url(JSON.stringify(header)) + "." + base64url(JSON.stringify(claimSet));

  const pem = serviceAccount.private_key;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem.substring(pem.indexOf(pemHeader) + pemHeader.length, pem.indexOf(pemFooter));
  const binaryDerString = atob(pemContents.replace(/\s/g, ""));
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = unsignedJwt + "." + signature;

  const res = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GCP OAuth failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function generateGcpTTS(
  text: string,
  voiceName: string,
  languageCode: string,
  serviceAccount: any
): Promise<Uint8Array | null> {
  try {
    const token = await getGcpAccessToken(serviceAccount);
    const url = "https://texttospeech.googleapis.com/v1/text:synthesize";
    const body = {
      input: { text },
      voice: { languageCode, name: voiceName },
      audioConfig: { audioEncoding: "MP3" },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`Google Cloud TTS API error: ${res.status} ${errText}`);
      return null;
    }

    const data = await res.json();
    if (data.audioContent) {
      const binaryString = atob(data.audioContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
  } catch (err: any) {
    console.warn(`Failed to generate Google Cloud TTS: ${err?.message || err}`);
  }
  return null;
}

/**
 * Detect sample rate and MPEG version from MP3 header
 */
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

/**
 * Detect channels (Mono = 1, Stereo/Joint Stereo = 2) from MP3 header
 */
function detectMp3Channels(buffer: Uint8Array): number {
  let offset = 0;
  if (buffer.length >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const size = ((buffer[6] & 0x7F) << 21) |
                 ((buffer[7] & 0x7F) << 14) |
                 ((buffer[8] & 0x7F) << 7) |
                 (buffer[9] & 0x7F);
    offset = 10 + size;
    if ((buffer[5] & 0x10) !== 0) offset += 10;
  }

  while (offset <= buffer.length - 4) {
    if (buffer[offset] === 0xFF && (buffer[offset + 1] & 0xE0) === 0xE0) {
      const b1 = buffer[offset + 1];
      const b2 = buffer[offset + 2];
      const b3 = buffer[offset + 3];
      const layer = (b1 >> 1) & 0x03;
      if (layer === 1) { // Layer III
        const channelModeIdx = (b3 >> 6) & 0x03;
        // Channel mode index: 0 = Stereo, 1 = Joint Stereo, 2 = Dual Channel, 3 = Mono
        return channelModeIdx === 3 ? 1 : 2;
      }
    }
    offset++;
  }
  return 2; // Default fallback to Stereo
}

/**
 * Generate valid silent MP3 bytes for N seconds matching target sample rate and channel count
 */
function generateMp3Silence(seconds: number, sampleRate = 44100, channels = 1): Uint8Array {
  let frameHeader: Uint8Array;
  let frameSize: number;
  let framesPerSec: number;

  if (sampleRate === 44100) {
    if (channels === 1) {
      frameHeader = new Uint8Array([0xFF, 0xFB, 0x50, 0xC0]); // 44.1kHz 64kbps mono
      frameSize = 208;
      framesPerSec = 44100 / 1152; // ~38.28 fps
    } else {
      frameHeader = new Uint8Array([0xFF, 0xFB, 0x90, 0x64]); // 44.1kHz 128kbps stereo
      frameSize = 417;
      framesPerSec = 44100 / 1152; // ~38.28 fps
    }
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

/**
 * Extract clean, valid MP3 frames from raw audio buffer, skipping ID3 headers and trailing garbage bytes.
 */
function parseCleanMp3Frames(buffer: Uint8Array): Uint8Array {
  let offset = 0;
  // 1. Skip ID3v2 header if present ("ID3" magic bytes 0x49, 0x44, 0x33)
  if (buffer.length >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const size = ((buffer[6] & 0x7F) << 21) |
                 ((buffer[7] & 0x7F) << 14) |
                 ((buffer[8] & 0x7F) << 7) |
                 (buffer[9] & 0x7F);
    offset = 10 + size;
    if ((buffer[5] & 0x10) !== 0) offset += 10; // Footer present
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

      const mpegVer = (b1 >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
      const layer = (b1 >> 1) & 0x03;   // 1=Layer III

      if (layer === 1) { // Layer III
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
    return buffer; // Fallback to raw buffer if frame parsing yields nothing
  }

  const result = new Uint8Array(totalBytes);
  let writeOffset = 0;
  for (const frame of cleanFrames) {
    result.set(frame, writeOffset);
    writeOffset += frame.length;
  }
  return result;
}

const fetchAudioWithUserAgent = async (targetUrl: string): Promise<Uint8Array> => {
  const res = await fetch(targetUrl.trim(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch audio from ${targetUrl}: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength < 100) {
    throw new Error(`Audio response too small (${arrayBuffer.byteLength} bytes) from ${targetUrl}`);
  }
  return new Uint8Array(arrayBuffer);
};

/**
 * Fetch real weather data from wttr.in for a given city.
 * Returns a human-readable weather string, or a fallback message on error.
 */
async function fetchWeatherText(city: string): Promise<string> {
  const location = city && city.trim().length > 0 ? city.trim() : 'Islamabad';
  try {
    const weatherUrl = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
    const res = await fetch(weatherUrl, {
      headers: { 'User-Agent': 'AutoBell-Server/1.0' }
    });
    if (!res.ok) {
      console.warn(`Weather API returned ${res.status} for ${location}`);
      return `Today's weather update for ${location}.`;
    }
    const data = await res.json();
    const current = data?.current_condition?.[0];
    if (!current) {
      return `Today's weather update for ${location}.`;
    }

    const tempC = current.temp_C || '--';
    const desc = current.weatherDesc?.[0]?.value || 'Unknown';
    const humidity = current.humidity || '--';
    const feelsLikeC = current.FeelsLikeC || tempC;

    return `Today's weather in ${location}: ${tempC} degrees Celsius, ${desc}, Humidity ${humidity} percent, Feels like ${feelsLikeC} degrees.`;
  } catch (err) {
    console.warn(`Weather fetch error for ${location}:`, err);
    return `Today's weather update for ${location}.`;
  }
}

/**
 * Detect whether text is predominantly Latin/English characters.
 */
function isLikelyEnglish(text: string): boolean {
  const alphaChars = text.replace(/[^a-zA-Z\u0600-\u06FF\u0750-\u077F]/g, '');
  if (alphaChars.length === 0) return false;
  const latinChars = alphaChars.replace(/[^a-zA-Z]/g, '');
  return latinChars.length / alphaChars.length > 0.6;
}

/**
 * Translate text via Google Translate free API.
 * Only translates if target language differs from source and text appears English.
 */
async function translateText(text: string, targetLang: string, sourceLang = 'en'): Promise<string> {
  if (!text.trim() || targetLang === sourceLang || targetLang === 'en') return text;
  if (!isLikelyEnglish(text)) return text; // Already in target script, skip

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      console.warn(`Translation API returned ${res.status}, using original text`);
      return text;
    }
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translated = data[0]
        .filter((seg: any) => Array.isArray(seg) && seg[0])
        .map((seg: any) => seg[0])
        .join('');
      if (translated.trim()) {
        console.log(`Translated to ${targetLang}: "${text.substring(0, 40)}..." → "${translated.substring(0, 40)}..."`);
        return translated;
      }
    }
    return text;
  } catch (err) {
    console.warn('Translation failed, using original text:', err);
    return text;
  }
}

/**
 * Generate TTS audio using Google Translate / StreamElements API.
 */
async function fetchStreamElementsTTS(text: string, gender = 'female', language = 'en'): Promise<Uint8Array> {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error('Empty text for TTS');
  }

  // Primary: Google Translate TTS API / StreamElements
  try {
    const chunkText = (str: string, maxLen = 150): string[] => {
      const sentences = str.match(/[^.!?]+[.!?]+|[^.!?]+/g) || [str];
      const chunks: string[] = [];
      let current = '';
      for (const s of sentences) {
        if ((current + s).length > maxLen) {
          if (current) chunks.push(current.trim());
          current = s;
        } else {
          current += (current ? ' ' : '') + s;
        }
      }
      if (current) chunks.push(current.trim());
      return chunks;
    };

    const textChunks = chunkText(cleanText, 150);
    const saSecret = Deno.env.get("GCP_SERVICE_ACCOUNT");
    let serviceAccount: any = null;
    if (saSecret) {
      try {
        serviceAccount = JSON.parse(saSecret);
      } catch (e) {
        console.warn("Failed to parse GCP_SERVICE_ACCOUNT secret:", e);
      }
    }

    const audioBuffers: Uint8Array[] = [];

    for (const chunk of textChunks) {
      let chunkBytes: Uint8Array | null = null;

      if (gender === 'male') {
        if (language === 'ur' && serviceAccount) {
          console.log("Generating Urdu male voice via Google Cloud TTS for schedule...");
          chunkBytes = await generateGcpTTS(chunk, "ur-PK-Wavenet-B", "ur-PK", serviceAccount);
        } else if (language === 'ar' && serviceAccount) {
          console.log("Generating Arabic male voice via Google Cloud TTS for schedule...");
          chunkBytes = await generateGcpTTS(chunk, "ar-XA-Wavenet-B", "ar-XA", serviceAccount);
        } else if (language === 'en') {
          try {
            const params = new URLSearchParams();
            params.append('msg', chunk);
            params.append('lang', 'Brian');
            params.append('source', 'ttsmp3');

            const ttsmp3Res = await fetch('https://ttsmp3.com/makemp3.php', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              },
              body: params.toString()
            });

            if (ttsmp3Res.ok) {
              const data = await ttsmp3Res.json();
              if (data.Error === 0 && data.URL) {
                const audioRes = await fetch(data.URL);
                if (audioRes.ok) {
                  const ab = await audioRes.arrayBuffer();
                  if (ab.byteLength > 100) {
                    chunkBytes = new Uint8Array(ab);
                  }
                }
              }
            }
          } catch (err) {
            console.warn("ttsmp3.com fetch failed for schedule, falling back...", err);
          }
        }
      }

      // Fallback to Google Translate female voice
      if (!chunkBytes || chunkBytes.length === 0) {
        const gLanguage = language === 'ur' ? 'ur' : (language === 'ar' ? 'ar' : 'en');
        const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(gLanguage)}&client=tw-ob`;
        const gBytes = await fetchAudioWithUserAgent(gUrl);
        if (gBytes && gBytes.length > 100) {
          chunkBytes = gBytes;
        }
      }

      if (chunkBytes && chunkBytes.length > 0) {
        audioBuffers.push(parseCleanMp3Frames(chunkBytes));
      }
    }
    if (audioBuffers.length > 0) {
      const totalLen = audioBuffers.reduce((acc, b) => acc + b.length, 0);
      const combinedTts = new Uint8Array(totalLen);
      let offset = 0;
      for (const b of audioBuffers) {
        combinedTts.set(b, offset);
        offset += b.length;
      }
      console.log(`TTS successfully combined ${audioBuffers.length} chunk(s) = ${totalLen} bytes`);
      return combinedTts;
    }
  } catch (gErr: any) {
    console.warn(`TTS generation failed: ${gErr?.message || gErr}`);
  }

  // Fallback: ttsmp3.com
  try {
    const voice = gender === 'male' ? 'Brian' : 'Amy';
    console.log(`Falling back to ttsmp3.com with voice ${voice}...`);
    const params = new URLSearchParams();
    params.append('msg', cleanText);
    params.append('lang', voice);
    params.append('source', 'ttsmp3');

    const ttsmp3Res = await fetch('https://ttsmp3.com/makemp3.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: params.toString()
    });

    if (!ttsmp3Res.ok) throw new Error(`ttsmp3.com fallback failed with status ${ttsmp3Res.status}`);
    const data = await ttsmp3Res.json();
    if (data.Error !== 0 || !data.URL) {
      throw new Error(`ttsmp3.com fallback returned error: ${data.Error}`);
    }

    const audioRes = await fetch(data.URL);
    if (!audioRes.ok) throw new Error(`Failed to download MP3 from ttsmp3.com: ${audioRes.status}`);
    const ab = await audioRes.arrayBuffer();
    return new Uint8Array(ab);
  } catch (fbErr: any) {
    console.error('All TTS generation methods failed:', fbErr);
    throw fbErr;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hjlwzkwiweocnfztshmy.supabase.co';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let bellTimeId: string | null = null;
    let schoolId: string | null = null;

    try {
      const body = await req.json();
      bellTimeId = body.bell_time_id || null;
      schoolId = body.school_id || null;
    } catch (_) {
      const url = new URL(req.url);
      bellTimeId = url.searchParams.get('bell_time_id');
      schoolId = url.searchParams.get('school_id');
    }

    console.log(`precombine-schedule triggered: bell_time_id=${bellTimeId}, school_id=${schoolId}`);

    let query = supabase
      .from('bell_times')
      .select(`
        id,
        bell_time,
        play_type,
        tts_message,
        include_weather,
        audio_file_id,
        profile_id,
        tts_gender,
        tts_language,
        bell_profiles!inner(school_id)
      `);

    if (bellTimeId) {
      query = query.eq('id', bellTimeId);
    } else if (schoolId) {
      query = query.eq('bell_profiles.school_id', schoolId);
    }

    const { data: schedules, error: schedError } = await query;
    if (schedError) {
      throw new Error(`Error querying bell_times: ${schedError.message}`);
    }

    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ message: 'No schedules found to process' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const processedIds: string[] = [];
    const failedIds: string[] = [];

    for (const bt of schedules) {
      const schId = (bt.bell_profiles as any)?.school_id;
      if (!schId) continue;

      try {
        // 1. Fetch school pre-announcement sound, delay, and TTS settings
        const { data: schoolData } = await supabase
          .from('schools')
          .select('pre_announcement_enabled, default_pre_announcement_id, pre_announcement_delay_seconds, default_tts_gender, default_tts_language')
          .eq('id', schId)
          .single();

        const paEnabled = schoolData?.pre_announcement_enabled ?? true;
        const paDelay = schoolData?.pre_announcement_delay_seconds ?? 3;
        const ttsGender = bt.tts_gender || schoolData?.default_tts_gender || 'female';
        const ttsLanguage = bt.tts_language || schoolData?.default_tts_language || 'en';
        let chimeUrl: string | null = null;

        if (paEnabled) {
          if (schoolData?.default_pre_announcement_id) {
            const { data: pasSound } = await supabase
              .from('pre_announcement_sounds')
              .select('file_url')
              .eq('id', schoolData.default_pre_announcement_id)
              .single();
            chimeUrl = pasSound?.file_url || null;
          }

          if (!chimeUrl) {
            const { data: defaultPas } = await supabase
              .from('pre_announcement_sounds')
              .select('file_url')
              .eq('is_active', true)
              .order('created_at', { ascending: true })
              .limit(1);
            if (defaultPas && defaultPas.length > 0) {
              chimeUrl = defaultPas[0].file_url;
            }
          }
        }

        // 2. Fetch Chime bytes
        let chimeBytes: Uint8Array | null = null;
        if (paEnabled && chimeUrl) {
          try {
            chimeBytes = await fetchAudioWithUserAgent(chimeUrl);
            console.log(`Chime fetched: ${chimeBytes.length} bytes from ${chimeUrl}`);
          } catch (e) {
            console.warn(`Could not fetch chime audio from ${chimeUrl}:`, e);
          }
        }

        // 3. Fetch Main Audio bytes
        let mainBytes: Uint8Array | null = null;

        // Helper to fetch audio_file_id bytes
        const fetchLinkedAudioFileBytes = async (audioId: string): Promise<Uint8Array | null> => {
          const { data: af } = await supabase
            .from('audio_files')
            .select('storage_path')
            .eq('id', audioId)
            .single();
          if (af?.storage_path) {
            const fullAudioUrl = `${supabaseUrl}/storage/v1/object/public/audio-files/${af.storage_path}`;
            return await fetchAudioWithUserAgent(fullAudioUrl);
          }
          return null;
        };

        if (bt.play_type === 'tts') {
          let ttsText = bt.tts_message ? bt.tts_message.trim() : '';

          if (bt.include_weather) {
            let deviceCity = 'Islamabad';
            try {
              const { data: deviceData } = await supabase
                .from('bell_devices')
                .select('location_city')
                .eq('school_id', schId)
                .not('location_city', 'is', null)
                .limit(1);
              if (deviceData && deviceData.length > 0 && deviceData[0].location_city) {
                deviceCity = deviceData[0].location_city;
              }
            } catch (locErr) {
              console.warn('Could not fetch device city for weather:', locErr);
            }

            const weatherText = await fetchWeatherText(deviceCity);
            ttsText = ttsText ? `Good morning. ${weatherText} Now for today's announcement. ${ttsText}` : `Good morning. ${weatherText}`;
          }

          let audioFileBytes: Uint8Array | null = null;
          if (bt.audio_file_id) {
            try {
              audioFileBytes = await fetchLinkedAudioFileBytes(bt.audio_file_id);
            } catch (aErr) {
              console.warn(`Could not fetch linked audio file ${bt.audio_file_id}:`, aErr);
            }
          }

          let ttsBytes: Uint8Array | null = null;
          if (ttsText.length > 0) {
            // Auto-translate English text to target language if needed
            if (ttsLanguage !== 'en') {
              ttsText = await translateText(ttsText, ttsLanguage);
            }
            console.log(`Generating TTS for schedule ${bt.id}: "${ttsText.substring(0, 80)}..." (gender=${ttsGender}, language=${ttsLanguage})`);
            ttsBytes = await fetchStreamElementsTTS(ttsText, ttsGender, ttsLanguage);
          }

          if (audioFileBytes && ttsBytes) {
            const cleanAf = parseCleanMp3Frames(audioFileBytes);
            const cleanTts = parseCleanMp3Frames(ttsBytes);
            const combined = new Uint8Array(cleanAf.length + cleanTts.length);
            combined.set(cleanAf, 0);
            combined.set(cleanTts, cleanAf.length);
            mainBytes = combined;
          } else if (audioFileBytes) {
            mainBytes = audioFileBytes;
          } else if (ttsBytes) {
            mainBytes = ttsBytes;
          } else {
            // Fallback default message if both audio_file_id and tts_message were empty
            let fallbackMsg = 'Scheduled announcement';
            if (ttsLanguage !== 'en') {
              fallbackMsg = await translateText(fallbackMsg, ttsLanguage);
            }
            console.log(`Generating default fallback TTS for schedule ${bt.id} (gender=${ttsGender}, language=${ttsLanguage})`);
            mainBytes = await fetchStreamElementsTTS(fallbackMsg, ttsGender, ttsLanguage);
          }

        } else {
          // play_type = 'mp3'
          if (bt.audio_file_id) {
            mainBytes = await fetchLinkedAudioFileBytes(bt.audio_file_id);
          }
        }

        if (!mainBytes) {
          console.warn(`No main audio found for schedule ${bt.id} (type=${bt.play_type}), skipping.`);
          failedIds.push(bt.id);
          continue;
        }

        // 4. Clean MP3 frames & check sample rate and channel compatibility
        const cleanChime = chimeBytes ? parseCleanMp3Frames(chimeBytes) : new Uint8Array(0);
        const cleanMain = parseCleanMp3Frames(mainBytes);

        const chimeSr = cleanChime.length > 0 ? detectMp3SampleRate(cleanChime) : 0;
        const mainSr = cleanMain.length > 0 ? detectMp3SampleRate(cleanMain) : 24000;
        const chimeChannels = cleanChime.length > 0 ? detectMp3Channels(cleanChime) : 0;
        const mainChannels = cleanMain.length > 0 ? detectMp3Channels(cleanMain) : 1;

        let combinedBuffer: Uint8Array;
        let chimeIncluded = false;

        // If chime and main audio have matching sample rates AND matching channel count, concatenate cleanly.
        if (cleanChime.length > 0 && 
            (chimeSr === mainSr || chimeSr === 0) && 
            (chimeChannels === mainChannels || chimeChannels === 0)) {
          const silenceSampleRate = chimeSr > 0 ? chimeSr : mainSr;
          const cleanSilence = generateMp3Silence(paDelay, silenceSampleRate, mainChannels);
          const totalLen = cleanChime.length + cleanSilence.length + cleanMain.length;
          combinedBuffer = new Uint8Array(totalLen);
          combinedBuffer.set(cleanChime, 0);
          combinedBuffer.set(cleanSilence, cleanChime.length);
          combinedBuffer.set(cleanMain, cleanChime.length + cleanSilence.length);
          chimeIncluded = true;
          console.log(`Combined matched audio for ${bt.id} (${mainSr}Hz, ${mainChannels}ch): chime=${cleanChime.length} + silence=${cleanSilence.length} + main=${cleanMain.length} = ${totalLen} bytes`);
        } else {
          if (cleanChime.length > 0) {
            console.warn(`Format mismatch for schedule ${bt.id}: chime=${chimeSr}Hz/${chimeChannels}ch, main=${mainSr}Hz/${mainChannels}ch. Storing main audio only so device handles pre-announcement chime and sample-rate/channel reset independently.`);
          }
          combinedBuffer = cleanMain;
          chimeIncluded = false;
        }

        // 5. Upload combined file to audio-files storage bucket at path: combined/s_<id>.mp3
        const targetPath = `combined/s_${bt.id}.mp3`;
        const { error: uploadErr } = await supabase
          .storage
          .from('audio-files')
          .upload(targetPath, combinedBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadErr) {
          console.error(`Failed to upload ${targetPath}:`, uploadErr);
          failedIds.push(bt.id);
        } else {
          console.log(`Successfully pre-combined schedule ${bt.id} -> ${targetPath}`);

          // 6. Update precombined_at timestamp and precombine_chime_included flag on bell_times row
          const { error: updateErr } = await supabase
            .from('bell_times')
            .update({ 
              precombined_at: new Date().toISOString(),
              precombine_chime_included: chimeIncluded
            })
            .eq('id', bt.id);

          if (updateErr) {
            console.warn(`Failed to update precombined_at for ${bt.id}:`, updateErr);
          }

          processedIds.push(bt.id);
        }
      } catch (scheduleErr: any) {
        console.error(`Error processing schedule ${bt.id}:`, scheduleErr?.message || scheduleErr);
        failedIds.push(bt.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed_count: processedIds.length,
      failed_count: failedIds.length,
      processed_ids: processedIds,
      failed_ids: failedIds
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('precombine-schedule error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
