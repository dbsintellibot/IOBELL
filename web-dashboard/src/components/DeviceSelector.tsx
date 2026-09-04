import { useMemo } from 'react'
import { CheckSquare, Square, Wifi, WifiOff } from 'lucide-react'

export type DeviceOption = {
  id: string
  name: string
  mac_address: string | null
  status: string | null
  last_heartbeat: string | null
  location_area?: string | null
  location_city?: string | null
  profile_id?: string | null
  profile_name?: string | null
}

const ONLINE_TIMEOUT_MS = 5 * 60 * 1000

function isDeviceOnline(status: string | null, last_heartbeat: string | null): boolean {
  if (last_heartbeat) {
    const last = new Date(last_heartbeat).getTime()
    if (!Number.isNaN(last)) {
      return Date.now() - last <= ONLINE_TIMEOUT_MS
    }
  }
  return status === 'online'
}

type DeviceSelectorProps = {
  devices: DeviceOption[]
  selectedDeviceIds: string[]
  onChange: (selectedIds: string[]) => void
  isLoading?: boolean
}

export function DeviceSelector({ devices, selectedDeviceIds, onChange, isLoading }: DeviceSelectorProps) {
  const onlineCount = useMemo(() => {
    return devices.filter(d => isDeviceOnline(d.status, d.last_heartbeat)).length
  }, [devices])

  const allSelected = useMemo(() => {
    return devices.length > 0 && selectedDeviceIds.length === devices.length
  }, [devices, selectedDeviceIds])

  const toggleSelectAll = () => {
    if (allSelected) {
      onChange([])
    } else {
      onChange(devices.map(d => d.id))
    }
  }

  const toggleDevice = (id: string) => {
    if (selectedDeviceIds.includes(id)) {
      onChange(selectedDeviceIds.filter(item => item !== id))
    } else {
      onChange([...selectedDeviceIds, id])
    }
  }

  const selectOnlineOnly = () => {
    const onlineIds = devices
      .filter(d => isDeviceOnline(d.status, d.last_heartbeat))
      .map(d => d.id)
    onChange(onlineIds)
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded-lg" />
        </div>
      </div>
    )
  }

  if (!devices || devices.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
        No bell devices found registered to your school.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors focus:outline-none"
          >
            {allSelected ? (
              <CheckSquare className="h-5 w-5 text-primary" />
            ) : selectedDeviceIds.length > 0 ? (
              <div className="flex h-5 w-5 items-center justify-center rounded border-2 border-primary bg-primary/20 text-primary font-bold text-xs">
                -
              </div>
            ) : (
              <Square className="h-5 w-5 text-muted-foreground" />
            )}
            Target Devices ({selectedDeviceIds.length} of {devices.length} selected)
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onChange(devices.map(d => d.id))}
            className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={selectOnlineOnly}
            className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
          >
            <Wifi className="h-3 w-3" />
            Online Only ({onlineCount})
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {devices.map(device => {
          const isSelected = selectedDeviceIds.includes(device.id)
          const online = isDeviceOnline(device.status, device.last_heartbeat)

          return (
            <div
              key={device.id}
              onClick={() => toggleDevice(device.id)}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all ${
                isSelected
                  ? 'border-primary/60 bg-primary/5 shadow-sm'
                  : 'border-border/60 bg-background/50 hover:bg-muted/40'
              }`}
            >
              <div className="mt-0.5 text-primary">
                {isSelected ? (
                  <CheckSquare className="h-5 w-5 text-primary" />
                ) : (
                  <Square className="h-5 w-5 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-sm font-medium text-foreground">
                    {device.name}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      online
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                    {online ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {device.location_area && (
                    <span className="truncate">📍 {device.location_area}</span>
                  )}
                  <span className="truncate text-[11px] text-primary/80 font-mono">
                    📋 {device.profile_name || 'School Default Profile'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
