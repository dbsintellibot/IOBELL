import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Link as LinkIcon, Upload, CheckCircle2, AlertCircle, Search, ShieldCheck, Zap, Clock, Ban, Calendar } from 'lucide-react'

type InventoryItem = {
  id: string
  serial_number: string
  mac_address: string
  board_type?: string | null
  claimed_at: string | null
  claimed_by_school_id?: string
  schools?: { name: string } | { name: string }[] | null
  retired_at: string | null
  retired_reason: string | null
  activation_status?: string | null
  is_paid?: boolean | null
  subscription_end_date?: string | null
  payment_reference?: string | null
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
  location_continent?: string | null
  input_voltage_mv?: number | null
  board_type?: string | null
  firmware_version?: string | null
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
  const [newItem, setNewItem] = useState({ serial_number: '', mac_address: '', board_type: 'ESP32-S3 N16R8' })
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

  // Product Activation & Subscription State
  const [deviceToActivate, setDeviceToActivate] = useState<BellDevice | null>(null)
  const [activationDuration, setActivationDuration] = useState<number>(12) // Default 1 Year (12 months free)
  const [activationPaymentRef, setActivationPaymentRef] = useState('')
  const [activationNotes, setActivationNotes] = useState('')
  const [deviceToSuspend, setDeviceToSuspend] = useState<BellDevice | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [filterActivation, setFilterActivation] = useState<'all' | 'pending' | 'active' | 'expired' | 'suspended'>('all')

  // CSV Bulk Upload State
  const [isCsvExpanded, setIsCsvExpanded] = useState(false)
  const [csvRows, setCsvRows] = useState<Array<{
    serial_number: string
    mac_address: string
    board_type?: string
    error?: string
    isValid: boolean
  }>>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [dragActive, setDragActive] = useState(false)

  // Filters State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all')
  const [filterSchool, setFilterSchool] = useState('')
  const [filterBoardType, setFilterBoardType] = useState('')

  const { data: schools = [] } = useQuery({
    queryKey: ['schools_list'],
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('id, name, subscription_end_date, payment_status').order('name')
      return data || []
    }
  })

  const { data: detectedDevices = [], error: detectedDevicesError } = useQuery<BellDevice[], Error>({
    queryKey: ['detected_devices'],
    queryFn: async () => {
      const selectWithArea =
        'id, mac_address, name, status, last_heartbeat, school_id, location_area, location_city, location_country, location_continent, input_voltage_mv, board_type, firmware_version, activation_status, is_paid, activated_at, subscription_end_date, payment_reference, activation_notes, schools(name, logo_url)'
      const selectWithoutArea =
        'id, mac_address, name, status, last_heartbeat, school_id, location_city, location_country, input_voltage_mv, board_type, firmware_version, activation_status, is_paid, activated_at, subscription_end_date, payment_reference, activation_notes, schools(name, logo_url)'

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
        .select('id, serial_number, mac_address, board_type, claimed_at, claimed_by_school_id, retired_at, retired_reason, activation_status, is_paid, subscription_end_date, payment_reference, schools(name)')
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
      setNewItem({ serial_number: '', mac_address: '', board_type: 'ESP32-S3 N16R8' })
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

  const activateDeviceMutation = useMutation({
    mutationFn: async ({ 
      deviceId, 
      durationMonths, 
      paymentRef, 
      notes 
    }: { 
      deviceId: string
      durationMonths: number
      paymentRef?: string
      notes?: string 
    }) => {
      const { error } = await supabase.rpc('activate_device', {
        p_device_id: deviceId,
        p_duration_months: durationMonths,
        p_payment_ref: paymentRef || null,
        p_notes: notes || null
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
      queryClient.invalidateQueries({ queryKey: ['detected_devices'] })
      queryClient.invalidateQueries({ queryKey: ['schools_list'] })
      setNotification({ type: 'success', message: 'Device successfully activated and 1-Year Free Subscription granted!' })
      setTimeout(() => setNotification(null), 4000)
      setDeviceToActivate(null)
      setActivationPaymentRef('')
      setActivationNotes('')
    },
    onError: (error) => {
      console.error(error)
      setNotification({ type: 'error', message: `Failed to activate device: ${error instanceof Error ? error.message : 'Unknown error'}` })
      setTimeout(() => setNotification(null), 4000)
    }
  })

  const suspendDeviceMutation = useMutation({
    mutationFn: async ({ deviceId, reason }: { deviceId: string; reason?: string }) => {
      const { error } = await supabase.rpc('suspend_device', {
        p_device_id: deviceId,
        p_reason: reason || null
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
      queryClient.invalidateQueries({ queryKey: ['detected_devices'] })
      setNotification({ type: 'success', message: 'Device suspended.' })
      setTimeout(() => setNotification(null), 3000)
      setDeviceToSuspend(null)
      setSuspendReason('')
    },
    onError: (error) => {
      console.error(error)
      setNotification({ type: 'error', message: `Failed to suspend device: ${error instanceof Error ? error.message : 'Unknown error'}` })
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
    mutationFn: async ({ commands }: { commands: { device_id: string; command: string; payload: { url: string } }[] }) => {
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

  // CSV Drag and Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const parseAndValidateCSV = (text: string) => {
    const lines = text.split(/\r?\n/)
    if (lines.length === 0) return
    
    // Find header
    let startIndex = 0
    while (startIndex < lines.length && !lines[startIndex].trim()) {
      startIndex++
    }
    
    if (startIndex >= lines.length) return
    
    const headers = lines[startIndex].split(',').map(h => h.trim().toLowerCase())
    const serialIdx = headers.indexOf('serial_number')
    const macIdx = headers.indexOf('mac_address')
    const boardIdx = headers.indexOf('board_type')
    
    const parsed: typeof csvRows = []
    
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const parts = line.split(',').map(p => p.trim())
      let serial = ''
      let mac = ''
      let board = 'ESP32-S3 N16R8'
      
      if (serialIdx !== -1 && macIdx !== -1) {
        serial = parts[serialIdx] || ''
        mac = parts[macIdx] || ''
        if (boardIdx !== -1 && parts[boardIdx]) {
          board = parts[boardIdx]
        }
      } else {
        // Fallback to first two columns
        serial = parts[0] || ''
        mac = parts[1] || ''
        if (parts[2]) {
          board = parts[2]
        }
      }
      
      // Validation
      let error = ''
      const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
      
      if (!serial) {
        error = 'Serial number is empty'
      } else if (!mac) {
        error = 'MAC address is empty'
      } else if (!macRegex.test(mac)) {
        error = 'Invalid MAC address format (must match XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX)'
      }
      
      parsed.push({
        serial_number: serial,
        mac_address: mac,
        board_type: board,
        error: error || undefined,
        isValid: !error
      })
    }
    setCsvRows(parsed)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.name.endsWith('.csv')) {
        setCsvFileName(file.name)
        const reader = new FileReader()
        reader.onload = (event) => {
          const text = event.target?.result as string
          parseAndValidateCSV(text)
        }
        reader.readAsText(file)
      } else {
        setNotification({ type: 'error', message: 'Only CSV files are allowed' })
        setTimeout(() => setNotification(null), 3000)
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setCsvFileName(file.name)
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        parseAndValidateCSV(text)
      }
      reader.readAsText(file)
    }
  }

  const bulkRegisterMutation = useMutation({
    mutationFn: async (rows: typeof csvRows) => {
      const validPayload = rows
        .filter(r => r.isValid)
        .map(r => ({
          serial_number: r.serial_number,
          mac_address: r.mac_address,
          board_type: r.board_type || 'ESP32-S3 N16R8'
        }))
      
      if (validPayload.length === 0) {
        throw new Error('No valid devices to register')
      }

      const { data, error } = await supabase.rpc('bulk_register_inventory', {
        p_devices: validPayload
      })
      if (error) throw error
      return data as { inserted: number; skipped: number; invalid: number }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['device_inventory'] })
      setNotification({
        type: 'success',
        message: `Bulk registration summary: Successfully registered ${data.inserted} devices, skipped ${data.skipped} duplicates, failed ${data.invalid} invalid rows.`
      })
      setTimeout(() => setNotification(null), 5000)
      // reset
      setCsvRows([])
      setCsvFileName('')
      setIsCsvExpanded(false)
    },
    onError: (error) => {
      console.error(error)
      setNotification({
        type: 'error',
        message: `Failed to bulk register: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const uniqueBoardTypes = Array.from(
    new Set(
      detectedDevices
        .map((d) => d.board_type)
        .filter(Boolean) as string[]
    )
  ).sort()

  const pendingCount = detectedDevices.filter((d) => {
    const act = d.activation_status || 'unactivated'
    return act === 'pending_activation' || (!d.activation_status && d.school_id)
  }).length

  const activeCount = detectedDevices.filter((d) => {
    const act = d.activation_status || 'unactivated'
    const isExp = d.subscription_end_date ? new Date(d.subscription_end_date).getTime() < Date.now() : false
    return act === 'active' && !isExp
  }).length

  const expiredCount = detectedDevices.filter((d) => {
    const act = d.activation_status || 'unactivated'
    const isExp = d.subscription_end_date ? new Date(d.subscription_end_date).getTime() < Date.now() : false
    return act === 'expired' || isExp || act === 'suspended'
  }).length

  const filteredDevices = detectedDevices.filter((device) => {
    const inventoryItem = inventory.find((item) => item.mac_address === device.mac_address)
    const serial = (inventoryItem?.serial_number || '').toLowerCase()
    const mac = (device.mac_address || '').toLowerCase()
    const name = (device.name || '').toLowerCase()
    const query = searchQuery.toLowerCase().trim()
    
    if (query) {
      if (!serial.includes(query) && !mac.includes(query) && !name.includes(query)) {
        return false
      }
    }
    
    if (filterSchool && device.school_id !== filterSchool) {
      return false
    }
    
    const statusInfo = resolveDeviceStatus(device.status, device.last_heartbeat)
    if (filterStatus !== 'all') {
      if (filterStatus === 'online' && !statusInfo.isOnline) return false
      if (filterStatus === 'offline' && statusInfo.isOnline) return false
    }
    
    if (filterBoardType && device.board_type !== filterBoardType) {
      return false
    }

    const actStatus = device.activation_status || (device.school_id ? 'pending_activation' : 'unactivated')
    const isExpired = device.subscription_end_date ? new Date(device.subscription_end_date).getTime() < Date.now() : false

    if (filterActivation === 'pending') {
      if (actStatus !== 'pending_activation' && (actStatus !== 'unactivated' || !device.school_id)) return false
    } else if (filterActivation === 'active') {
      if (actStatus !== 'active' || isExpired) return false
    } else if (filterActivation === 'expired') {
      if (!isExpired && actStatus !== 'expired') return false
    } else if (filterActivation === 'suspended') {
      if (actStatus !== 'suspended') return false
    }
    
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Device Inventory & Licensing</h2>
          <p className="text-xs text-muted-foreground">Manage hardware stock, 1-click cloud activation, 1-year free subscriptions, and renewals.</p>
        </div>
        <button
          onClick={() => setIsCsvExpanded(!isCsvExpanded)}
          className="inline-flex items-center rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 text-sm font-medium border border-border transition-colors shadow-sm"
        >
          <Upload className="mr-2 h-4 w-4" />
          {isCsvExpanded ? 'Hide Bulk Import' : 'Bulk Import CSV'}
        </button>
      </div>

      {isCsvExpanded && (
        <div className="rounded-lg bg-card text-foreground p-6 shadow border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-foreground">Bulk Upload CSV</h3>
            <button
              onClick={() => {
                setCsvRows([])
                setCsvFileName('')
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          </div>
          
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground bg-muted/20'
            }`}
            onClick={() => {
              const fileInput = document.getElementById('csv-file-input')
              fileInput?.click()
            }}
          >
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Upload className="h-10 w-10 text-muted-foreground mb-2 animate-pulse" />
            <p className="text-sm font-medium text-foreground">
              {csvFileName ? `Selected: ${csvFileName}` : 'Drag and drop your CSV file here, or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              CSV must have headers: <code className="bg-muted px-1 rounded">serial_number,mac_address</code>
            </p>
          </div>

          {csvRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Parsed <span className="font-semibold text-foreground">{csvRows.length}</span> rows
                </span>
                <span className="flex gap-4">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {csvRows.filter(r => r.isValid).length} Valid
                  </span>
                  {csvRows.some(r => !r.isValid) && (
                    <span className="text-destructive font-medium">
                      {csvRows.filter(r => !r.isValid).length} Invalid
                    </span>
                  )}
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto border border-border rounded-md">
                <table className="min-w-full divide-y divide-border text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Row</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Serial</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">MAC Address</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-background">
                    {csvRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? '' : 'bg-destructive/5'}>
                        <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-2 font-medium">{row.serial_number || <span className="italic text-muted-foreground">empty</span>}</td>
                        <td className="px-4 py-2 font-mono">{row.mac_address || <span className="italic text-muted-foreground">empty</span>}</td>
                        <td className="px-4 py-2">
                          {row.isValid ? (
                            <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-destructive" title={row.error}>
                              <AlertCircle className="h-3 w-3 mr-1" /> {row.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCsvRows([])
                    setCsvFileName('')
                  }}
                  className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!csvRows.some(r => r.isValid) || bulkRegisterMutation.isPending}
                  onClick={() => bulkRegisterMutation.mutate(csvRows)}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {bulkRegisterMutation.isPending ? 'Registering...' : `Register ${csvRows.filter(r => r.isValid).length} Valid Devices`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(inventoryError || detectedDevicesError) && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-2 text-xs text-destructive dark:text-red-400">
          Super Admin diagnostics: failed to load device data. {(inventoryError || detectedDevicesError)?.message}
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
            <h3 className="mb-4 text-lg font-medium text-primary">Unclaimed Factory Inventory ({unassignedInventory.length})</h3>
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

      {/* Global Devices List for Super Admin */}
      <div className="overflow-hidden rounded-lg bg-card text-foreground shadow border border-border">
        <div className="px-4 py-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-medium text-primary">All Devices & Activation Management</h3>
              <p className="text-xs text-muted-foreground">Filter by activation status, approve 1-Year Free subscriptions upon payment, or extend renewals.</p>
            </div>
            
            {/* Bulk select summary / Clear selection */}
            {Object.values(selectedDeviceIds).filter(Boolean).length > 0 && (
              <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full text-xs font-medium text-primary self-start">
                <span>{Object.values(selectedDeviceIds).filter(Boolean).length} selected for OTA</span>
                <button
                  onClick={() => setSelectedDeviceIds({})}
                  className="hover:text-primary/80 underline font-bold"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Quick Activation Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            <button
              onClick={() => setFilterActivation('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterActivation === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              }`}
            >
              All Devices ({detectedDevices.length})
            </button>
            <button
              onClick={() => setFilterActivation('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                filterActivation === 'pending'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {pendingCount > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>}
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Pending Activation ({pendingCount})
            </button>
            <button
              onClick={() => setFilterActivation('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                filterActivation === 'active'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Active Subscriptions ({activeCount})
            </button>
            <button
              onClick={() => setFilterActivation('expired')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                filterActivation === 'expired'
                  ? 'bg-destructive text-destructive-foreground shadow-sm'
                  : 'bg-destructive/10 text-destructive dark:text-red-400 hover:bg-destructive/20'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              Expired / Suspended ({expiredCount})
            </button>
          </div>

          {/* Search & Filters Top Bar */}
          <div className="grid gap-3 md:grid-cols-4 sm:grid-cols-2">
            {/* Search Bar */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, serial or MAC..."
                className="pl-9 w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-primary focus:ring-primary focus:ring-1"
              />
            </div>

            {/* School Filter */}
            <select
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-primary focus:ring-primary focus:ring-1 text-foreground"
            >
              <option value="">All Schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-primary focus:ring-primary focus:ring-1 text-foreground"
            >
              <option value="all">All Connection Statuses</option>
              <option value="online">Online Only</option>
              <option value="offline">Offline Only</option>
            </select>

            {/* Board Type Filter */}
            <select
              value={filterBoardType}
              onChange={(e) => setFilterBoardType(e.target.value)}
              className="rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-primary focus:ring-primary focus:ring-1 text-foreground"
            >
              <option value="">All Board Types</option>
              {uniqueBoardTypes.map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>
          </div>

          {/* High-density structured datatable */}
          <div className="overflow-x-auto border border-border rounded-lg shadow-sm">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="w-12 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredDevices.filter(d => {
                          const inv = inventory.find(item => item.mac_address === d.mac_address)
                          return !!d.school_id && !inv?.retired_at
                        }).length > 0 &&
                        filteredDevices
                          .filter(d => {
                            const inv = inventory.find(item => item.mac_address === d.mac_address)
                            return !!d.school_id && !inv?.retired_at
                          })
                          .every(d => selectedDeviceIds[d.id])
                      }
                      onChange={(e) => {
                        const checked = e.target.checked
                        const nextSelected = { ...selectedDeviceIds }
                        filteredDevices
                          .filter(d => {
                            const inv = inventory.find(item => item.mac_address === d.mac_address)
                            return !!d.school_id && !inv?.retired_at
                          })
                          .forEach(d => {
                            if (checked) {
                              nextSelected[d.id] = true
                            } else {
                              delete nextSelected[d.id]
                            }
                          })
                        setSelectedDeviceIds(nextSelected)
                      }}
                      className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Device Name / Details</th>
                  <th className="px-4 py-3 text-left">Serial Number</th>
                  <th className="px-4 py-3 text-left">MAC Address</th>
                  <th className="px-4 py-3 text-left">Board Type</th>
                  <th className="px-4 py-3 text-left">Assigned School</th>
                  <th className="px-4 py-3 text-left">License & Activation</th>
                  <th className="px-4 py-3 text-left">Online Status</th>
                  <th className="px-4 py-3 text-left">Firmware</th>
                  <th className="px-4 py-3 text-left">Last Seen</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border text-sm">
                {filteredDevices.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-10 text-center text-sm text-muted-foreground bg-muted/10">
                      No devices matching the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredDevices.map((device) => {
                    const inventoryItem = inventory.find((item) => item.mac_address === device.mac_address)
                    const isRetired = !!inventoryItem?.retired_at
                    const canUnassign = !!device.school_id && !isRetired
                    const canRetire = !isRetired && !!inventoryItem
                    const canOta = !!device.school_id && !isRetired
                    const admin = adminPermissions.find((u) => u.school_id === device.school_id) || null
                    const statusInfo = resolveDeviceStatus(device.status, device.last_heartbeat)
                    const { name: schoolName, logoUrl: schoolLogoUrl } = getSchoolInfo(device)

                    const actStatus = device.activation_status || (device.school_id ? 'pending_activation' : 'unactivated')
                    const isExpired = device.subscription_end_date ? new Date(device.subscription_end_date).getTime() < Date.now() : false
                    const daysRemaining = device.subscription_end_date ? Math.ceil((new Date(device.subscription_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

                    return (
                      <tr key={device.id} className={`hover:bg-muted/10 transition-colors ${isRetired ? 'bg-destructive/5' : ''}`}>
                        {/* Selection Checkbox */}
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={!!selectedDeviceIds[device.id]}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setSelectedDeviceIds(prev => ({
                                ...prev,
                                [device.id]: checked
                              }))
                            }}
                            disabled={!canOta || sendOtaMutation.isPending}
                            className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary disabled:opacity-30 cursor-pointer"
                          />
                        </td>
                        
                        {/* Name Input / ID */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                className="w-32 rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary text-xs p-1 text-foreground"
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
                                className="inline-flex items-center rounded border border-input bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
                              >
                                Save
                              </button>
                            </div>
                            <div className="text-[10px] text-muted-foreground select-all leading-none font-mono">
                              ID: {device.id}
                            </div>
                          </div>
                        </td>

                        {/* Serial Number */}
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          {inventoryItem?.serial_number || '-'}
                        </td>

                        {/* MAC Address */}
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap select-all text-muted-foreground">
                          {device.mac_address}
                        </td>

                        {/* Board Type */}
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground">
                            {device.board_type || 'N/A'}
                          </span>
                        </td>

                        {/* Assigned School */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {schoolLogoUrl ? (
                                <img
                                  src={schoolLogoUrl}
                                  alt={schoolName}
                                  className="h-5 w-5 rounded-full object-cover border border-border"
                                />
                              ) : (
                                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold text-muted-foreground border border-border">
                                  {schoolName !== '-' ? schoolName.charAt(0).toUpperCase() : '?'}
                                </div>
                              )}
                              <span className="text-xs font-medium text-foreground truncate max-w-[120px]">{schoolName}</span>
                            </div>
                            {(() => {
                              const parts = [
                                device.location_area,
                                device.location_city,
                                device.location_country,
                                device.location_continent
                              ].filter(val => val && val.trim().toLowerCase() !== 'null' && val.trim().toLowerCase() !== 'undefined');
                              return parts.length > 0 ? (
                                <div className="text-[10px] text-muted-foreground leading-none">
                                  Loc: {parts.join(', ')}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </td>

                        {/* License & Activation Column */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {actStatus === 'active' && !isExpired ? (
                              <div>
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  ACTIVE
                                </span>
                                {device.subscription_end_date && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    Expires: {new Date(device.subscription_end_date).toLocaleDateString()}
                                    {daysRemaining !== null && ` (${daysRemaining}d left)`}
                                  </div>
                                )}
                              </div>
                            ) : actStatus === 'pending_activation' ? (
                              <div>
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                  <span className="relative flex h-1.5 w-1.5 mr-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                                  </span>
                                  PENDING ACTIVATION
                                </span>
                                <div className="text-[10px] text-amber-600/90 dark:text-amber-400/90 mt-0.5">
                                  Awaiting payment confirmation
                                </div>
                              </div>
                            ) : actStatus === 'suspended' ? (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15 text-destructive dark:text-red-400 border border-destructive/30">
                                <Ban className="h-3 w-3 mr-1" />
                                SUSPENDED
                              </span>
                            ) : isExpired ? (
                              <div>
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-destructive/15 text-destructive dark:text-red-400 border border-destructive/30">
                                  <Clock className="h-3 w-3 mr-1" />
                                  EXPIRED
                                </span>
                                <div className="text-[10px] text-destructive mt-0.5">
                                  Renewal Due
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground">
                                UNCLAIMED
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Online Status */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold leading-5 ${
                              statusInfo.isOnline ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${statusInfo.isOnline ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                              {statusInfo.label.toUpperCase()}
                            </span>
                            {typeof device.input_voltage_mv === 'number' && (
                              <div className="text-[10px] text-muted-foreground leading-none">
                                Power: {(device.input_voltage_mv / 1000).toFixed(2)} V ({device.input_voltage_mv >= 4500 ? 'Mains' : 'Battery'})
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Firmware Version */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <span className="text-xs font-mono text-muted-foreground">
                              {device.firmware_version || 'N/A'}
                            </span>
                            <div className="text-[10px] text-muted-foreground leading-none">
                              TTS: <span className={admin?.tts_enabled ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>
                                {admin ? (admin.tts_enabled ? 'On' : 'Off') : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Last Heartbeat */}
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          {device.last_heartbeat ? new Date(device.last_heartbeat).toLocaleString() : 'N/A'}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1.5 justify-end items-center">
                            {/* Activation / Approval Button */}
                            {actStatus !== 'active' || isExpired ? (
                              <button
                                onClick={() => {
                                  setDeviceToActivate(device)
                                  setActivationDuration(12)
                                  setActivationPaymentRef('')
                                  setActivationNotes('')
                                }}
                                className="inline-flex items-center rounded-md bg-emerald-600 text-white px-2.5 py-1 text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all focus:ring-2 focus:ring-emerald-500"
                                title="Approve payment & activate 1-year free subscription"
                              >
                                <Zap className="h-3 w-3 mr-1" />
                                {actStatus === 'pending_activation' ? 'Approve & Activate' : isExpired ? 'Renew License' : 'Activate'}
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setDeviceToActivate(device)
                                  setActivationDuration(12)
                                  setActivationPaymentRef('')
                                  setActivationNotes('')
                                }}
                                className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 text-primary px-2 py-1 text-xs font-medium hover:bg-primary/20 transition-colors"
                                title="Extend subscription"
                              >
                                <Calendar className="h-3 w-3 mr-1" />
                                Extend
                              </button>
                            )}

                            {actStatus === 'active' && !isExpired && (
                              <button
                                onClick={() => {
                                  setDeviceToSuspend(device)
                                  setSuspendReason('')
                                }}
                                className="inline-flex items-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-2 py-1 text-xs font-medium hover:bg-destructive/20 transition-colors"
                                title="Suspend device access"
                              >
                                <Ban className="h-3 w-3 mr-1" />
                                Suspend
                              </button>
                            )}

                            <button
                              disabled={!canUnassign || unassignDeviceMutation.isPending}
                              onClick={() => setDeviceToUnassign(device)}
                              className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                              title="Unassign device from school"
                            >
                              Unassign
                            </button>
                            <button
                              disabled={!canRetire || retireDeviceMutation.isPending}
                              onClick={() => {
                                setDeviceToRetire(device)
                                setRetireReason('damaged')
                              }}
                              className="inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
                              title="Retire device permanently"
                            >
                              Retire
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* OTA Firmware Update panel */}
          <div className="pt-4 border-t border-border space-y-3">
            <h4 className="text-sm font-medium text-primary">OTA Firmware Update</h4>
            <p className="text-xs text-muted-foreground">
              Select one or more assigned devices in the table above, then upload firmware or enter a URL.
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
                  className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors shadow-sm"
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
                  className="block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary focus:ring-1 sm:text-sm p-2 text-foreground"
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
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
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
          <div className="w-48">
            <label className="block text-sm font-medium text-foreground">Board Type</label>
            <select
              className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
              value={newItem.board_type}
              onChange={(e) => setNewItem({ ...newItem, board_type: e.target.value })}
            >
              <option value="ESP32-S3 N16R8">ESP32-S3 N16R8</option>
              <option value="ESP32-C3 Mini">ESP32-C3 Mini</option>
            </select>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Board Type</th>
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-xs">{item.board_type || 'ESP32-S3 N16R8'}</td>
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
      {/* Approve & Activate Modal */}
      {deviceToActivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl bg-card text-foreground p-6 shadow-2xl border border-border space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-emerald-500/15 p-2 text-emerald-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Approve & Activate AutoBell</h3>
                  <p className="text-xs text-muted-foreground">Grant cloud license & subscription to hardware</p>
                </div>
              </div>
              <button
                onClick={() => setDeviceToActivate(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="rounded-lg bg-muted/40 p-3.5 border border-border/60 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Device:</span>
                <span className="font-semibold text-foreground">{deviceToActivate.name || 'Unnamed Device'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">MAC Address:</span>
                <span className="text-foreground">{deviceToActivate.mac_address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">School:</span>
                <span className="font-sans font-medium text-foreground">{getSchoolInfo(deviceToActivate).name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Current Status:</span>
                <span className="uppercase text-amber-600 font-semibold">{deviceToActivate.activation_status || 'Pending'}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Subscription Duration
                </label>
                <select
                  value={activationDuration}
                  onChange={(e) => setActivationDuration(parseInt(e.target.value))}
                  className="w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-primary focus:ring-primary text-foreground"
                >
                  <option value={12}>1 Year (12 Months) — Standard 1st Year Free</option>
                  <option value={24}>2 Years (24 Months) — Multi-Year Plan</option>
                  <option value={36}>3 Years (36 Months)</option>
                  <option value={6}>6 Months — Trial / Semi-Annual</option>
                  <option value={120}>10 Years (Lifetime)</option>
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Subscribers will have full cloud control, schedule syncing, audio streaming, and automatic bell ringing until the license expiry date.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Payment Reference / Invoice / Bank Slip ID (Optional)
                </label>
                <input
                  type="text"
                  value={activationPaymentRef}
                  onChange={(e) => setActivationPaymentRef(e.target.value)}
                  placeholder="e.g. Bank Slip #49281, JazzCash Ref 91029, Cash Receipt"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-primary focus:ring-primary text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Activation Notes / Reseller (Optional)
                </label>
                <input
                  type="text"
                  value={activationNotes}
                  onChange={(e) => setActivationNotes(e.target.value)}
                  placeholder="e.g. Sold by Reseller Alpha, Paid in full"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-primary focus:ring-primary text-foreground"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setDeviceToActivate(null)}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={activateDeviceMutation.isPending}
                onClick={() => {
                  if (deviceToActivate) {
                    activateDeviceMutation.mutate({
                      deviceId: deviceToActivate.id,
                      durationMonths: activationDuration,
                      paymentRef: activationPaymentRef.trim(),
                      notes: activationNotes.trim()
                    })
                  }
                }}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
              >
                {activateDeviceMutation.isPending ? 'Activating Device...' : 'Confirm & Activate (1 Year Free)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Device Modal */}
      {deviceToSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-card text-foreground p-6 shadow-2xl border border-border space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-2 text-destructive border-b border-border pb-3">
              <Ban className="h-5 w-5" />
              <h3 className="text-lg font-bold text-foreground">Suspend AutoBell Device</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Suspending this device will lock its schedules, silence bells, and display an inactive notice on the hardware until reactivated.
            </p>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Reason for suspension (optional)
              </label>
              <input
                type="text"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g. Payment due, Disputed order, Cheque bounced"
                className="w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm focus:border-destructive focus:ring-destructive text-foreground"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setDeviceToSuspend(null)}
                className="rounded-md border border-input bg-background px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={suspendDeviceMutation.isPending}
                onClick={() => {
                  if (deviceToSuspend) {
                    suspendDeviceMutation.mutate({
                      deviceId: deviceToSuspend.id,
                      reason: suspendReason.trim()
                    })
                  }
                }}
                className="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-all shadow-sm"
              >
                {suspendDeviceMutation.isPending ? 'Suspending...' : 'Confirm Suspension'}
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

