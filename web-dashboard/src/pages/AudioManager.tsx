import { useState, useRef } from 'react'
import { Upload, Play, Pause, Trash2, Music, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export default function AudioManager() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { schoolId } = useAuth()

  const { data: files = [] } = useQuery({
    queryKey: ['audio_files'],
    queryFn: async () => {
        const { data, error } = await supabase.from('audio_files').select('*').order('created_at', { ascending: false })
        if (error) {
            console.warn("Error fetching audio files:", error)
            return []
        }
        
        return data.map(file => {
            const { data: { publicUrl } } = supabase.storage.from('audio_files').getPublicUrl(file.storage_path)
            return {
                ...file,
                url: publicUrl,
                size: 'Unknown' 
            }
        })
    }
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!schoolId) throw new Error("No school ID found")
      setUploading(true)
      try {
        // 1. Upload file to storage
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `${schoolId}/${fileName}` // Use schoolId in path for organization

        const { error: uploadError } = await supabase.storage
          .from('audio_files')
          .upload(filePath, file)

        if (uploadError) throw uploadError

        // 2. Insert metadata into database
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
    },
    onError: (error) => {
      console.error('Upload failed:', error)
      alert('Failed to upload audio file')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (file: any) => {
      // 1. Delete from storage
      const { error: storageError } = await supabase.storage
        .from('audio_files')
        .remove([file.storage_path])

      if (storageError) {
          console.warn("Storage delete error:", storageError)
          // Continue to delete from DB even if storage fails (maybe orphan)
      }

      // 2. Delete from database
      const { error: dbError } = await supabase
        .from('audio_files')
        .delete()
        .eq('id', file.id)

      if (dbError) throw dbError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio_files'] })
    },
    onError: (error) => {
      console.error('Delete failed:', error)
      alert('Failed to delete audio file')
    }
  })

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
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
      audioRef.current.play()
      audioRef.current.onended = () => setPlaying(null)
      setPlaying(id)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Audio Manager</h2>
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
            className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {uploading ? 'Uploading...' : 'Upload New Audio'}
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((file) => (
          <div key={file.id} className="relative flex flex-col justify-between rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <Music className="h-5 w-5" />
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-gray-900 truncate max-w-[150px]" title={file.name}>{file.name}</h3>
                  <p className="text-xs text-gray-500">{file.size} • {new Date(file.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex items-center justify-between">
              <button 
                onClick={() => handlePlay(file.id, file.url)}
                className="flex items-center rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
              >
                {playing === file.id ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <button 
                onClick={() => deleteMutation.mutate(file)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        ))}
        
        {/* Upload Placeholder */}
        <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-gray-400 cursor-pointer"
        >
            <Upload className="h-10 w-10 text-gray-400" />
            <span className="mt-2 block text-sm font-medium text-gray-900">
                Drop audio files here
            </span>
             <span className="mt-1 block text-sm text-gray-500">
                or click to select
            </span>
        </div>
      </div>
    </div>
  )
}
