import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Authenticate User
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Parse Request
    const { provider = 'openai', text, settings = {} } = await req.json()
    if (!text) throw new Error('Text is required')

    // Get User's Custom API Key from Vault
    const { data: customKeyData, error: keyError } = await supabaseClient.rpc('get_user_api_key', { p_provider: provider })
    let apiKey = customKeyData;

    // Fallback to Server Environment Variables if custom key isn't set
    if (!apiKey) {
        if (provider === 'openai') apiKey = Deno.env.get('OPENAI_API_KEY')
        else if (provider === 'elevenlabs') apiKey = Deno.env.get('ELEVENLABS_API_KEY')
        else if (provider === 'cambai') apiKey = Deno.env.get('CAMBAI_API_KEY')
        else if (provider === 'topmediai') apiKey = Deno.env.get('TOPMEDIAI_API_KEY')
    }

    if (!apiKey) throw new Error(`API Key for ${provider} is not configured`)

    let audioBlob: Blob;

    if (provider === 'openai') {
        const { voice = 'alloy', model = 'tts-1', baseUrl = 'https://api.openai.com/v1' } = settings
        const url = `${baseUrl.replace(/\/$/, '')}/audio/speech`
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input: text, voice, response_format: 'mp3' }),
        })
        if (!response.ok) throw new Error('Failed to generate speech from OpenAI')
        audioBlob = await response.blob()

    } else if (provider === 'elevenlabs') {
        const { voiceId = '21m00Tcm4TlvDq8ikWAM', modelId = 'eleven_monolingual_v1' } = settings
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`
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
            const statusRes = await fetch(`${baseUrl}/tts/${task_id}`, { headers: { 'x-api-key': apiKey } })
            if (!statusRes.ok) continue
            const statusData = await statusRes.json()
            if (statusData.status === 'SUCCESS') { runId = statusData.run_id; break; }
            else if (statusData.status === 'FAILED') throw new Error('Camb.ai TTS task failed')
            attempts++
        }
        if (!runId) throw new Error('Camb.ai TTS task timed out')

        // Download Audio
        const audioRes = await fetch(`${baseUrl}/tts-result/${runId}`, { headers: { 'x-api-key': apiKey } })
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
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
