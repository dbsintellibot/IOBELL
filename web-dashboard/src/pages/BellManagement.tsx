import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Wifi, WifiOff, Settings, RefreshCw, Bell } from 'lucide-react'
import { DeviceRegistrationModal } from '../components/DeviceRegistrationModal'
import { DeviceSettingsModal } from '../components/DeviceSettingsModal'
import { useAuth } from '@/hooks/useAuth'

type DeviceRecord = {
  id: string
  name: string
  status: string | null
  mac_address: string | null
  last_heartbeat: string | null
  volume?: number | null
  input_voltage_mv?: number | null
  location_area?: string | null
  location_city?: string | null
  location_country?: string | null
}

const ONLINE_TIMEOUT_MS = 5 * 60 * 1000

function resolveDeviceStatus(status: string | null, last_heartbeat: string | null) {
  if (last_heartbeat) {
    const last = new Date(last_heartbeat).getTime()
    if (!Number.isNaN(last)) {
      const diff = Date.now() - last
      if (diff <= ONLINE_TIMEOUT_MS) {
        return { label: 'online', isOnline: true }
      }
      return { label: 'offline', isOnline: false }
    }
  }
  if (status) {
    return { label: status, isOnline: status === 'online' }
  }
  return { label: 'unknown', isOnline: false }
}

export default function BellManagement() {
  const { schoolId } = useAuth()
  const queryClient = useQueryClient()
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const { data: devices, isLoading } = useQuery<DeviceRecord[]>({
    queryKey: ['devices', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from('bell_devices').select('*').order('name')
      if (error) {
        console.error("Error fetching devices:", error)
        throw error
      }
      return (data ?? []) as DeviceRecord[]
    },
    enabled: !!schoolId,
    refetchInterval: 15000 // Refresh every 15 seconds to catch heartbeats
  })

  const registerDeviceMutation = useMutation({
    mutationFn: async (newDevice: { name: string; serial_number: string }) => {
      if (!schoolId) {
        throw new Error('You must be logged in with a valid school ID to register devices.')
      }

      const { error } = await supabase.rpc('claim_device', {
        p_serial_number: newDevice.serial_number,
        p_device_name: newDevice.name
      })
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setIsRegisterModalOpen(false)
      setNotification({ type: 'success', message: 'Device registered successfully!' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      console.error('Error registering device:', error)
      setNotification({ type: 'error', message: error instanceof Error ? error.message : 'Failed to register device. Please try again.' })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const sendCommandMutation = useMutation({
    mutationFn: async ({ deviceId, command, payload = {} }: { deviceId: string, command: string, payload?: Record<string, unknown> }) => {
      if (!schoolId) throw new Error('No school ID found')
      
      const { error } = await supabase.from('command_queue').insert({
        device_id: deviceId,
        school_id: schoolId,
        command,
        payload
      })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      setNotification({ type: 'success', message: `Command ${variables.command} sent successfully!` })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      console.error('Error sending command:', error)
      const message =
        error instanceof Error && error.message.includes('Test commands are disabled during quiet hours')
          ? 'Test commands are disabled during quiet hours.'
          : 'Failed to send command. Please try again.'
      setNotification({ type: 'error', message })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  if (isLoading) {
    return <div className="text-muted-foreground">Loading devices...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Bell Management</h2>
        <button 
          onClick={() => setIsRegisterModalOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Register New Device
        </button>
      </div>

      {notification && (
        <div className={`p-4 rounded-md ${notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20'}`}>
          {notification.message}
        </div>
      )}

      {(!devices || devices.length === 0) ? (
        <div className="rounded-lg border border-dashed border-border bg-card text-foreground p-6 text-center text-muted-foreground">
          No devices found. Register a new device to get started.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => {
            const statusInfo = resolveDeviceStatus(device.status, device.last_heartbeat)
            return (
            <div key={device.id} className="flex h-full flex-col justify-between rounded-lg border bg-card text-foreground p-4 shadow-sm">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{device.name || 'Unnamed Device'}</div>
                    <div className="text-xs text-muted-foreground break-all">{device.id}</div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      statusInfo.isOnline ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive dark:text-red-400'
                    }`}
                  >
                    {statusInfo.isOnline ? (
                      <Wifi className="mr-1 h-3 w-3" />
                    ) : (
                      <WifiOff className="mr-1 h-3 w-3" />
                    )}
                    {statusInfo.label.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <div className="truncate">MAC: {device.mac_address || 'N/A'}</div>
                  <div>Last seen: {device.last_heartbeat ? new Date(device.last_heartbeat).toLocaleString() : 'Never'}</div>
                  <div>
                    Input power:{' '}
                    {typeof device.input_voltage_mv === 'number'
                      ? `${(device.input_voltage_mv / 1000).toFixed(2)} V`
                      : 'N/A'}
                  </div>
                    <div>
                      Location:{' '}
                      {device.location_area || device.location_city || device.location_country
                        ? [device.location_area, device.location_city, device.location_country].filter(Boolean).join(', ')
                        : 'Unknown'}
                    </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setSelectedDevice(device)
                      setIsSettingsModalOpen(true)
                    }}
                    className="inline-flex items-center justify-center rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    <Settings className="mr-1 h-4 w-4" />
                    Settings
                  </button>
                  <button
                    onClick={() => sendCommandMutation.mutate({ deviceId: device.id, command: 'CONFIG' })}
                    className="inline-flex items-center justify-center rounded-md bg-muted px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/80 disabled:opacity-50"
                    disabled={sendCommandMutation.isPending}
                  >
                    <RefreshCw className="mr-1 h-4 w-4" />
                    Sync
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const confirmed = window.confirm('Reboot this device now? Current audio will stop and the bell controller will restart.')
                      if (!confirmed) return
                      sendCommandMutation.mutate({ deviceId: device.id, command: 'REBOOT' })
                    }}
                    className="inline-flex items-center justify-center rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive dark:text-red-400 hover:bg-destructive/20 disabled:opacity-50"
                    disabled={sendCommandMutation.isPending}
                  >
                    <RefreshCw className="mr-1 h-4 w-4" />
                    Reboot
                  </button>
                  <button
                    onClick={() => {
                      const confirmed = window.confirm('Run a buzzer test on this device? This will briefly ring the buzzer at its location.')
                      if (!confirmed) return
                      sendCommandMutation.mutate({ deviceId: device.id, command: 'TEST_BUZZER' })
                    }}
                    className="inline-flex items-center justify-center rounded-md bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-500 hover:bg-amber-500/20 disabled:opacity-50"
                    disabled={sendCommandMutation.isPending}
                  >
                    <Bell className="mr-1 h-4 w-4" />
                    Test Buzzer
                  </button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}
      
      <DeviceRegistrationModal 
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onRegister={async (data) => {
          await registerDeviceMutation.mutateAsync(data)
        }}
      />

      <DeviceSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => {
          setIsSettingsModalOpen(false)
          setSelectedDevice(null)
        }}
        device={selectedDevice}
        onUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ['devices'] })
          setNotification({ type: 'success', message: 'Device settings updated successfully!' })
          setTimeout(() => setNotification(null), 3000)
        }}
      />
    </div>
  )
}
