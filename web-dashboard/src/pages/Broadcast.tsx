import { useState, useRef, useEffect } from 'react'
import '@/lib/lame-polyfill'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { generateTTS, generateCambAITTS, generateElevenLabsTTS } from '@/lib/tts'
import { Mic, Square, Play, Send, Type, Radio } from 'lucide-react'
// @ts-expect-error mic-recorder-to-mp3 has no types
import MicRecorder from 'mic-recorder-to-mp3'

type Mp3Recorder = {
  start: () => Promise<void> | void
  stop: () => {
    getMp3: () => Promise<[unknown, Blob]>
  }
}

type TtsProvider = 'openai' | 'cambai' | 'elevenlabs' | 'google-free' | 'topmediai'
type GoogleFreeVoiceGender = 'female' | 'male'

export default function Broadcast() {
  const { schoolId, ttsEnabled, user } = useAuth()
  const [activeTab, setActiveTab] = useState<'text' | 'voice' | 'stream'>('text')
  // TTS State
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>('google-free')
  const [text, setText] = useState('')
  const [ttsLanguage, setTtsLanguage] = useState('en')
  const [googleFreeVoiceGender, setGoogleFreeVoiceGender] = useState<GoogleFreeVoiceGender>(() => {
    const saved = localStorage.getItem('google_free_voice_gender')
    return saved === 'male' || saved === 'female' ? saved : 'female'
  })
  const [streamUrl, setStreamUrl] = useState(() => localStorage.getItem('broadcast_stream_url') || '')
  const [streamBypassOtherAudio, setStreamBypassOtherAudio] = useState(() => localStorage.getItem('broadcast_stream_bypass_other_audio') === 'true')
  const [streamIsActive, setStreamIsActive] = useState(false)
  
  // TopMediai State
  const [topMediaiKey, setTopMediaiKey] = useState('')
  const [topMediaiSpeaker, setTopMediaiSpeaker] = useState(localStorage.getItem('topmediai_speaker') || '00151554-3826-11ee-a861-00163e2ac61b')
  const [topMediaiEmotion, setTopMediaiEmotion] = useState(localStorage.getItem('topmediai_emotion') || 'Neutral')

  // OpenAI State
  const [apiKey, setApiKey] = useState('')
  
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('openai_base_url') || 'https://api.openai.com/v1')
  const [model, setModel] = useState(localStorage.getItem('openai_model') || 'tts-1')
  const [voice, setVoice] = useState(localStorage.getItem('openai_voice') || 'alloy')

  // ElevenLabs State
  const [elevenLabsKey, setElevenLabsKey] = useState('')
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(localStorage.getItem('elevenlabs_voice_id') || '21m00Tcm4TlvDq8ikWAM')

  // Camb.ai State
  const [cambAiKey, setCambAiKey] = useState('')
  const [cambAiVoiceId, setCambAiVoiceId] = useState(Number(localStorage.getItem('cambai_voice_id')) || 147320)
  const [cambAiLanguage, setCambAiLanguage] = useState(Number(localStorage.getItem('cambai_language')) || 1)
  const [cambAiGender, setCambAiGender] = useState(Number(localStorage.getItem('cambai_gender')) || 1)
  const [cambAiAge, setCambAiAge] = useState(Number(localStorage.getItem('cambai_age')) || 30)
  
  // Load API keys securely from Supabase
  useEffect(() => {
    const loadSecureKeys = async () => {
      const { data, error } = await supabase.from('user_api_keys').select('provider');
      if (error) {
        console.error('Failed to load secure keys', error);
        return;
      }
      data?.forEach((row: any) => {
        if (row.provider === 'openai') setApiKey('********-hidden-********');
        if (row.provider === 'elevenlabs') setElevenLabsKey('********-hidden-********');
        if (row.provider === 'cambai') setCambAiKey('********-hidden-********');
        if (row.provider === 'topmediai') setTopMediaiKey('********-hidden-********');
      });
    };
    loadSecureKeys();
  }, []);

  const saveSecureKey = async (provider: string, secret: string) => {
    if (secret === '********-hidden-********') return;
    if (!secret) return;
    try {
      const { error } = await supabase.rpc('set_user_api_key', { p_provider: provider, p_secret: secret });
      if (error) throw error;
      toast.success(`${provider} API Key saved securely.`);
    } catch (e: any) {
      toast.error(`Failed to save ${provider} key: ${e.message}`);
    }
  };

  // Voice Note State
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const recorderRef = useRef<Mp3Recorder | null>(null)
  
  // General State
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  useEffect(() => {
    const loadTtsProviderPreference = async () => {
      if (!user) return

      try {
        const { data, error } = await supabase
          .from('users')
          .select('tts_provider')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('Error loading TTS provider preference:', error)
          return
        }

        const provider = data?.tts_provider as TtsProvider | null
        if (
          provider === 'openai' ||
          provider === 'cambai' ||
          provider === 'elevenlabs' ||
          provider === 'google-free' ||
          provider === 'topmediai'
        ) {
          setTtsProvider(provider)
        } else {
          setTtsProvider('google-free')
        }
      } catch (error) {
        console.error('Unexpected error loading TTS provider preference:', error)
      }
    }

    loadTtsProviderPreference()
  }, [user])

  const startRecording = async () => {
    try {
      if (!recorderRef.current) {
        recorderRef.current = new MicRecorder({ bitRate: 128 }) as Mp3Recorder
      }

      await recorderRef.current.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Error accessing microphone:', err)
      setStatus({ type: 'error', message: 'Could not access microphone' })
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current
        .stop()
        .getMp3()
        .then(([, blob]: [unknown, Blob]) => {
          setAudioBlob(blob)
          setAudioUrl(URL.createObjectURL(blob))
          setIsRecording(false)
        })
        .catch((error: unknown) => {
          console.error('Error stopping recording:', error)
          setIsRecording(false)
        })
    }
  }

  const playPreview = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audio.play()
    }
  }

  const broadcastVoice = async () => {
    if (!audioBlob || !schoolId) return

    setIsSending(true)
    setStatus(null)

    try {
      // 1. Upload to Supabase
      const fileName = `${schoolId}/${Date.now()}_voice_note.mp3`
      const { error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, {
          contentType: 'audio/mpeg'
        })

      if (uploadError) throw uploadError

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(fileName)

      // 3. Send Command
      // Get devices first
      const { data: devices, error: deviceError } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId)

      if (deviceError) throw deviceError

      if (!devices || devices.length === 0) {
        throw new Error('No devices found for this school')
      }

      const commands = devices.map(d => ({
        device_id: d.id,
        command: 'PLAY_URL',
        payload: { url: publicUrl },
        status: 'pending',
        school_id: schoolId
      }))

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands)

      if (cmdError) throw cmdError

      setStatus({ type: 'success', message: 'Voice note broadcasted successfully!' })
      setAudioBlob(null)
      setAudioUrl(null)
    } catch (error) {
      console.error('Broadcast failed:', error)
      if (error instanceof Error) {
        setStatus({ type: 'error', message: error.message })
      } else {
        setStatus({ type: 'error', message: 'Failed to broadcast' })
      }
    } finally {
      setIsSending(false)
    }
  }

  const broadcastText = async () => {
    if (!text || !schoolId) return

    if (ttsProvider === 'openai' && !apiKey) {
      setStatus({ type: 'error', message: 'OpenAI API Key required.' })
      return
    }

    if (ttsProvider === 'cambai' && !cambAiKey) {
      setStatus({ type: 'error', message: 'Camb.ai API Key required.' })
      return
    }

    if (ttsProvider === 'elevenlabs' && !elevenLabsKey) {
      setStatus({ type: 'error', message: 'ElevenLabs API Key required.' })
      return
    }

    if (ttsProvider === 'topmediai' && !topMediaiKey) {
      setStatus({ type: 'error', message: 'TopMediai API Key required.' })
      return
    }

    setIsSending(true)
    setStatus(null)

    try {
      let commandType = 'PLAY_URL';
      let commandPayload = {};

      if (ttsProvider === 'google-free') {
        // Direct TTS command to device (uses Google Translate internally on ESP32)
        commandType = 'TTS';
        commandPayload = { 
          text: text,
          language: ttsLanguage,
          voice_gender: googleFreeVoiceGender
        };
      } else {
        // 1. Generate TTS
        let audioBlob: Blob;
        
        if (ttsProvider === 'cambai') {
          audioBlob = await generateCambAITTS(text, cambAiKey, cambAiVoiceId, cambAiLanguage, cambAiGender, cambAiAge)
        } else if (ttsProvider === 'elevenlabs') {
          audioBlob = await generateElevenLabsTTS(text, elevenLabsKey, elevenLabsVoiceId)
        } else {
          audioBlob = await generateTTS(text, apiKey, baseUrl, model, voice)
        }
        
        // 2. Upload to Supabase
        const fileName = `${schoolId}/${Date.now()}_tts.mp3`
        const { error: uploadError } = await supabase.storage
          .from('voice-notes')
          .upload(fileName, audioBlob, {
            contentType: 'audio/mpeg'
          })

        if (uploadError) throw uploadError

        // 3. Get Public URL
        const { data: { publicUrl } } = supabase.storage
          .from('voice-notes')
          .getPublicUrl(fileName)
          
        commandPayload = { url: publicUrl };
      }

      // 4. Send Command
      const { data: devices, error: deviceError } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId)

      if (deviceError) throw deviceError

      if (!devices || devices.length === 0) {
        throw new Error('No devices found for this school')
      }

      const commands = devices.map(d => ({
        device_id: d.id,
        command: commandType,
        payload: commandPayload,
        status: 'pending',
        school_id: schoolId
      }))

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands)

      if (cmdError) throw cmdError

      setStatus({ type: 'success', message: 'Announcement broadcasted successfully!' })
      setText('')
    } catch (error) {
      console.error('Broadcast failed:', error)
      if (error instanceof Error) {
        setStatus({ type: 'error', message: error.message })
      } else {
        setStatus({ type: 'error', message: 'Failed to broadcast' })
      }
    } finally {
      setIsSending(false)
    }
  }

  const normalizeStreamUrl = (rawUrl: string) => {
    const trimmed = rawUrl.trim()
    if (!trimmed) return ''

    const candidates = trimmed.includes('://') ? [trimmed] : [`http://${trimmed}`, trimmed]

    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate)
        const isRoot = parsed.pathname === '/' && !parsed.search && !parsed.hash
        if (isRoot) return `${parsed.origin}/;`
        return parsed.toString()
      } catch {
        continue
      }
    }

    return trimmed
  }

  const startStream = async () => {
    if (!streamUrl || !schoolId) return

    setIsSending(true)
    setStatus(null)

    try {
      const normalizedUrl = normalizeStreamUrl(streamUrl)
      const { data: devices, error: deviceError } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId)

      if (deviceError) throw deviceError

      if (!devices || devices.length === 0) {
        throw new Error('No devices found for this school')
      }

      setStreamUrl(normalizedUrl)
      localStorage.setItem('broadcast_stream_url', normalizedUrl)
      localStorage.setItem('broadcast_stream_bypass_other_audio', String(streamBypassOtherAudio))

      const commands = devices.map(d => ({
        device_id: d.id,
        command: 'STREAM_START',
        payload: { url: normalizedUrl, bypass_other_audio: streamBypassOtherAudio },
        status: 'pending',
        school_id: schoolId
      }))

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands)

      if (cmdError) throw cmdError

      setStreamIsActive(true)
      setStatus({ type: 'success', message: 'Stream started successfully!' })
    } catch (error) {
      console.error('Start stream failed:', error)
      if (error instanceof Error) {
        setStatus({ type: 'error', message: error.message })
      } else {
        setStatus({ type: 'error', message: 'Failed to start stream' })
      }
    } finally {
      setIsSending(false)
    }
  }

  const stopStream = async () => {
    if (!schoolId) return

    setIsSending(true)
    setStatus(null)

    try {
      const { data: devices, error: deviceError } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId)

      if (deviceError) throw deviceError

      if (!devices || devices.length === 0) {
        throw new Error('No devices found for this school')
      }

      const commands = devices.map(d => ({
        device_id: d.id,
        command: 'STREAM_STOP',
        payload: {},
        status: 'pending',
        school_id: schoolId
      }))

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands)

      if (cmdError) throw cmdError

      setStreamIsActive(false)
      setStatus({ type: 'success', message: 'Stream stopped successfully!' })
    } catch (error) {
      console.error('Stop stream failed:', error)
      if (error instanceof Error) {
        setStatus({ type: 'error', message: error.message })
      } else {
        setStatus({ type: 'error', message: 'Failed to stop stream' })
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Broadcast</h1>
      </div>

      {!ttsEnabled && (
        <div className="rounded-md bg-amber-500/10 p-4 border border-amber-500/20">
          <div className="flex">
            <div className="flex-shrink-0">
              <Radio className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400">Feature Disabled</h3>
              <div className="mt-2 text-sm text-amber-600 dark:text-amber-500">
                <p>
                  The Text-to-Speech and Voice Note feature is currently disabled for your account.
                  Please contact the Super Admin to enable it.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className={`p-4 rounded-md ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive dark:text-red-400'}`}>
          {status.message}
        </div>
      )}

      <div className="bg-card text-foreground shadow rounded-lg overflow-hidden border border-border">
        <div className="border-b border-border">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('text')}
              className={`${
                activeTab === 'text'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              } w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2`}
            >
              <Type className="w-4 h-4" />
              Text to Speech
            </button>
            <button
              onClick={() => setActiveTab('voice')}
              className={`${
                activeTab === 'voice'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              } w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2`}
            >
              <Mic className="w-4 h-4" />
              Voice Note
            </button>
            <button
              onClick={() => setActiveTab('stream')}
              className={`${
                activeTab === 'stream'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              } w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2`}
            >
              <Radio className="w-4 h-4" />
              Online Stream
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'text' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Message</label>
                <textarea
                  rows={4}
                  className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                  placeholder="Type your announcement here..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>

              {/* Provider Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground">TTS Provider</label>
                <select
                  value={ttsProvider}
                  onChange={async (e) => {
                    const provider = e.target.value as TtsProvider
                    setTtsProvider(provider)

                    if (user) {
                      try {
                        const { error } = await supabase
                          .from('users')
                          .update({ tts_provider: provider })
                          .eq('id', user.id)

                        if (error) {
                          console.error('Failed to save TTS provider preference:', error)
                        }
                      } catch (error) {
                        console.error('Unexpected error saving TTS provider preference:', error)
                      }
                    }
                  }}
                  className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                >
                  <option value="google-free">Device Built-in (Free – Recommended)</option>
                  <option value="openai">OpenAI</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="cambai">Camb.ai</option>
                </select>
                {ttsProvider === 'google-free' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Uses the device's internal Google Translate integration. No API key required.
                  </p>
                )}
              </div>

              {ttsProvider === 'google-free' && (
                <div>
                  <label className="block text-sm font-medium text-foreground">Voice</label>
                  <div className="mt-2 flex items-center gap-6">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name="google-free-voice-gender"
                        value="female"
                        checked={googleFreeVoiceGender === 'female'}
                        onChange={() => {
                          setGoogleFreeVoiceGender('female')
                          localStorage.setItem('google_free_voice_gender', 'female')
                        }}
                      />
                      Female
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name="google-free-voice-gender"
                        value="male"
                        checked={googleFreeVoiceGender === 'male'}
                        onChange={() => {
                          setGoogleFreeVoiceGender('male')
                          localStorage.setItem('google_free_voice_gender', 'male')
                        }}
                      />
                      Male
                    </label>
                  </div>
                </div>
              )}

              {ttsProvider === 'topmediai' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground">TopMediai API Key</label>
                    <input
                      type="password"
                      value={topMediaiKey}
                      onChange={(e) => setTopMediaiKey(e.target.value)}
                      onBlur={() => saveSecureKey('topmediai', topMediaiKey)}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="Enter your API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Speaker ID</label>
                    <input
                      type="text"
                      value={topMediaiSpeaker}
                      onChange={(e) => {
                        setTopMediaiSpeaker(e.target.value)
                        localStorage.setItem('topmediai_speaker', e.target.value)
                      }}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="00151554-3826-11ee-a861-00163e2ac61b"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Emotion</label>
                    <input
                      type="text"
                      value={topMediaiEmotion}
                      onChange={(e) => {
                        setTopMediaiEmotion(e.target.value)
                        localStorage.setItem('topmediai_emotion', e.target.value)
                      }}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="Neutral"
                    />
                  </div>
                </div>
              )}

              {ttsProvider === 'elevenlabs' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground">ElevenLabs API Key</label>
                    <input
                      type="password"
                      value={elevenLabsKey}
                      onChange={(e) => setElevenLabsKey(e.target.value)}
                      onBlur={() => saveSecureKey('elevenlabs', elevenLabsKey)}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="xi-..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Voice ID</label>
                    <input
                      type="text"
                      value={elevenLabsVoiceId}
                      onChange={(e) => {
                        setElevenLabsVoiceId(e.target.value)
                        localStorage.setItem('elevenlabs_voice_id', e.target.value)
                      }}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="21m00Tcm4TlvDq8ikWAM"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Default: Rachel</p>
                  </div>
                </div>
              )}

              {ttsProvider === 'openai' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Language (UI Hint Only)</label>
                    <select
                      value={ttsLanguage}
                      onChange={(e) => setTtsLanguage(e.target.value)}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                    >
                      <option value="en">English</option>
                      <option value="ur">Urdu</option>
                    </select>
                  </div>

                  {!apiKey && (
                    <div>
                      <label className="block text-sm font-medium text-destructive dark:text-red-400">OpenAI API Key (Required)</label>
                      <input 
                        type="password" 
                        className="mt-1 block w-full rounded-md border-destructive bg-background text-foreground shadow-sm focus:border-destructive focus:ring-destructive sm:text-sm p-2 border" 
                        placeholder="sk-..."
                        onChange={(e) => {
                          setApiKey(e.target.value)
                          localStorage.setItem('openai_api_key', e.target.value)
                        }}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">Your key is stored locally in your browser.</p>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
                    >
                      {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
                    </button>
                    
                    {showAdvanced && (
                      <div className="mt-4 space-y-4 p-4 bg-muted/50 rounded-md border border-border">
                        <div>
                          <label className="block text-sm font-medium text-foreground">API Base URL</label>
                          <input 
                            type="text" 
                            value={baseUrl}
                            className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                            placeholder="https://api.openai.com/v1"
                            onChange={(e) => {
                              setBaseUrl(e.target.value)
                              localStorage.setItem('openai_base_url', e.target.value)
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground">Model</label>
                          <input 
                            type="text" 
                            value={model}
                            className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                            placeholder="tts-1"
                            onChange={(e) => {
                              setModel(e.target.value)
                              localStorage.setItem('openai_model', e.target.value)
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground">Voice</label>
                          <input 
                            type="text" 
                            value={voice}
                            className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                            placeholder="alloy"
                            onChange={(e) => {
                              setVoice(e.target.value)
                              localStorage.setItem('openai_voice', e.target.value)
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {ttsProvider === 'cambai' && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-md border border-border">
                   <div>
                      <label className="block text-sm font-medium text-foreground">Camb.ai API Key</label>
                      <input 
                        type="password" 
                        value={cambAiKey}
                        className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                        placeholder="x-api-key"
                        onChange={(e) => {
                          setCambAiKey(e.target.value)
                          localStorage.setItem('cambai_api_key', e.target.value)
                        }}
                      />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-foreground">Voice ID</label>
                        <input 
                          type="number" 
                          value={cambAiVoiceId}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                          onChange={(e) => {
                            setCambAiVoiceId(Number(e.target.value))
                            localStorage.setItem('cambai_voice_id', e.target.value)
                          }}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-foreground">Language ID</label>
                        <input 
                          type="number" 
                          value={cambAiLanguage}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                          onChange={(e) => {
                            setCambAiLanguage(Number(e.target.value))
                            localStorage.setItem('cambai_language', e.target.value)
                          }}
                        />
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-foreground">Gender (1=M, 0=F)</label>
                        <select 
                          value={cambAiGender}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                          onChange={(e) => {
                            setCambAiGender(Number(e.target.value))
                            localStorage.setItem('cambai_gender', e.target.value)
                          }}
                        >
                          <option value={1}>Male</option>
                          <option value={0}>Female</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-foreground">Age</label>
                        <input 
                          type="number" 
                          value={cambAiAge}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                          onChange={(e) => {
                            setCambAiAge(Number(e.target.value))
                            localStorage.setItem('cambai_age', e.target.value)
                          }}
                        />
                     </div>
                   </div>
                </div>
              )}

              <button
                onClick={broadcastText}
                disabled={!text || isSending}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none disabled:opacity-50"
              >
                <Send className="w-4 h-4 mr-2" />
                {isSending ? 'Broadcasting...' : 'Broadcast Announcement'}
              </button>
            </div>
          ) : activeTab === 'voice' ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="p-6 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <Mic className="w-12 h-12" />
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="p-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors animate-pulse"
                  >
                    <Square className="w-12 h-12" />
                  </button>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground">
                {isRecording ? 'Recording... Tap to stop' : 'Tap microphone to start recording'}
              </p>

              {audioUrl && !isRecording && (
                <div className="bg-muted/50 p-4 rounded-md space-y-4">
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={playPreview}
                      className="inline-flex items-center px-3 py-2 border border-input shadow-sm text-sm leading-4 font-medium rounded-md text-foreground bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Play Preview
                    </button>
                    <button
                      onClick={() => { setAudioBlob(null); setAudioUrl(null); }}
                      className="text-destructive text-sm hover:text-destructive/80"
                    >
                      Delete
                    </button>
                  </div>
                  
                  <button
                    onClick={broadcastVoice}
                    disabled={isSending}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none disabled:opacity-50"
                  >
                    <Radio className="w-4 h-4 mr-2" />
                    {isSending ? 'Broadcasting...' : 'Broadcast Voice Note'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Stream URL</label>
                <input
                  type="text"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://example.com/stream.mp3"
                  className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste a direct radio/audio stream URL. For Shoutcast server links like http://ip:port, use http://ip:port/;
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="bypass-other-audio"
                  type="checkbox"
                  checked={streamBypassOtherAudio}
                  onChange={(e) => {
                    setStreamBypassOtherAudio(e.target.checked)
                    localStorage.setItem('broadcast_stream_bypass_other_audio', String(e.target.checked))
                  }}
                  className="h-4 w-4"
                />
                <label htmlFor="bypass-other-audio" className="text-sm text-foreground">
                  Bypass scheduled bells, TTS, and voice notes while streaming
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={startStream}
                  disabled={!streamUrl || isSending}
                  className="inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none disabled:opacity-50"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isSending ? 'Starting...' : streamIsActive ? 'Restart Stream' : 'Play Stream'}
                </button>
                <button
                  onClick={stopStream}
                  disabled={isSending}
                  className="inline-flex justify-center items-center px-4 py-2 border border-input text-sm font-medium rounded-md shadow-sm text-foreground bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none disabled:opacity-50"
                >
                  <Square className="w-4 h-4 mr-2" />
                  {isSending ? 'Stopping...' : 'Stop Stream'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
