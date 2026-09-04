import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { 
  Volume2, 
  Play, 
  Square, 
  Trash2, 
  Upload, 
  Plus, 
  Music, 
  Check, 
  Loader2, 
  Sparkles,
  AlertCircle,
  Clock
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { validateAudioFileSize } from '@/lib/audioCompressor'
import { AudioCompressionModal } from '@/components/AudioCompressionModal'

export interface PreAnnouncementSound {
  id: string
  title: string
  file_url: string
  file_path: string
  duration_ms: number
  is_active: boolean
  created_at: string
}

export default function PreAnnouncementManagement() {
  const queryClient = useQueryClient()
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Upload modal & form state
  const [isUploading, setIsUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showCompressModal, setShowCompressModal] = useState(false)
  const [oversizedKb, setOversizedKb] = useState(0)

  // Fetch Pre-Announcement Library
  const { data: sounds = [], isLoading, error } = useQuery<PreAnnouncementSound[]>({
    queryKey: ['pre_announcement_sounds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pre_announcement_sounds')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data || []
    }
  })

  // Delete sound mutation
  const deleteMutation = useMutation({
    mutationFn: async (sound: PreAnnouncementSound) => {
      // 1. Call manage RPC to delete DB record
      const { data, error } = await supabase.rpc('manage_pre_announcement_sound', {
        p_action: 'DELETE',
        p_id: sound.id
      })
      if (error) throw error

      // 2. Remove file from storage bucket if path exists
      if (sound.file_path) {
        await supabase.storage.from('pre-announcements').remove([sound.file_path])
      }

      return data
    },
    onSuccess: () => {
      toast.success('Pre-announcement sound deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['pre_announcement_sounds'] })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete pre-announcement sound')
    }
  })

  // Upload sound function
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      toast.error('Please select an MP3 audio file')
      return
    }
    if (!title.trim()) {
      toast.error('Please enter a sound title')
      return
    }
    if (sounds.length >= 10) {
      toast.error('Library full: Maximum of 10 pre-announcement sounds allowed')
      return
    }

    const { isOverLimit, sizeKb } = validateAudioFileSize(file, 70)
    if (isOverLimit) {
      setOversizedKb(sizeKb)
      setShowCompressModal(true)
      return
    }

    try {
      setIsUploading(true)

      const fileExt = file.name.split('.').pop() || 'mp3'
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`
      const filePath = `library/${fileName}`

      // 1. Upload to Supabase storage bucket
      const { error: uploadError } = await supabase.storage
        .from('pre-announcements')
        .upload(filePath, file, { contentType: file.type || 'audio/mpeg', upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('pre-announcements')
        .getPublicUrl(filePath)

      const fileUrl = publicUrlData.publicUrl

      // Get audio duration using Audio element
      let durationMs = 0
      try {
        const audioObj = new Audio(URL.createObjectURL(file))
        await new Promise((resolve) => {
          audioObj.onloadedmetadata = () => {
            durationMs = Math.round(audioObj.duration * 1000)
            resolve(true)
          }
          audioObj.onerror = () => resolve(false)
        })
      } catch (err) {
        console.warn('Could not read audio duration:', err)
      }

      // 2. Call RPC to insert record
      const { error: rpcError } = await supabase.rpc('manage_pre_announcement_sound', {
        p_action: 'ADD',
        p_title: title.trim(),
        p_file_url: fileUrl,
        p_file_path: filePath,
        p_duration_ms: durationMs
      })

      if (rpcError) throw rpcError

      toast.success('Pre-announcement sound uploaded successfully!')
      setTitle('')
      setFile(null)
      setShowUploadModal(false)
      queryClient.invalidateQueries({ queryKey: ['pre_announcement_sounds'] })
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error uploading pre-announcement sound')
    } finally {
      setIsUploading(false)
    }
  }

  // Audio preview toggle
  const togglePlay = (sound: PreAnnouncementSound) => {
    if (playingId === sound.id) {
      audioRef.current?.pause()
      setPlayingId(null)
    } else {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      const newAudio = new Audio(sound.file_url)
      newAudio.onended = () => setPlayingId(null)
      newAudio.play().catch(e => {
        console.error('Audio play error:', e)
        toast.error('Unable to play audio preview')
        setPlayingId(null)
      })
      audioRef.current = newAudio
      setPlayingId(sound.id)
    }
  }

  const formatDuration = (ms: number) => {
    if (!ms || ms <= 0) return '0s'
    const totalSec = Math.round(ms / 1000)
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/60 p-6 rounded-xl border border-border/80 backdrop-blur shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Volume2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Pre-Announcement Audio Library</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage global pre-announcement chimes available to all school admins (3 to 10 sounds supported).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/60 px-3 py-1.5 rounded-lg border border-border text-sm font-medium">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>Library Status: <strong className="text-primary">{sounds.length} / 10</strong></span>
          </div>

          <button
            onClick={() => setShowUploadModal(true)}
            disabled={sounds.length >= 10}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors shadow-sm",
              sounds.length >= 10 
                ? "bg-muted text-muted-foreground cursor-not-allowed" 
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <Plus className="h-4 w-4" />
            Upload Sound
          </button>
        </div>
      </div>

      {/* Library Rules Notice */}
      {sounds.length < 3 && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>Recommended minimum of <strong>3 pre-announcement sounds</strong> for school admins to choose from. Currently {sounds.length} uploaded.</span>
        </div>
      )}

      {/* Sounds Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="p-6 text-center text-destructive bg-destructive/10 rounded-xl border border-destructive/20">
          Failed to load pre-announcement sounds library.
        </div>
      ) : sounds.length === 0 ? (
        <div className="text-center p-12 bg-card/40 rounded-xl border border-dashed border-border">
          <Music className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
          <h3 className="text-base font-semibold">No Pre-Announcement Sounds</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
            Upload audio files to populate the global chime library for all schools.
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Upload className="h-4 w-4" />
            Upload First Sound
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sounds.map((sound) => {
            const isPlaying = playingId === sound.id
            return (
              <div 
                key={sound.id}
                className="group relative flex flex-col justify-between bg-card hover:bg-accent/40 transition-all duration-200 p-5 rounded-xl border border-border/80 shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <Music className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground text-base line-clamp-1">{sound.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatDuration(sound.duration_ms)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Player Controls & Action buttons */}
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50">
                  <button
                    onClick={() => togglePlay(sound)}
                    className={cn(
                      "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      isPlaying 
                        ? "bg-destructive text-destructive-foreground" 
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    )}
                  >
                    {isPlaying ? (
                      <>
                        <Square className="h-3.5 w-3.5 fill-current" />
                        Stop Preview
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Play Preview
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete "${sound.title}"?`)) {
                        deleteMutation.mutate(sound)
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    title="Delete Sound"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Upload Pre-Announcement Sound
              </h2>
              <button 
                onClick={() => setShowUploadModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Sound Title</label>
                <input
                  type="text"
                  placeholder="e.g. Gentle Chime / Soft Bell Jingle"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">MP3 Audio File</label>
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg,audio/wav"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Recommended short MP3 chime (1-5 seconds duration).</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isUploading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Upload & Save
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AudioCompressionModal
        isOpen={showCompressModal}
        onClose={() => setShowCompressModal(false)}
        fileSizeKb={oversizedKb}
      />
    </div>
  )
}
