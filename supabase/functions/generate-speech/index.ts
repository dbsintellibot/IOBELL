import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Whitelisted OpenAI API endpoints to prevent SSRF vulnerabilities
const ALLOWED_OPENAI_BASE_URLS = [
  'https://api.openai.com/v1',
  'https://api.openai.com'
]

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Try to retrieve authenticated user (for custom Vault API keys)
    let user = null;
    try {
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader.startsWith('Bearer ')) {
        const { data: userData } = await supabaseClient.auth.getUser();
        user = userData?.user || null;
      }
    } catch (_) {
      user = null;
    }

    // Parse Request
    const { provider = 'google-free', text, settings = {} } = await req.json()
    if (!text) throw new Error('Text is required')

    // Get User's Custom API Key from Vault (except for google-free which is keyless)
    let apiKey: string | null = null;
    if (provider !== 'google-free' && user) {
      const { data: customKeyData } = await supabaseClient.rpc('get_user_api_key', { p_provider: provider })
      apiKey = customKeyData;

      if (!apiKey) {
          if (provider === 'openai') apiKey = Deno.env.get('OPENAI_API_KEY')
          else if (provider === 'elevenlabs') apiKey = Deno.env.get('ELEVENLABS_API_KEY')
          else if (provider === 'cambai') apiKey = Deno.env.get('CAMBAI_API_KEY')
          else if (provider === 'topmediai') apiKey = Deno.env.get('TOPMEDIAI_API_KEY')
      }

      if (!apiKey) throw new Error(`API Key for ${provider} is not configured`)
    }

    let audioBlob: Blob;

    if (provider === 'google-free') {
        const { language = 'en', gender = 'female' } = settings
        const cleanText = text.trim()
        
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
        const buffers: Uint8Array[] = [];

        const saSecret = Deno.env.get("GCP_SERVICE_ACCOUNT");
        let serviceAccount: any = null;
        if (saSecret) {
          try {
            serviceAccount = JSON.parse(saSecret);
          } catch (e) {
            console.warn("Failed to parse GCP_SERVICE_ACCOUNT secret:", e);
          }
        }

        for (const chunk of textChunks) {
          let chunkBytes: Uint8Array | null = null;

          if (gender === 'male') {
            if (language === 'ur' && serviceAccount) {
              console.log("Generating Urdu male voice via Google Cloud TTS...");
              chunkBytes = await generateGcpTTS(chunk, "ur-PK-Wavenet-B", "ur-PK", serviceAccount);
            } else if (language === 'ar' && serviceAccount) {
              console.log("Generating Arabic male voice via Google Cloud TTS...");
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
                console.warn("ttsmp3.com fetch failed, falling back...", err);
              }
            }
          }

          // Fallback to Google Translate female voice
          if (!chunkBytes || chunkBytes.length === 0) {
            const gLanguage = language === 'ur' ? 'ur' : (language === 'ar' ? 'ar' : 'en');
            const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(gLanguage)}&client=tw-ob`;
            const res = await fetch(gUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            if (res.ok) {
              const ab = await res.arrayBuffer();
              if (ab.byteLength > 100) {
                chunkBytes = new Uint8Array(ab);
              }
            }
          }

          if (chunkBytes && chunkBytes.length > 0) {
            buffers.push(chunkBytes);
          }
        }

        if (buffers.length === 0) throw new Error('Failed to generate speech via TTS');

        const totalLen = buffers.reduce((acc, b) => acc + b.length, 0);
        const combined = new Uint8Array(totalLen);
        let offset = 0;
        for (const b of buffers) {
          combined.set(b, offset);
          offset += b.length;
        }
        audioBlob = new Blob([combined], { type: 'audio/mpeg' });

    } else if (provider === 'openai') {
        const { voice = 'alloy', model = 'tts-1', baseUrl = 'https://api.openai.com/v1' } = settings
        
        // SSRF Check: Ensure baseUrl strictly matches allowed origins
        const cleanBaseUrl = baseUrl.replace(/\/$/, '')
        const isAllowed = ALLOWED_OPENAI_BASE_URLS.some(allowed => cleanBaseUrl === allowed || cleanBaseUrl.startsWith('https://api.openai.com'))
        if (!isAllowed) {
          throw new Error('Invalid or unapproved base URL provider')
        }

        const url = `${cleanBaseUrl}/audio/speech`
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input: text, voice, response_format: 'mp3' }),
        })
        if (!response.ok) throw new Error('Failed to generate speech from OpenAI')
        audioBlob = await response.blob()

    } else if (provider === 'elevenlabs') {
        const { voiceId = '21m00Tcm4TlvDq8ikWAM', modelId = 'eleven_monolingual_v1' } = settings
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, model_id: modelId, voice_settings: { stability: 0.5, similarity_boost: 0.5 } }),
        })
        if (!response.ok) throw new Error('Failed to generate ElevenLabs speech')
        audioBlob = await response.blob()

    } else if (provider === 'cambai') {
        const { voiceId = 147320, language = 1, gender = 1, age = 30 } = settings
        const baseUrl = 'https://client.camb.ai/apis'
        
        // Create Task
        const createRes = await fetch(`${baseUrl}/tts`, {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice_id: voiceId, language, gender, age })
        })
        if (!createRes.ok) throw new Error('Failed to create Camb.ai TTS task')
        const { task_id } = await createRes.json()

        // Poll Status
        let runId = null
        let attempts = 0
        while (attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const statusRes = await fetch(`${baseUrl}/tts/${encodeURIComponent(task_id)}`, { headers: { 'x-api-key': apiKey } })
            if (!statusRes.ok) continue
            const statusData = await statusRes.json()
            if (statusData.status === 'SUCCESS') { runId = statusData.run_id; break; }
            else if (statusData.status === 'FAILED') throw new Error('Camb.ai TTS task failed')
            attempts++
        }
        if (!runId) throw new Error('Camb.ai TTS task timed out')

        // Download Audio
        const audioRes = await fetch(`${baseUrl}/tts-result/${encodeURIComponent(runId)}`, { headers: { 'x-api-key': apiKey } })
        if (!audioRes.ok) throw new Error('Failed to download Camb.ai audio')
        audioBlob = await audioRes.blob()

    } else if (provider === 'topmediai') {
        const { speaker = '00151554-3826-11ee-a861-00163e2ac61b', emotion = 'Neutral' } = settings
        const url = 'https://api.topmediai.com/v1/text2speech'
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, speaker, emotion }),
        })
        if (!response.ok) throw new Error('Failed to generate speech via TopMediai')
        audioBlob = await response.blob()
    } else {
        throw new Error('Unsupported provider')
    }

    return new Response(audioBlob, {
      headers: { ...corsHeaders, 'Content-Type': 'application/octet-stream' },
    })

  } catch (error: any) {
    const isUnauthorized = error?.message?.includes('Unauthorized');
    return new Response(JSON.stringify({ error: error.message }), {
      status: isUnauthorized ? 401 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
