import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Link as LinkIcon } from 'lucide-react'

type InventoryItem = {
  id: string
  serial_number: string
  mac_address: string
  claimed_at: string | null
  claimed_by_school_id?: string
  schools?: { name: string } | { name: string }[] | null
  retired_at: string | null
  retired_reason: string | null
}

type SchoolRelation = {
  name: string
  logo_url?: string | null
}

type BellDevice = {
  id: string
  mac_address: string
  name: string | null
  status: string | null
  last_heartbeat: string | null
  school_id: string | null
  schools?: SchoolRelation | SchoolRelation[] | null
  location_area?: string | null
  location_city?: string | null
  location_country?: string | null
  input_voltage_mv?: number | null
  board_type?: string | null
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

function getSchoolInfo(device: BellDevice) {
  const schools = device.schools
  if (!schools) {
    return { name: '-', logoUrl: null as string | null }
  }
  if (Array.isArray(schools)) {
    const first = schools[0]
    return { name: first?.name || '-', logoUrl: first?.logo_url ?? null }
  }
  return { name: schools.name || '-', logoUrl: schools.logo_url ?? null }
}

type AdminPermission = {
  school_id: string | null
  tts_enabled: boolean | null
}

type OtaCommand = {
  id: string
  device_id: string
  command: string
  status: string | null
  created_at: string | null
  executed_at: string | null
  bell_devices?:
    | {
        name: string | null
        mac_address: string | null
      }[]
    | null
}

export default function InventoryManagement() {
  const queryClient = useQueryClient()
  const [newItem, setNewItem] = useState({ serial_number: '', mac_address: '' })
  const [selectedSchools, setSelectedSchools] = useState<Record<string, string>>({})
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [editingNames, setEditingNames] = useState<Record<string, string>>({})
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Record<string, boolean>>({})
  const [firmwareUrl, setFirmwareUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isFirmwareUploading, setIsFirmwareUploading] = useState(false)
  const [deviceToUnassign, setDeviceToUnassign] = useState<BellDevice | null>(null)
  const [deviceToRetire, setDeviceToRetire] = useState<BellDevice | null>(null)
  const [retireReason, setRetireReason] = useState('')
  const [isOtaConfirmOpen, setIsOtaConfirmOpen] = useState(false)
  const [pendingOtaUrl, setPendingOtaUrl] = useState('')

  const { data: schools = [] } = useQuery({
    queryKey: ['schools_list'],
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('id, name').order('name')
      return data || []
    }
  })

  const { data: detectedDevices = [], error: detectedDevicesError } = useQuery<BellDevice[], Error>({
    queryKey: ['detected_devices'],
    queryFn: async () => {
      const selectWithArea =
        'id, mac_address, name, status, last_heartbeat, school_id, location_area, location_city, location_country, input_voltage_mv, schools(name, logo_url)'
      const selectWithoutArea =
        'id, mac_address, name, status, last_heartbeat, school_id, location_city, location_country, input_voltage_mv, schools(name, logo_url)'

      const { data: dataWithArea, error: errorWithArea } = await supabase
        .from('bell_devices')
        .select(selectWithArea)
        .order('created_at', { ascending: false })

      if (!errorWithArea) {
        return (dataWithArea ?? []) as unknown as BellDevice[]
      }

      const msg = String((errorWithArea as unknown as { message?: unknown }).message ?? '')
      const msgLower = msg.toLowerCase()
      const shouldRetryWithoutArea =
        msgLower.includes('location_area') &&
        (msgLower.includes('does not exist') ||
          msgLower.includes('schema cache') ||
          msgLower.includes('could not find') ||
          msgLower.includes('unknown column'))

      if (!shouldRetryWithoutArea) {
        console.error('Failed to load bell devices for super admin:', errorWithArea)
        throw errorWithArea
      }

      const { data: dataWithoutArea, error: errorWithoutArea } = await supabase
        .from('bell_devices')
        .select(selectWithoutArea)
        .order('created_at', { ascending: false })

      if (errorWithoutArea) {
        console.error('Failed to load bell devices for super admin (fallback select):', errorWithoutArea)
        throw errorWithoutArea
      }

      return (dataWithoutArea ?? []).map((device) => ({ ...device, location_area: null })) as unknown as BellDevice[]
    }
  })

  const { data: adminPermissions = [] } = useQuery<AdminPermission[], Error>({
    queryKey: ['admin_tts_permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('school_id, tts_enabled')
        .eq('role', 'admin')
      if (error) {
        console.error('Failed to load admin TTS permissions for super admin:', error)
        throw error
      }
      if (!data) return []
      return data as unknown as AdminPermission[]
    }
  })

  const { data: inventory = [], isLoading, error: inventoryError } = useQuery<InventoryItem[], Error>({
    queryKey: ['device_inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_inventory')
        .select('id, serial_number, mac_address, claimed_at, claimed_by_school_id, retired_at, retired_reason, schools(name)')
        .order('created_at', { ascending: false })
      if (error) {
        console.error('Failed to load device inventory for super admin:', error)
        throw error
      }
      if (!data) return []
      return data as unknown as InventoryItem[]
    }
  })

  const { data: otaCommands = [] } = useQuery<OtaCommand[]>({
    queryKey: ['ota_command_history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('command_queue')
        .select('id, device_id, command, status, created_at, executed_at, bell_devices(name, mac_address)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error || !data) return []
      return (data as OtaCommand[]).filter((cmd) => cmd.command === 'UPDATE_FIRMWARE')
    }
  })

  const unassignedInventory = inventory.filter((item) => !item.claimed_at && !item.retired_at)
  const unassignedDetectedDevices = detectedDevices.filter((device) => !device.school_id)

  const assignMutation = useMutation({
    mutationFn: async ({ item, schoolId }: { item: InventoryItem, schoolId: string }) => {
      // 1. Update device_inventory
      const { error: invError } = await supabase
        .from('device_inventory')
        .update({ 
          claimed_by_school_id: schoolId,
          claimed_at: new Date().toISOString()
        })
        .eq('id', item.id)
      
      if (invError) throw invError

      // 2. Create/Update bell_devices
      // We assume mac_address is unique for bell_devices
      const { error: bellError } = await supabase
        .from('bell_devices')
        .upsert({
            mac_address: item.mac_address,
            school_id: schoolId,
            name: `Bell-${item.serial_number}`,
            status: 'offline'
        }, { onConflict: 'mac_address' })
        
      if (bellError) throw bellError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
      setNotification({ type: 'success', message: 'Device assigned successfully' })
      setTimeout(() => setNotification(null), 3000)
      setSelectedSchools({})
    },
    onError: (error) => {
      console.error(error)
      setNotification({ type: 'error', message: `Failed to assign inventory device: ${error instanceof Error ? error.message : 'Unknown error'}` })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('device_inventory')
        .insert([newItem])
      if (error) throw error
    },
    onSuccess: () => {
      setNewItem({ serial_number: '', mac_address: '' })
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
      setNotification({ type: 'success', message: 'Device added successfully' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error adding device'
      setNotification({ type: 'error', message })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const unassignDeviceMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const { error } = await supabase.rpc('unassign_device', { p_device_id: deviceId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
      queryClient.invalidateQueries({ queryKey: ['detected_devices'] })
      setNotification({ type: 'success', message: 'Device unassigned successfully' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      console.error(error)
      setNotification({ type: 'error', message: `Failed to unassign device: ${error instanceof Error ? error.message : 'Unknown error'}` })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const retireDeviceMutation = useMutation({
    mutationFn: async ({ deviceId, reason }: { deviceId: string; reason: string | null }) => {
      const { error } = await supabase.rpc('retire_device', { p_device_id: deviceId, p_reason: reason })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
      queryClient.invalidateQueries({ queryKey: ['detected_devices'] })
      setNotification({ type: 'success', message: 'Device retired successfully' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      console.error(error)
      setNotification({ type: 'error', message: `Failed to retire device: ${error instanceof Error ? error.message : 'Unknown error'}` })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const renameDeviceMutation = useMutation({
    mutationFn: async ({ deviceId, name }: { deviceId: string; name: string }) => {
      const trimmed = name.trim()
      if (!trimmed) {
        throw new Error('Device name cannot be empty')
      }
      if (trimmed.length > 100) {
        throw new Error('Device name must be at most 100 characters')
      }
      const { error } = await supabase
        .from('bell_devices')
        .update({ name: trimmed })
        .eq('id', deviceId)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['detected_devices'] })
      setEditingNames((prev) => {
        const next = { ...prev }
        delete next[variables.deviceId]
        return next
      })
      setNotification({ type: 'success', message: 'Device name updated successfully' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to update device name'
      setNotification({ type: 'error', message })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const sendOtaMutation = useMutation({
    mutationFn: async ({ commands }: { commands: { device_id: string; school_id: string; command: string; payload: { url: string } }[] }) => {
      if (!commands.length) {
        throw new Error('No devices selected')
      }
      const { error } = await supabase.from('command_queue').insert(commands)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ota_command_history'] })
      setNotification({ type: 'success', message: 'OTA update command(s) sent successfully' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to send OTA update commands'
      setNotification({ type: 'error', message })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const handleFirmwareFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsFirmwareUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      if (fileExt !== 'bin') {
        throw new Error('Only .bin firmware files are allowed')
      }

      const fileName = `firmware_${Date.now()}.bin`
      const { error: uploadError } = await supabase.storage
        .from('firmware')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('firmware').getPublicUrl(fileName)
      setFirmwareUrl(data.publicUrl)
      setNotification({ type: 'success', message: 'Firmware uploaded. Ready to send OTA.' })
      setTimeout(() => setNotification(null), 3000)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to upload firmware'
      setNotification({ type: 'error', message })
      setTimeout(() => setNotification(null), 3000)
    } finally {
      setIsFirmwareUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Device Inventory</h2>
      </div>

      {(inventoryError || detectedDevicesError) && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-2 text-xs text-destructive dark:text-red-400">
          Super Admin diagnostics: failed to load device data. {(inventoryError || detectedDevicesError)?.message}
        </div>
      )}

      {!isLoading && !inventoryError && !detectedDevicesError && unassignedInventory.length === 0 && detectedDevices.length === 0 && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          Super Admin diagnostics: no devices or inventory records found. If you expect devices, verify migrations and that your super admin role is configured for this account.
        </div>
      )}

      {notification && (
        <div className={`p-4 rounded-md ${notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20'}`}>
          {notification.message}
        </div>
      )}

      {/* Unassigned Devices from Inventory */}
      {unassignedInventory.length > 0 && (
        <div className="overflow-hidden rounded-lg bg-card text-foreground shadow border border-border">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="mb-4 text-lg font-medium text-primary">Unassigned Devices</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Serial Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">MAC Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="bg-background text-foreground divide-y divide-border">
                  {unassignedInventory.map((item) => {
                    const device = detectedDevices.find(d => d.mac_address === item.mac_address) || null
                    const statusInfo = resolveDeviceStatus(device?.status ?? null, device?.last_heartbeat ?? null)
                    return (
                      <tr key={item.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{item.serial_number}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{item.mac_address}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            statusInfo.isOnline ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                          }`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {device?.last_heartbeat ? new Date(device.last_heartbeat).toLocaleString() : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {unassignedInventory.length === 0 && unassignedDetectedDevices.length > 0 && (
        <div className="overflow-hidden rounded-lg bg-card text-foreground shadow border border-border">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="mb-4 text-lg font-medium text-primary">Unassigned Devices (Detected)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">MAC Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="bg-background text-foreground divide-y divide-border">
                  {unassignedDetectedDevices.map((device) => {
                    const statusInfo = resolveDeviceStatus(device.status, device.last_heartbeat)
                    return (
                      <tr key={device.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{device.name || 'Unnamed Device'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{device.mac_address}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            statusInfo.isOnline ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                          }`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {device.last_heartbeat ? new Date(device.last_heartbeat).toLocaleString() : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Global Devices List for Super Admin */}
      <div className="overflow-hidden rounded-lg bg-card text-foreground shadow border border-border">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="mb-4 text-lg font-medium text-primary">All Devices (Across Schools)</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {detectedDevices.map((device) => {
              const inventoryItem = inventory.find((item) => item.mac_address === device.mac_address)
              const isRetired = !!inventoryItem?.retired_at
              const canUnassign = !!device.school_id && !isRetired
              const canRetire = !isRetired && !!inventoryItem
              const canOta = !!device.school_id && !isRetired
              const admin = adminPermissions.find((u) => u.school_id === device.school_id) || null
              const statusInfo = resolveDeviceStatus(device.status, device.last_heartbeat)
              const { name: schoolName, logoUrl: schoolLogoUrl } = getSchoolInfo(device)

              return (
                <div key={device.id} className="flex h-full flex-col justify-between rounded-lg border border-border bg-card text-foreground p-4 shadow-sm">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          {schoolLogoUrl ? (
                            <img
                              src={schoolLogoUrl}
                              alt={schoolName || 'School Logo'}
                              className="h-10 w-10 rounded-full object-cover border border-border"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground border border-border">
                              {schoolName && schoolName !== '-' ? schoolName.charAt(0).toUpperCase() : '?'}
                            </div>
                          )}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                className="w-40 rounded-md border-input bg-background shadow-sm focus:border-primary focus:ring-primary text-sm p-1"
                                value={editingNames[device.id] ?? device.name ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setEditingNames((prev) => ({ ...prev, [device.id]: value }))
                                }}
                                placeholder="Unnamed device"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const rawName = editingNames[device.id] ?? device.name ?? ''
                                  const trimmed = rawName.trim()
                                  if (!trimmed) {
                                    setNotification({ type: 'error', message: 'Device name cannot be empty.' })
                                    setTimeout(() => setNotification(null), 3000)
                                    return
                                  }
                                  if (trimmed.length > 100) {
                                    setNotification({ type: 'error', message: 'Device name must be at most 100 characters.' })
                                    setTimeout(() => setNotification(null), 3000)
                                    return
                                  }
                                  renameDeviceMutation.mutate({ deviceId: device.id, name: trimmed })
                                }}
                                disabled={renameDeviceMutation.isPending}
                                className="inline-flex items-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                              >
                                Save
                              </button>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {schoolName}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground break-all">
                          ID: {device.id}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary"
                          checked={!!selectedDeviceIds[device.id]}
                          onChange={(event) => {
                            const checked = event.target.checked
                            setSelectedDeviceIds((prev) => ({
                              ...prev,
                              [device.id]: checked
                            }))
                          }}
                          disabled={!canOta || sendOtaMutation.isPending}
                        />
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          statusInfo.isOnline ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                        }`}>
                          {statusInfo.label.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="truncate">MAC: {device.mac_address || 'N/A'}</div>
                      <div>School: {schoolName}</div>
                      <div>Last seen: {device.last_heartbeat ? new Date(device.last_heartbeat).toLocaleString() : 'N/A'}</div>
                      <div>
                        Input power:{' '}
                        {typeof device.input_voltage_mv === 'number'
                          ? `${(device.input_voltage_mv / 1000).toFixed(2)} V`
                          : 'N/A'}
                      </div>
                      <div>
                        TTS / Voice:{' '}
                        <span className={`inline-flex rounded-full px-2 text-[11px] font-semibold leading-5 ${
                          admin?.tts_enabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                        }`}>
                          {admin ? (admin.tts_enabled ? 'On' : 'Off') : 'N/A'}
                        </span>
                      </div>
                      <div>
                        Location:{' '}
                        {device.location_area || device.location_city || device.location_country
                          ? [device.location_area, device.location_city, device.location_country].filter(Boolean).join(', ')
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      disabled={!canUnassign || unassignDeviceMutation.isPending}
                      onClick={() => {
                        if (!canUnassign) return
                        setDeviceToUnassign(device)
                      }}
                      className="inline-flex items-center rounded-md border border-transparent bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      Unassign
                    </button>
                    <button
                      disabled={!canRetire || retireDeviceMutation.isPending}
                      onClick={() => {
                        if (!canRetire) return
                        setDeviceToRetire(device)
                        setRetireReason('damaged')
                      }}
                      className="inline-flex items-center rounded-md border border-transparent bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                    >
                      Retire
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 space-y-3">
            <h4 className="text-sm font-medium text-primary">OTA Firmware Update</h4>
            <p className="text-xs text-muted-foreground">
              Select one or more assigned devices above, then upload firmware or enter a URL.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".bin"
                  className="hidden"
                  onChange={handleFirmwareFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isFirmwareUploading || sendOtaMutation.isPending}
                  className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                >
                  {isFirmwareUploading ? 'Uploading...' : 'Select .bin File'}
                </button>
                <span className="text-xs text-muted-foreground truncate max-w-xs">
                  {firmwareUrl ? firmwareUrl : 'No firmware selected'}
                </span>
              </div>
              <div className="flex-1">
                <input
                  type="url"
                  value={firmwareUrl}
                  onChange={(event) => setFirmwareUrl(event.target.value)}
                  placeholder="https://example.com/firmware.bin"
                  className="block w-full rounded-md border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const url = firmwareUrl.trim()
                  if (!url) {
                    setNotification({ type: 'error', message: 'Firmware URL is required.' })
                    setTimeout(() => setNotification(null), 3000)
                    return
                  }
                  const hasCommands = detectedDevices.some((device) => {
                    const inventoryItem = inventory.find((item) => item.mac_address === device.mac_address)
                    const isRetired = !!inventoryItem?.retired_at
                    const canOta = !!device.school_id && !isRetired
                    return canOta && selectedDeviceIds[device.id]
                  })

                  if (!hasCommands) {
                    setNotification({ type: 'error', message: 'Select at least one eligible device.' })
                    setTimeout(() => setNotification(null), 3000)
                    return
                  }

                  setPendingOtaUrl(url)
                  setIsOtaConfirmOpen(true)
                }}
                disabled={sendOtaMutation.isPending}
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {sendOtaMutation.isPending ? 'Sending OTA...' : 'Send OTA Update'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent OTA Updates */}
      {otaCommands.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg bg-card text-foreground shadow border border-border">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="mb-4 text-lg font-medium text-primary">Recent OTA Updates</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Device</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">MAC Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created At</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Executed At</th>
                  </tr>
                </thead>
                <tbody className="bg-background text-foreground divide-y divide-border">
                  {otaCommands.map((cmd) => (
                    <tr key={cmd.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {(cmd.bell_devices && cmd.bell_devices[0]?.name) || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {(cmd.bell_devices && cmd.bell_devices[0]?.mac_address) || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {cmd.status}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {cmd.created_at ? new Date(cmd.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {cmd.executed_at ? new Date(cmd.executed_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add New Device Form */}
      <div className="rounded-lg bg-card text-foreground p-6 shadow border border-border">
        <h3 className="mb-4 text-lg font-medium text-foreground">Add New Device Stock</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            addMutation.mutate()
          }}
          className="flex gap-4 items-end"
        >
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground">Serial Number</label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
              value={newItem.serial_number}
              onChange={(e) => setNewItem({ ...newItem, serial_number: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground">MAC Address</label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
              value={newItem.mac_address}
              onChange={(e) => setNewItem({ ...newItem, mac_address: e.target.value })}
            />
          </div>
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
          >
            <Plus className="mr-2 h-4 w-4" />
            {addMutation.isPending ? 'Adding...' : 'Add Device'}
          </button>
        </form>
      </div>

      {/* Inventory List */}
      <div className="overflow-hidden rounded-lg bg-card text-foreground shadow border border-border">
        <div className="px-4 py-5 sm:p-6">
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Serial Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">MAC Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Claimed By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Claimed At</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-background text-foreground divide-y divide-border">
                  {inventory.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{item.serial_number}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{item.mac_address}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {item.retired_at ? (
                          <span className="inline-flex rounded-full bg-destructive/10 px-2 text-xs font-semibold leading-5 text-destructive dark:text-red-400">Retired</span>
                        ) : item.claimed_at ? (
                          <span className="inline-flex rounded-full bg-emerald-500/10 px-2 text-xs font-semibold leading-5 text-emerald-700 dark:text-emerald-400">Claimed</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-500/10 px-2 text-xs font-semibold leading-5 text-amber-700 dark:text-amber-400">Available</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {Array.isArray(item.schools) 
                          ? item.schools[0]?.name || '-' 
                          : item.schools?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {item.claimed_at ? new Date(item.claimed_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {!item.claimed_at && !item.retired_at && (
                            <div className="flex items-center justify-end gap-2">
                                <select 
                                    className="text-sm rounded-md shadow-sm border-input bg-background text-foreground focus:border-primary focus:ring-primary border p-1"
                                    value={selectedSchools[item.id] || ''}
                                    onChange={(e) => setSelectedSchools(prev => ({...prev, [item.id]: e.target.value}))}
                                >
                                    <option value="">Select School</option>
                                    {schools.map(school => (
                                        <option key={school.id} value={school.id}>{school.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => {
                                        const schoolId = selectedSchools[item.id]
                                        if (schoolId) {
                                            assignMutation.mutate({ item, schoolId })
                                        }
                                    }}
                                    disabled={!selectedSchools[item.id] || assignMutation.isPending}
                                    className="text-primary hover:text-primary/80 disabled:opacity-50"
                                >
                                    <LinkIcon className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {deviceToUnassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card text-foreground p-6 shadow-lg border border-border">
            <h3 className="mb-4 text-lg font-bold text-foreground">Unassign Device</h3>
            <div className="mb-6 text-muted-foreground text-sm space-y-2">
              <p>This will remove this device from its current school and return it to the unassigned inventory.</p>
              <p>The device will stop receiving schedules until it is claimed again.</p>
              <p className="font-medium">Do you want to continue and unassign this device?</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeviceToUnassign(null)}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deviceToUnassign) {
                    unassignDeviceMutation.mutate(deviceToUnassign.id)
                  }
                  setDeviceToUnassign(null)
                }}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Continue And Unassign Device
              </button>
            </div>
          </div>
        </div>
      )}
      {deviceToRetire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card text-foreground p-6 shadow-lg border border-border">
            <h3 className="mb-4 text-lg font-bold text-foreground">Retire Device</h3>
            <div className="mb-4 text-sm text-muted-foreground space-y-2">
              <p>This will retire this device and remove it from active lists.</p>
              <p>Retired devices cannot be claimed again and will no longer receive commands.</p>
              <p className="font-medium">Do you want to continue and retire this device?</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-foreground">Retirement reason (optional)</label>
              <input
                type="text"
                value={retireReason}
                onChange={(event) => setRetireReason(event.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm shadow-sm focus:border-destructive focus:ring-destructive"
                placeholder="e.g. damaged, replaced, lost"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeviceToRetire(null)
                  setRetireReason('')
                }}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deviceToRetire) {
                    retireDeviceMutation.mutate({
                      deviceId: deviceToRetire.id,
                      reason: retireReason.trim() || null
                    })
                  }
                  setDeviceToRetire(null)
                  setRetireReason('')
                }}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
              >
                Continue And Retire Device
              </button>
            </div>
          </div>
        </div>
      )}
      {isOtaConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card text-foreground p-6 shadow-lg border border-border">
            <h3 className="mb-4 text-lg font-bold text-foreground">Send Firmware Update</h3>
            <div className="mb-6 text-sm text-muted-foreground space-y-2">
              <p>This will send an over-the-air firmware update to all selected devices.</p>
              <p>Devices may reboot and be temporarily unavailable while the update is applied.</p>
              <p className="font-medium">Do you want to continue and send this firmware to the selected devices?</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsOtaConfirmOpen(false)}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const url = pendingOtaUrl.trim()
                  if (!url) {
                    setIsOtaConfirmOpen(false)
                    return
                  }
                  const commands = detectedDevices
                    .filter((device) => {
                      const inventoryItem = inventory.find((item) => item.mac_address === device.mac_address)
                      const isRetired = !!inventoryItem?.retired_at
                      const canOta = !!device.school_id && !isRetired
                      return canOta && selectedDeviceIds[device.id]
                    })
                    .map((device) => ({
                      device_id: device.id,
                      school_id: device.school_id as string,
                      command: 'UPDATE_FIRMWARE',
                      payload: { url }
                    }))
                  if (!commands.length) {
                    setNotification({ type: 'error', message: 'Select at least one eligible device.' })
                    setTimeout(() => setNotification(null), 3000)
                    setIsOtaConfirmOpen(false)
                    return
                  }
                  sendOtaMutation.mutate({ commands })
                  setIsOtaConfirmOpen(false)
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Continue And Send Firmware
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
