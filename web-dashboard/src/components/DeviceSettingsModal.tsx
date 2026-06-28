import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Save, Volume2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

type DeviceSettingsModalProps = {
  isOpen: boolean
  onClose: () => void
  device: {
    id: string
    name: string
    volume?: number | null
  } | null
  onUpdate: () => void
}

export function DeviceSettingsModal({ isOpen, onClose, device, onUpdate }: DeviceSettingsModalProps) {
  const { schoolId } = useAuth()
  const [volume, setVolume] = useState<number>(21)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (device?.volume !== undefined && device.volume !== null) {
      setVolume(device.volume)
    } else {
      setVolume(21)
    }
  }, [device])

  if (!isOpen || !device) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (!schoolId) throw new Error('No school ID found')

      // 1. Update database
      const { error: dbError } = await supabase
        .from('bell_devices')
        .update({ volume: volume })
        .eq('id', device.id)

      if (dbError) {
        console.error('Error updating volume in DB:', dbError)
      }

      // 2. Send Command to Device
      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert({
          device_id: device.id,
          school_id: schoolId,
          command: 'SET_VOLUME',
          payload: { volume: volume }
        })

      if (cmdError) throw cmdError

      onUpdate()
      onClose()
    } catch (err) {
      console.error('Error saving settings:', err)
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-card text-foreground p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Device Settings: {device.name}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4 rounded-lg bg-muted p-4">
            <h4 className="font-medium text-foreground flex items-center gap-2">
              <Volume2 className="h-4 w-4" />
              Volume Control
            </h4>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Current Level: {volume}
              </label>
              <input
                type="range"
                min="0"
                max="30"
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                className="h-2 w-full cursor-pointer rounded-lg appearance-none bg-blue-200"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Mute (0)</span>
                <span>Max (30)</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Standard volume is usually around 20-25.
              </p>
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
              Close
            </button>
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={isLoading}
            >
              <Save className="mr-2 h-4 w-4" />
              {isLoading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
