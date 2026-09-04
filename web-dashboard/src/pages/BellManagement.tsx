import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { 
  WifiOff, 
  Settings, 
  RefreshCw, 
  Bell, 
  Calendar, 
  BellRing, 
  Volume2, 
  VolumeX, 
  HardDrive, 
  ShieldCheck, 
  MessageCircle, 
  Clock, 
  AlertCircle,
  FileText
} from 'lucide-react'
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
  location_continent?: string | null
  profile_id?: string | null
  pre_announcement_enabled?: boolean | null
  pre_announcement_id?: string | null
  pre_announcement_delay_seconds?: number | null
  bell_profiles?: { name: string } | null
  board_type?: string | null
  activation_status?: string | null
  is_paid?: boolean | null
  activated_at?: string | null
  subscription_end_date?: string | null
  payment_reference?: string | null
  activation_notes?: string | null
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

function DeviceVolumeSlider({ 
  device, 
  onVolumeCommit 
}: { 
  device: DeviceRecord; 
  onVolumeCommit: (deviceId: string, volume: number) => void 
}) {
  const [localVol, setLocalVol] = useState<number>(device.volume ?? 21)

  useEffect(() => {
    setLocalVol(device.volume ?? 21)
  }, [device.volume])

  const commitVolume = (newVol: number) => {
    if (newVol !== (device.volume ?? 21)) {
      onVolumeCommit(device.id, newVol)
    }
  }

  return (
    <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          <Volume2 className="h-3.5 w-3.5 text-primary" />
          Bell Volume
        </span>
        <span className="font-mono font-bold text-primary">
          {localVol} / 21
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max="21"
          value={localVol}
          onChange={(e) => setLocalVol(parseInt(e.target.value))}
          onPointerUp={() => commitVolume(localVol)}
          onKeyUp={() => commitVolume(localVol)}
          className="h-2 flex-1 cursor-pointer rounded-lg appearance-none bg-primary/20 accent-primary"
          aria-label={`Adjust volume for ${device.name || 'device'}`}
        />
        <button
          onClick={() => {
            const newVol = localVol > 0 ? 0 : 21
            setLocalVol(newVol)
            onVolumeCommit(device.id, newVol)
          }}
          className={`p-1.5 rounded-md border transition-colors ${
            localVol === 0
              ? 'bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25'
              : 'bg-muted text-foreground border-border/50 hover:bg-muted/80'
          }`}
          title={localVol === 0 ? "Unmute bell" : "Mute bell"}
        >
          {localVol === 0 ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}

export default function BellManagement() {
  const { schoolId } = useAuth()
  const queryClient = useQueryClient()
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Payment Slip / Activation Request state
  const [deviceForSlip, setDeviceForSlip] = useState<DeviceRecord | null>(null)
  const [slipPaymentRef, setSlipPaymentRef] = useState('')
  const [slipNotes, setSlipNotes] = useState('')

  const { data: devices, isLoading } = useQuery<DeviceRecord[]>({
    queryKey: ['devices', schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bell_devices')
        .select('*, bell_profiles(name)')
        .order('name')
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
      setNotification({ type: 'success', message: 'Device registered successfully! First year free cloud subscription will activate upon order confirmation.' })
      setTimeout(() => setNotification(null), 5000)
    },
    onError: (error) => {
      console.error('Error registering device:', error)
      setNotification({ type: 'error', message: error instanceof Error ? error.message : 'Failed to register device. Please try again.' })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const submitSlipMutation = useMutation({
    mutationFn: async ({ deviceId, paymentRef, notes }: { deviceId: string; paymentRef: string; notes: string }) => {
      const { error } = await supabase.rpc('submit_activation_request', {
        p_device_id: deviceId,
        p_payment_reference: paymentRef,
        p_notes: notes || null
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setNotification({ type: 'success', message: 'Activation request submitted! Our support team will verify and activate your 1-Year Free subscription shortly.' })
      setTimeout(() => setNotification(null), 5000)
      setDeviceForSlip(null)
      setSlipPaymentRef('')
      setSlipNotes('')
    },
    onError: (error) => {
      console.error('Error submitting activation request:', error)
      setNotification({ type: 'error', message: error instanceof Error ? error.message : 'Failed to submit activation request.' })
      setTimeout(() => setNotification(null), 4000)
    }
  })

  const sendCommandMutation = useMutation({
    mutationFn: async ({ deviceId, command, payload = {} }: { deviceId: string, command: string, payload?: Record<string, unknown> }) => {
      if (!schoolId) throw new Error('No school ID found')
      
      const { error } = await supabase.from('command_queue').insert({
        device_id: deviceId,
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

  const updateVolumeMutation = useMutation({
    mutationFn: async ({ deviceId, volume }: { deviceId: string; volume: number }) => {
      if (!schoolId) throw new Error('No school ID found')

      const { error: dbError } = await supabase
        .from('bell_devices')
        .update({ volume })
        .eq('id', deviceId)

      if (dbError) throw dbError

      const { error: cmdError } = await supabase.from('command_queue').insert({
        device_id: deviceId,
        command: 'SET_VOLUME',
        payload: { volume }
      })

      if (cmdError) throw cmdError
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setNotification({ type: 'success', message: `Volume set to ${variables.volume}/21 for bell device.` })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      console.error('Error updating volume:', error)
      setNotification({ type: 'error', message: 'Failed to update volume. Please try again.' })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-muted rounded-lg" />
          <div className="h-10 w-40 bg-muted rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-56 bg-muted rounded-xl" />
          <div className="h-56 bg-muted rounded-xl" />
          <div className="h-56 bg-muted rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Bell Management</h2>
          <p className="text-xs text-muted-foreground">Manage school bell hardware, 1-Year Free cloud subscriptions, and custom schedule profiles.</p>
        </div>
        <button 
          onClick={() => setIsRegisterModalOpen(true)}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Register new bell device"
        >
          Register New Device
        </button>
      </div>

      {notification && (
        <div className={`p-4 rounded-xl ${notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20'}`}>
          {notification.message}
        </div>
      )}

      {(!devices || devices.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-border bg-card/50 text-foreground space-y-4">
          <div className="rounded-full bg-primary/10 p-4 text-primary">
            <Bell className="h-10 w-10 stroke-1" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">No Bell Devices Registered</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">Register your school's ESP32 bell controller hardware to start configuring schedules, volume, location tags, and remote buzzers.</p>
          </div>
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Register your first device"
          >
            Register Your First Device
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => {
            const statusInfo = resolveDeviceStatus(device.status, device.last_heartbeat)
            const profileName = device.bell_profiles?.name || 'School Active Profile (Default)'
            const isCustomProfile = !!device.profile_id
            const hasCustomChime = device.pre_announcement_id !== null || device.pre_announcement_enabled !== null

            const actStatus = device.activation_status || 'pending_activation'
            const isExpired = device.subscription_end_date ? new Date(device.subscription_end_date).getTime() < Date.now() : false
            const isActivated = actStatus === 'active' && !isExpired
            const isPending = actStatus === 'pending_activation' || !device.activation_status
            const isSuspended = actStatus === 'suspended'
            const daysLeft = device.subscription_end_date ? Math.ceil((new Date(device.subscription_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

            return (
            <div key={device.id} className={`flex h-full flex-col justify-between rounded-xl border bg-card text-foreground p-5 shadow-sm transition-all hover:shadow-md space-y-4 ${
              isPending ? 'border-amber-500/40 bg-amber-500/[0.02]' : isExpired || isSuspended ? 'border-destructive/40 bg-destructive/[0.02]' : 'border-border'
            }`}>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-foreground truncate flex items-center gap-2" title={device.name || 'Unnamed Device'}>
                      <span>{device.name || 'Unnamed Device'}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold shrink-0">
                        {device.board_type === 'ESP32-C3 Mini' ? 'Mini' : 'S3'}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate" title={device.id}>
                      ID: {device.id}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                      statusInfo.isOnline ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30' : 'bg-muted text-muted-foreground border border-border'
                    }`}
                  >
                    {statusInfo.isOnline ? (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    ) : (
                      <WifiOff className="h-3 w-3" />
                    )}
                    {statusInfo.label.toUpperCase()}
                  </span>
                </div>

                {/* Activation & Subscription Banner */}
                {isPending ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                      </span>
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Pending Activation (1st Year Free)</span>
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-relaxed">
                      Your AutoBell is linked! Once your purchase is confirmed by support, 12 months of free automated cloud ringing will be activated immediately.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <a
                        href={`https://wa.me/923000000000?text=${encodeURIComponent(`Hello AutoBell Support, please activate my device.\nDevice: ${device.name || 'AutoBell'}\nMAC: ${device.mac_address || 'N/A'}\nDevice ID: ${device.id}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                        WhatsApp for 1-Min Activation
                      </a>
                      <button
                        onClick={() => {
                          setDeviceForSlip(device)
                          setSlipPaymentRef(device.payment_reference || '')
                          setSlipNotes(device.activation_notes || '')
                        }}
                        className="inline-flex items-center justify-center rounded-lg border border-amber-500/40 bg-card px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-500/15 transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        Submit Payment Slip
                      </button>
                    </div>
                  </div>
                ) : isExpired ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2 text-destructive">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs font-bold">1-Year Free Subscription Expired</span>
                    </div>
                    <p className="text-[11px] text-destructive/90 leading-relaxed">
                      Your cloud subscription expired on {device.subscription_end_date ? new Date(device.subscription_end_date).toLocaleDateString() : 'recently'}. Please renew your annual subscription to resume automatic schedules and bells.
                    </p>
                    <a
                      href={`https://wa.me/923000000000?text=${encodeURIComponent(`Hello AutoBell Support, I would like to renew my subscription for device: ${device.name || 'AutoBell'} (MAC: ${device.mac_address || 'N/A'}).`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                    >
                      <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                      Renew Subscription via WhatsApp
                    </a>
                  </div>
                ) : isSuspended ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Device Suspended. Contact AutoBell support for assistance.</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                      <ShieldCheck className="h-4 w-4" />
                      <span>1-Year Free License Active</span>
                    </div>
                    {daysLeft !== null && (
                      <span className="text-[11px] text-muted-foreground font-medium font-mono">
                        {daysLeft} days left
                      </span>
                    )}
                  </div>
                )}

                {/* Assigned Profile & Chime Badges */}
                <div className="space-y-1.5 pt-1 border-t border-border/50">
                  <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md ${
                    isCustomProfile 
                      ? 'bg-primary/10 text-primary border border-primary/20' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Schedule: {profileName}</span>
                  </div>

                  {device.board_type !== 'ESP32-C3 Mini' && (
                    <>
                      <div className={`flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-md ${
                        hasCustomChime 
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' 
                          : 'text-muted-foreground'
                      }`}>
                        <BellRing className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          Chime: {hasCustomChime ? 'Custom Override' : 'School Default'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        <HardDrive className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="truncate">Hardware Offline Audio: Synced</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="text-xs text-muted-foreground space-y-1 bg-muted/40 p-3 rounded-lg border border-border/40">
                  <div className="truncate"><strong>MAC:</strong> {device.mac_address || 'N/A'}</div>
                  <div><strong>Last seen:</strong> {device.last_heartbeat ? new Date(device.last_heartbeat).toLocaleString() : 'Never'}</div>
                  <div>
                    <strong>Input power:</strong>{' '}
                    {typeof device.input_voltage_mv === 'number'
                      ? `${(device.input_voltage_mv / 1000).toFixed(2)} V (${device.input_voltage_mv >= 4500 ? 'Mains' : 'Battery'})`
                      : 'N/A'}
                  </div>
                  <div className="truncate">
                    <strong>Location:</strong>{' '}
                    {(() => {
                      const parts = [
                        device.location_area,
                        device.location_city,
                        device.location_country,
                        device.location_continent
                      ].filter(val => val && val.trim().toLowerCase() !== 'null' && val.trim().toLowerCase() !== 'undefined');
                      return parts.length > 0 ? parts.join(', ') : 'Unknown';
                    })()}
                  </div>
                </div>

                {/* Inline Quick Volume Control */}
                {device.board_type === 'ESP32-C3 Mini' ? (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary font-medium flex items-center gap-2 select-none">
                    <Bell className="h-4 w-4 shrink-0 text-primary animate-pulse" />
                    <span>Relay Bell: Physical 5V switching output is enabled.</span>
                  </div>
                ) : (
                  <DeviceVolumeSlider 
                    device={device} 
                    onVolumeCommit={(devId, vol) => updateVolumeMutation.mutate({ deviceId: devId, volume: vol })} 
                  />
                )}
              </div>

              <div className="mt-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!isActivated) {
                        alert('This device is not yet activated. Please contact support or submit payment details to activate your 1-year free license.')
                        return
                      }
                      const confirmed = window.confirm(`Ring bell on "${device.name || 'this device'}" immediately for 5 seconds?`)
                      if (!confirmed) return
                      sendCommandMutation.mutate({ deviceId: device.id, command: 'RING', payload: { duration: 5 } })
                    }}
                    className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 ${
                      isActivated 
                        ? 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500' 
                        : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
                    }`}
                    disabled={sendCommandMutation.isPending || !isActivated}
                    aria-label={`Ring ${device.name || 'device'} now`}
                    title={isActivated ? "Ring bell now" : "Requires active product subscription"}
                  >
                    <BellRing className="mr-1.5 h-4 w-4" />
                    Ring Bell
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDevice(device)
                      setIsSettingsModalOpen(true)
                    }}
                    className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/90 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label={`Open settings for ${device.name || 'device'}`}
                  >
                    <Settings className="mr-1.5 h-4 w-4" />
                    Settings
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => sendCommandMutation.mutate({ deviceId: device.id, command: 'CONFIG' })}
                    className="inline-flex items-center justify-center rounded-lg bg-muted px-2 py-2 text-xs font-medium text-foreground hover:bg-muted/80 disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={sendCommandMutation.isPending}
                    aria-label={`Sync configuration for ${device.name || 'device'}`}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Sync
                  </button>
                  <button
                    onClick={() => {
                      if (!isActivated) {
                        alert('Buzzer test requires an active product subscription.')
                        return
                      }
                      const confirmed = window.confirm('Run a buzzer test on this device? This will briefly ring the buzzer at its location.')
                      if (!confirmed) return
                      sendCommandMutation.mutate({ deviceId: device.id, command: 'TEST_BUZZER' })
                    }}
                    className="inline-flex items-center justify-center rounded-lg bg-amber-500/15 px-2 py-2 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500"
                    disabled={sendCommandMutation.isPending || !isActivated}
                    aria-label={`Test buzzer on ${device.name || 'device'}`}
                  >
                    <Bell className="mr-1 h-3.5 w-3.5" />
                    Buzzer
                  </button>
                  <button
                    onClick={() => {
                      const confirmed = window.confirm('Reboot this device now? Current audio will stop and the bell controller will restart.')
                      if (!confirmed) return
                      sendCommandMutation.mutate({ deviceId: device.id, command: 'REBOOT' })
                    }}
                    className="inline-flex items-center justify-center rounded-lg bg-destructive/10 px-2 py-2 text-xs font-medium text-destructive dark:text-red-400 hover:bg-destructive/20 disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-destructive"
                    disabled={sendCommandMutation.isPending}
                    aria-label={`Reboot ${device.name || 'device'}`}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Reboot
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

      {/* Customer Payment Slip / Reference Submission Modal */}
      {deviceForSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-card text-foreground p-6 shadow-2xl border border-border space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Submit Activation Reference</h3>
              </div>
              <button
                onClick={() => setDeviceForSlip(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              If you purchased this AutoBell from a shop, reseller, or bank deposit, provide your receipt/transaction ID below so we can verify and activate your 1-Year Free subscription.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!slipPaymentRef.trim()) return
                submitSlipMutation.mutate({
                  deviceId: deviceForSlip.id,
                  paymentRef: slipPaymentRef.trim(),
                  notes: slipNotes.trim()
                })
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Payment Slip # / Order ID / Invoice Ref *
                </label>
                <input
                  type="text"
                  required
                  value={slipPaymentRef}
                  onChange={(e) => setSlipPaymentRef(e.target.value)}
                  placeholder="e.g. INV-10492, Bank Deposit Slip #4491, Cash Receipt"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-primary focus:ring-primary text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Notes / Reseller Name (Optional)
                </label>
                <input
                  type="text"
                  value={slipNotes}
                  onChange={(e) => setSlipNotes(e.target.value)}
                  placeholder="e.g. Purchased from Lahore Reseller, Paid 25,000 PKR"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-primary focus:ring-primary text-foreground"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setDeviceForSlip(null)}
                  className="rounded-md border border-input bg-background px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitSlipMutation.isPending || !slipPaymentRef.trim()}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm"
                >
                  {submitSlipMutation.isPending ? 'Submitting...' : 'Submit Reference'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

