import { useState, useRef } from 'react'
import { Upload, Play, Pause, Trash2, Music, Loader2, HardDrive, CheckCircle2, BellRing, ShieldCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { validateAudioFileSize } from '@/lib/audioCompressor'
import { AudioCompressionModal } from '@/components/AudioCompressionModal'
import { EmptyState } from '@/components/ui/empty-state'

type AudioFileRecord = {
  id: string
  name: string
  storage_path: string
  created_at: string
  duration: number | null
  school_id: string
}

type AudioFileItem = AudioFileRecord & {
  url: string
  size: string
}

type PreAnnouncementSound = {
  id: string
  name: string
  description: string | null
  file_url: string
  duration_seconds: number | null
  is_active: boolean
}

export default function AudioManager() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { schoolId } = useAuth()
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [showCompressModal, setShowCompressModal] = useState(false)
  const [oversizedKb, setOversizedKb] = useState(0)

  // 1. Fetch User Audio Manager Files
  const { data: files = [], isError, error } = useQuery<AudioFileItem[]>({
    queryKey: ['audio_files', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audio_files')
        .select('*')
        .not('storage_path', 'ilike', 'combined/%')
        .order('created_at', { ascending: false })
        .abortSignal(AbortSignal.timeout(10000))

      if (error) {
        console.error("Error fetching audio files:", error)
        throw error
      }
      
      const records = (data ?? []) as AudioFileRecord[]

      return records.map(file => {
        const { data: { publicUrl } } = supabase.storage.from('audio-files').getPublicUrl(file.storage_path)
        return {
          ...file,
          url: publicUrl,
          size: 'Unknown' 
        }
      })
    }
  })

  // 2. Fetch School Pre-Announcement Chime Configuration
  const { data: preChimeConfig } = useQuery<{
    enabled: boolean
    chime: PreAnnouncementSound | null
    delaySeconds: number
  }>({
    queryKey: ['school_pre_chime_info', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: schoolData, error: schoolErr } = await supabase
        .from('schools')
        .select('default_pre_announcement_id, pre_announcement_enabled, pre_announcement_delay_seconds')
        .eq('id', schoolId)
        .single()

      if (schoolErr) {
        console.warn("Could not fetch school pre-announcement settings:", schoolErr)
      }

      const isEnabled = schoolData?.pre_announcement_enabled ?? true
      const defaultId = schoolData?.default_pre_announcement_id
      const delay = schoolData?.pre_announcement_delay_seconds ?? 3

      let selectedChime: PreAnnouncementSound | null = null

      if (defaultId) {
        const { data: chimeData } = await supabase
          .from('pre_announcement_sounds')
          .select('*')
          .eq('id', defaultId)
          .single()
        if (chimeData) selectedChime = chimeData as PreAnnouncementSound
      }

      if (!selectedChime) {
        const { data: fallbackChime } = await supabase
          .from('pre_announcement_sounds')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (fallbackChime) selectedChime = fallbackChime as PreAnnouncementSound
      }

      return {
        enabled: isEnabled,
        chime: selectedChime,
        delaySeconds: delay
      }
    }
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!schoolId) throw new Error("No school ID found")
      setUploading(true)
      try {
        const fileExt = file.name.split('.').pop() || 'mp3'
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `${schoolId}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('audio-files')
          .upload(filePath, file, {
            contentType: file.type || 'audio/mpeg',
            upsert: true
          })

        if (uploadError) throw uploadError

        const { error: dbError } = await supabase
          .from('audio_files')
          .insert({
            name: file.name,
            storage_path: filePath,
            school_id: schoolId,
            duration: 0
          })

        if (dbError) throw dbError

      } finally {
        setUploading(false)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio_files'] })
      setNotification({ type: 'success', message: 'Audio file uploaded and queued for AutoBell offline caching.' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      console.error('Upload failed:', error)
      setNotification({ type: 'error', message: 'Failed to upload audio file' })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (file: AudioFileItem) => {
      const { error: storageError } = await supabase.storage
        .from('audio-files')
        .remove([file.storage_path])

      if (storageError) {
        console.warn("Storage delete error:", storageError)
      }

      const { error: dbError } = await supabase
        .from('audio_files')
        .delete()
        .eq('id', file.id)

      if (dbError) throw dbError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio_files'] })
      setNotification({ type: 'success', message: 'Audio file deleted successfully.' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      console.error('Delete failed:', error)
      setNotification({ type: 'error', message: 'Failed to delete audio file' })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const { isOverLimit, sizeKb } = validateAudioFileSize(file, 70)
      if (isOverLimit) {
        setOversizedKb(sizeKb)
        setShowCompressModal(true)
        event.target.value = ''
        return
      }
      uploadMutation.mutate(file)
    }
  }

  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handlePlay = (id: string, url: string) => {
    if (playing === id) {
      audioRef.current?.pause()
      setPlaying(null)
    } else {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      audioRef.current = new Audio(url)
      audioRef.current.onended = () => setPlaying(null)
      audioRef.current.onerror = (err) => {
        console.error("Audio playback error:", err)
        setPlaying(null)
      }
      audioRef.current.play().catch((err) => {
        console.error("Audio play promise rejected:", err)
        setPlaying(null)
      })
      setPlaying(id)
    }
  }

  const totalOfflineFiles = files.length + (preChimeConfig?.chime ? 1 : 0)

  return (
    <div className="space-y-6">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Music className="h-6 w-6 text-primary" />
            Audio Manager & Offline Cache
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage audio tracks and inspect files permanently downloaded onto your AutoBell device.
          </p>
        </div>

        {isError && (
          <div className="text-sm text-destructive dark:text-red-400">
            Error loading files: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="audio/*"
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-primary shrink-0"
          aria-label="Upload new audio file"
        >
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {uploading ? 'Uploading...' : 'Upload New Audio'}
        </button>
      </div>

      {notification && (
        <div className={`p-4 rounded-xl ${notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20'}`}>
          {notification.message}
        </div>
      )}

      {/* Offline Hardware Cache Overview Card */}
      <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/5 via-card to-card p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              <HardDrive className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">
                  Permanent Hardware Storage (LittleFS)
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  100% Offline Ready
                </span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
                All media shown below are automatically downloaded and stored permanently on your AutoBell hardware. Your scheduled bells, custom tones, and pre-announcement chimes ring on time with zero delay — even if the internet goes down.
              </p>
            </div>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 shrink-0 self-start lg:self-center bg-card/80 border border-border/70 rounded-xl px-4 py-3">
            <div className="text-right">
              <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {totalOfflineFiles}
              </div>
              <div className="text-xs text-muted-foreground">
                Cached Files on Hardware
              </div>
            </div>
          </div>
        </div>

        {/* Pre-Announcement Chime Offline Box */}
        {preChimeConfig?.chime && (
          <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <BellRing className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Pre-Announcement Chime
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.2 rounded-md">
                    <CheckCircle2 className="h-3 w-3" />
                    Cached on Device
                  </span>
                </div>
                <div className="text-sm font-semibold text-foreground truncate mt-0.5">
                  {preChimeConfig.chime.name}
                  {preChimeConfig.chime.description && (
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      ({preChimeConfig.chime.description})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handlePlay('chime-active', preChimeConfig.chime!.file_url)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted border border-border shadow-sm transition-colors"
                aria-label={playing === 'chime-active' ? 'Pause chime preview' : 'Play chime preview'}
              >
                {playing === 'chime-active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing === 'chime-active' ? 'Pause' : 'Preview Chime'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audio Manager Files Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            Custom Uploaded Bell Audio ({files.length})
          </h3>
        </div>

        {files.length === 0 ? (
          <EmptyState
            icon={Music}
            title="No Custom Audio Files Uploaded"
            description="Upload MP3 chime files or period tones to attach to scheduled bells and broadcast announcements."
            actionLabel="Upload Your First Audio File"
            onAction={() => fileInputRef.current?.click()}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((file) => (
              <div key={file.id} className="relative flex flex-col justify-between rounded-xl border border-border bg-card text-foreground p-5 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex items-center min-w-0 flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                      <Music className="h-5 w-5" />
                    </div>
                    <div className="ml-3 min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-foreground truncate" title={file.name}>{file.name}</h3>
                      <p className="text-xs text-muted-foreground">{new Date(file.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                {/* Permanent Offline Cache Badge */}
                <div className="mt-3.5 pt-3 border-t border-border/50">
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md w-full truncate">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate">Downloaded on AutoBell (Offline)</span>
                  </div>
                </div>
                
                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                  <button 
                    onClick={() => handlePlay(file.id, file.url)}
                    className="flex items-center justify-center rounded-full bg-muted p-2 text-foreground hover:bg-primary/15 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label={playing === file.id ? `Pause ${file.name}` : `Play preview of ${file.name}`}
                  >
                    {playing === file.id ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </button>
                  <button 
                    onClick={() => deleteMutation.mutate(file)}
                    className="p-2 text-muted-foreground hover:text-destructive transition-colors focus:outline-none focus:ring-2 focus:ring-destructive rounded-lg"
                    aria-label={`Delete ${file.name}`}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
            
            {/* Upload Card */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-input p-6 text-center hover:border-primary hover:bg-muted/30 cursor-pointer transition-all min-h-[160px]"
              tabIndex={0}
              role="button"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
              aria-label="Click or press enter to upload audio file"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="mt-2 block text-sm font-medium text-foreground">
                Drop audio files here
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                or click to browse MP3
              </span>
            </div>
          </div>
        )}
      </div>

      <AudioCompressionModal
        isOpen={showCompressModal}
        onClose={() => setShowCompressModal(false)}
        fileSizeKb={oversizedKb}
      />
    </div>
  )
}
