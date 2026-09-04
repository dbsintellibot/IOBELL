import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Save, Volume2, Calendar, BellRing, Play, Pause, Cpu, Upload } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

type BellProfileOption = {
  id: string
  name: string
  is_active: boolean
}

type PreAnnouncementSoundOption = {
  id: string
  title: string
  file_url: string
}

type DeviceRecord = {
  id: string
  name: string
  volume?: number | null
  profile_id?: string | null
  pre_announcement_enabled?: boolean | null
  pre_announcement_id?: string | null
  pre_announcement_delay_seconds?: number | null
  pre_announcement_volume?: number | null
  board_type?: string | null
}

type DeviceSettingsModalProps = {
  isOpen: boolean
  onClose: () => void
  device: DeviceRecord | null
  onUpdate: () => void
}

export function DeviceSettingsModal({ isOpen, onClose, device, onUpdate }: DeviceSettingsModalProps) {
  const { schoolId } = useAuth()
  const [volume, setVolume] = useState<number>(21)
  
  // Profile Assignment State
  const [profileId, setProfileId] = useState<string>('INHERIT')
  const [profiles, setProfiles] = useState<BellProfileOption[]>([])

  // Pre-Announcement Override State
  const [useCustomPa, setUseCustomPa] = useState<boolean>(false)
  const [paEnabled, setPaEnabled] = useState<boolean>(true)
  const [paSoundId, setPaSoundId] = useState<string>('')
  const [paDelay, setPaDelay] = useState<number>(3)
  const [paSounds, setPaSounds] = useState<PreAnnouncementSoundOption[]>([])
  const [schoolDefaultSoundTitle, setSchoolDefaultSoundTitle] = useState<string>('')

  // Audio playback preview state
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // OTA Firmware Update State
  const [otaUrl, setOtaUrl] = useState<string>('')
  const [isOtaUploading, setIsOtaUploading] = useState<boolean>(false)
  const [isOtaSending, setIsOtaSending] = useState<boolean>(false)

  const handleOtaFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.bin')) {
      setError('Please select a valid .bin firmware file')
      return
    }
    setIsOtaUploading(true)
    setError(null)
    try {
      const fileName = `firmware_${Date.now()}.bin`
      const { error: uploadErr } = await supabase.storage
        .from('firmware')
        .upload(fileName, file, { contentType: 'application/octet-stream', upsert: true })

      if (uploadErr) {
        // Fallback to voice-notes bucket (which has open insert policy and no UUID prefix check)
        const { error: fallbackErr } = await supabase.storage
          .from('voice-notes')
          .upload(fileName, file, { contentType: 'application/octet-stream', upsert: true })
        if (fallbackErr) throw uploadErr
        const { data } = supabase.storage.from('voice-notes').getPublicUrl(fileName)
        setOtaUrl(data.publicUrl)
      } else {
        const { data } = supabase.storage.from('firmware').getPublicUrl(fileName)
        setOtaUrl(data.publicUrl)
      }
      setSuccess('Firmware uploaded successfully! Click "Send OTA Update" to flash.')
    } catch (err: any) {
      setError(err.message || 'Failed to upload firmware file')
    } finally {
      setIsOtaUploading(false)
    }
  }

  const handleSendOta = async () => {
    if (!device || !otaUrl.trim()) return
    setIsOtaSending(true)
    setError(null)
    setSuccess(null)
    try {
      const { error: cmdErr } = await supabase
        .from('command_queue')
        .insert({
          device_id: device.id,
          command: 'UPDATE_FIRMWARE',
          payload: { url: otaUrl.trim() },
          status: 'pending'
        })
      if (cmdErr) throw cmdErr
      setSuccess('OTA Update command queued! Device will update and reboot shortly.')
    } catch (err: any) {
      setError(err.message || 'Failed to queue OTA update command')
    } finally {
      setIsOtaSending(false)
    }
  }

  // Clean up audio on unmount or close
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
        previewAudioRef.current = null
      }
    }
  }, [])

  // Fetch available profiles and pre-announcement sounds
  useEffect(() => {
    if (!isOpen || !schoolId) return

    const fetchData = async () => {
      // 1. Fetch School Profiles
      const { data: profileData } = await supabase
        .from('bell_profiles')
        .select('id, name, is_active, board_type')
        .eq('school_id', schoolId)
        .order('name')
      
      const filteredProfiles = (profileData || []).filter(p => {
        const devType = device?.board_type || 'ESP32-S3 N16R8'
        const profType = p.board_type || 'ESP32-S3 N16R8'
        return profType === devType
      })
      setProfiles(filteredProfiles as BellProfileOption[])

      // 2. Fetch Pre-Announcement Sounds (correct column: title)
      const { data: soundData } = await supabase
        .from('pre_announcement_sounds')
        .select('id, title, file_url')
        .eq('is_active', true)
        .order('created_at')
      setPaSounds(soundData || [])

      // 3. Fetch School's default pre-announcement sound
      const { data: schoolData } = await supabase
        .from('schools')
        .select('default_pre_announcement_id')
        .eq('id', schoolId)
        .single()

      if (schoolData?.default_pre_announcement_id && soundData) {
        const def = soundData.find(s => s.id === schoolData.default_pre_announcement_id)
        if (def) setSchoolDefaultSoundTitle(def.title)
      }
    }

    fetchData()
  }, [isOpen, schoolId])

  useEffect(() => {
    if (device) {
      setVolume(device.volume ?? 21)
      setProfileId(device.profile_id || 'INHERIT')

      const hasCustomPa = 
        device.pre_announcement_enabled !== null || 
        device.pre_announcement_id !== null || 
        device.pre_announcement_delay_seconds !== null

      setUseCustomPa(!!hasCustomPa)
      setPaEnabled(device.pre_announcement_enabled ?? true)
      setPaSoundId(device.pre_announcement_id || '')
      setPaDelay(device.pre_announcement_delay_seconds ?? 3)
    }
  }, [device])

  if (!isOpen || !device) return null

  const handlePreviewSound = () => {
    if (isPlayingPreview) {
      previewAudioRef.current?.pause()
      setIsPlayingPreview(false)
      return
    }

    let urlToPlay = ''
    if (paSoundId) {
      const selected = paSounds.find(s => s.id === paSoundId)
      urlToPlay = selected?.file_url || ''
    } else if (paSounds.length > 0) {
      urlToPlay = paSounds[0].file_url
    }

    if (!urlToPlay) return

    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
    }

    const audio = new Audio(urlToPlay)
    audio.onended = () => setIsPlayingPreview(false)
    audio.onerror = () => setIsPlayingPreview(false)
    audio.play().catch(() => setIsPlayingPreview(false))
    previewAudioRef.current = audio
    setIsPlayingPreview(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      setIsPlayingPreview(false)
    }

    try {
      if (!schoolId) throw new Error('No school ID found')

      const targetProfileId = profileId === 'INHERIT' ? null : profileId

      // Build updates object
      const isMini = device.board_type === 'ESP32-C3 Mini'
      const updates = {
        volume: isMini ? null : volume,
        profile_id: targetProfileId,
        pre_announcement_enabled: isMini ? null : (useCustomPa ? paEnabled : null),
        pre_announcement_id: isMini ? null : (useCustomPa && paSoundId ? paSoundId : null),
        pre_announcement_delay_seconds: isMini ? null : (useCustomPa ? paDelay : null),
      }

      // 1. Update bell_devices table
      const { error: dbError } = await supabase
        .from('bell_devices')
        .update(updates)
        .eq('id', device.id)

      if (dbError) throw dbError

      // 2. Send Command Queue entry to trigger config re-sync on device
      const commands = [
        ...(isMini ? [] : [{
          device_id: device.id,
          command: 'SET_VOLUME',
          payload: { volume: volume }
        }]),
        {
          device_id: device.id,
          command: 'SYNC_SCHEDULES',
          payload: { source: 'device_settings_modal' }
        }
      ]

      const { error: cmdError } = await supabase.from('command_queue').insert(commands)
      if (cmdError) throw cmdError

      onUpdate()
      onClose()
    } catch (err) {
      console.error('Error saving device settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-card text-foreground p-6 shadow-xl max-h-[90vh] overflow-y-auto space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Device Settings: {device.name}</h3>
            <p className="text-xs text-muted-foreground">Configure schedule profile, volume, and pre-announcement chimes.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Profile Assignment Section */}
          <div className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-4">
            <h4 className="font-medium text-foreground flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-primary" />
              Schedule Profile Assignment
            </h4>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Active Profile for this Bell
              </label>
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none"
              >
                <option value="INHERIT">✨ Inherit School Active Profile (Default)</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    📋 {p.name} {p.is_active ? '(School Active)' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Selecting a specific profile allows this bell unit to run a custom schedule independently from other school bells.
              </p>
            </div>
          </div>

          {device.board_type !== 'ESP32-C3 Mini' && (
            <>
              {/* Volume Control Section */}
              <div className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-4">
                <h4 className="font-medium text-foreground flex items-center gap-2 text-sm">
                  <Volume2 className="h-4 w-4 text-primary" />
                  Volume Control
                </h4>
                <div>
                  <label className="mb-2 block text-xs font-medium text-muted-foreground flex justify-between">
                    <span>Current Level: <b>{volume} / 21</b></span>
                    <span className="text-[11px] text-primary font-medium">
                      {volume === 0 ? 'Muted' : volume <= 7 ? 'Low' : volume <= 15 ? 'Medium' : volume <= 20 ? 'High' : 'Maximum'}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="21"
                    value={volume}
                    onChange={(e) => setVolume(parseInt(e.target.value))}
                    className="h-2 w-full cursor-pointer rounded-lg appearance-none bg-primary/20 accent-primary"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>Mute (0)</span>
                    <span>Max (21)</span>
                  </div>
                </div>
              </div>

              {/* Pre-Announcement Override Section */}
              <div className="space-y-4 rounded-lg border border-border/80 bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-foreground flex items-center gap-2 text-sm">
                    <BellRing className="h-4 w-4 text-primary" />
                    Pre-Announcement Chime
                  </h4>
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomPa}
                      onChange={(e) => setUseCustomPa(e.target.checked)}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                    />
                    Custom Chime Override
                  </label>
                </div>

                {!useCustomPa ? (
                  <p className="text-xs text-muted-foreground italic">
                    Using global chime settings configured in <b>School Settings</b>.
                  </p>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">Play Chime Before Bells & TTS</span>
                      <input
                        type="checkbox"
                        checked={paEnabled}
                        onChange={(e) => setPaEnabled(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                      />
                    </div>

                    {paEnabled && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Selected Chime Jingle
                          </label>
                          <div className="flex gap-2 items-center">
                            <select
                              value={paSoundId}
                              onChange={(e) => setPaSoundId(e.target.value)}
                              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none"
                            >
                              <option value="">
                                {schoolDefaultSoundTitle 
                                  ? `-- School Default (${schoolDefaultSoundTitle}) --` 
                                  : '-- School Default Sound --'}
                              </option>
                              {paSounds.map(s => (
                                <option key={s.id} value={s.id}>
                                  🎵 {s.title}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={handlePreviewSound}
                              className="p-2 rounded-md border border-input bg-background hover:bg-muted text-primary transition-colors focus:outline-none"
                              title="Preview chime sound"
                            >
                              {isPlayingPreview ? (
                                <Pause className="h-4 w-4 text-destructive" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Pre-Announcement Delay: {paDelay} second(s)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={paDelay}
                            onChange={(e) => setPaDelay(parseInt(e.target.value) || 3)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* OTA Firmware Update Panel */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Cpu className="h-4 w-4" />
              <span className="text-sm font-semibold">OTA Firmware Update</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Select a <code>firmware.bin</code> file or paste a public URL to flash this device wirelessly over the air.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="file"
                accept=".bin"
                onChange={handleOtaFileUpload}
                className="hidden"
                id="device-modal-ota-input"
              />
              <label
                htmlFor="device-modal-ota-input"
                className="inline-flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent shrink-0"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {isOtaUploading ? 'Uploading...' : 'Choose .bin File'}
              </label>
              <input
                type="text"
                placeholder="https://.../firmware.bin"
                value={otaUrl}
                onChange={(e) => setOtaUrl(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground shadow-sm focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSendOta}
                disabled={!otaUrl.trim() || isOtaSending || isOtaUploading}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
              >
                {isOtaSending ? 'Queuing...' : 'Send OTA Update'}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              {success}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={isLoading}
            >
              <Save className="mr-2 h-4 w-4" />
              {isLoading ? 'Saving...' : 'Save Device Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
