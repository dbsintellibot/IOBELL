import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Bell, Wifi, Calendar, HardDrive, MapPin, Activity, CheckCircle, Clock, AlertTriangle, Radio, Megaphone, Mic, Play } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { formatNotificationTime } from '@/lib/timeFormat'

export default function Overview() {
  const { schoolId } = useAuth()

  const [recentLogs, setRecentLogs] = useState<Array<{
    id: string
    message: string
    level: string
    created_at: string
    device_name?: string
  }>>([])

  useEffect(() => {
    if (!schoolId) return

    const fetchLogs = async () => {
      const { data: devices } = await supabase.from('bell_devices').select('id, name').eq('school_id', schoolId)
      if (!devices || devices.length === 0) return
      const deviceMap = new Map(devices.map(d => [d.id, d.name]))
      const deviceIds = devices.map(d => d.id)

      const { data: logs } = await supabase
        .from('device_logs')
        .select('id, message, level, created_at, device_id')
        .in('device_id', deviceIds)
        .order('created_at', { ascending: false })
        .limit(15)

      if (logs) {
        setRecentLogs(logs.map(log => ({
          id: log.id,
          message: log.message,
          level: log.level || 'info',
          created_at: log.created_at,
          device_name: deviceMap.get(log.device_id) || 'School Device'
        })))
      }
    }

    fetchLogs()

    const channel = supabase
      .channel(`overview-activity-${schoolId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_logs' },
        async (payload) => {
          const newLog = payload.new as any
          const { data: dev } = await supabase.from('bell_devices').select('name').eq('id', newLog.device_id).eq('school_id', schoolId).maybeSingle()
          if (!dev) return

          setRecentLogs(prev => [
            {
              id: newLog.id || Math.random().toString(),
              message: newLog.message,
              level: newLog.level || 'info',
              created_at: newLog.created_at || new Date().toISOString(),
              device_name: dev.name
            },
            ...prev.slice(0, 14)
          ])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [schoolId])

  const { data: stats, isLoading } = useQuery({
    queryKey: ['overview-stats', schoolId],
    queryFn: async () => {
      const totalDevicesRes = await supabase
        .from('bell_devices')
        .select('id', { count: 'exact', head: true })

      const onlineDevicesRes = await supabase
        .from('bell_devices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'online')

      const totalProfilesRes = await supabase
        .from('bell_profiles')
        .select('id', { count: 'exact', head: true })

      const audioFilesRes = await supabase
        .from('audio_files')
        .select('id', { count: 'exact', head: true })
        .not('storage_path', 'ilike', 'combined/%')

      let schoolName = 'My School'
      let pendingCommandsCount = 0
      if (schoolId) {
        const schoolRes = await supabase
          .from('schools')
          .select('name')
          .eq('id', schoolId)
          .maybeSingle()

        if (!schoolRes.error && schoolRes.data) {
          schoolName = schoolRes.data.name
        }

        // Fetch device IDs to get command queue count
        const { data: devices } = await supabase
          .from('bell_devices')
          .select('id')
          .eq('school_id', schoolId)

        if (devices && devices.length > 0) {
          const deviceIds = devices.map(d => d.id)
          const { count } = await supabase
            .from('command_queue')
            .select('id', { count: 'exact', head: true })
            .in('device_id', deviceIds)
            .eq('status', 'pending')
          pendingCommandsCount = count ?? 0
        }
      }

      const primaryOnlineRes = await supabase
        .from('bell_devices')
        .select('id, name, mac_address, status, last_heartbeat, volume, firmware_version, board_type, input_voltage_mv, location_area, location_city, location_country, location_continent')
        .eq('school_id', schoolId)
        .eq('status', 'online')
        .limit(1)
        .maybeSingle()

      const firstDeviceRes = await supabase
        .from('bell_devices')
        .select('id, name, mac_address, status, last_heartbeat, volume, firmware_version, board_type, input_voltage_mv, location_area, location_city, location_country, location_continent')
        .eq('school_id', schoolId)
        .limit(1)
        .maybeSingle()

      const primaryDevice = primaryOnlineRes.data || firstDeviceRes.data || null

      return {
        totalDevices: totalDevicesRes.count ?? 0,
        onlineDevices: onlineDevicesRes.count ?? 0,
        totalProfiles: totalProfilesRes.count ?? 0,
        audioFilesCount: audioFilesRes.count ?? 0,
        pendingCommandsCount,
        schoolName,
        primaryDevice
      }
    },
    enabled: !!schoolId, 
    staleTime: 1000 * 60 * 5, 
    retry: 1
  })

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse p-2">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="col-span-1 md:col-span-2 h-44 bg-muted rounded-xl" />
          <div className="h-44 bg-muted rounded-xl" />
          <div className="h-44 bg-muted rounded-xl" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-64 bg-muted rounded-xl" />
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    )
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  }

  const totalDevices = stats?.totalDevices ?? 0
  const onlineDevices = stats?.onlineDevices ?? 0
  const offlineDevices = Math.max(totalDevices - onlineDevices, 0)
  const onlinePercentage = totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0

  const profileCount = stats?.totalProfiles ?? 0
  const audioCount = stats?.audioFilesCount ?? 0
  const pendingCommandsCount = stats?.pendingCommandsCount ?? 0

  const resourceData = [
    { label: 'Profiles', value: profileCount, color: 'bg-sky-500' },
    { label: 'Audio Files', value: audioCount, color: 'bg-violet-500' },
    { label: 'Devices', value: totalDevices, color: 'bg-emerald-500' }
  ]

  const maxResourceValue = Math.max(...resourceData.map(r => r.value), 1)

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold text-foreground">{stats?.schoolName}</h1>
        <p className="text-sm text-muted-foreground">Dashboard Overview</p>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <motion.div 
          variants={item}
          whileHover={{ scale: 1.02 }}
          className="rounded-xl bg-gradient-to-br from-emerald-500 via-blue-600 to-indigo-700 p-6 shadow-xl text-white col-span-1 md:col-span-2 relative overflow-hidden"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
          
          <div className="flex items-center justify-between relative z-10">
            <h3 className="text-sm font-medium text-emerald-50/90">Primary Bell</h3>
            <Bell className="h-5 w-5 text-emerald-50" />
          </div>
          {stats?.primaryDevice ? (
            <div className="mt-4 relative z-10">
               <p className="text-2xl font-bold">{stats.primaryDevice.name || 'Unnamed Device'}</p>
               <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                 <div>
                   <p className="text-emerald-100 text-xs uppercase tracking-wider">MAC Address</p>
                   <p className="font-mono text-white/90 truncate">{stats.primaryDevice.mac_address || 'N/A'}</p>
                 </div>
                 <div>
                   <p className="text-emerald-100 text-xs uppercase tracking-wider">Location</p>
                    <div className="flex items-center text-white/90 truncate">
                      <MapPin className="mr-1 h-3 w-3 shrink-0" />
                      <span className="truncate">
                         {[
                           stats.primaryDevice.location_area,
                           stats.primaryDevice.location_city,
                           stats.primaryDevice.location_country,
                           stats.primaryDevice.location_continent
                         ].filter(val => val && val.trim().toLowerCase() !== 'null' && val.trim().toLowerCase() !== 'undefined').join(', ') || 'N/A'}
                      </span>
                    </div>
                 </div>
                 <div>
                   <p className="text-emerald-100 text-xs uppercase tracking-wider">Status</p>
                   <p className="text-white/90 truncate">
                     {stats.primaryDevice.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                     {stats.primaryDevice.last_heartbeat ? ` (${new Date(stats.primaryDevice.last_heartbeat).toLocaleTimeString()})` : ''}
                   </p>
                 </div>
                 <div>
                   <p className="text-emerald-100 text-xs uppercase tracking-wider">Volume</p>
                   <p className="text-white/90">
                     {stats.primaryDevice.volume !== null && stats.primaryDevice.volume !== undefined
                       ? `${stats.primaryDevice.volume}/21`
                       : 'N/A'}
                   </p>
                 </div>
                 <div>
                   <p className="text-emerald-100 text-xs uppercase tracking-wider">Firmware</p>
                   <p className="text-white/90 truncate">
                     {stats.primaryDevice.firmware_version || 'N/A'}
                   </p>
                 </div>
                  <div>
                    <p className="text-emerald-100 text-xs uppercase tracking-wider">Input Power</p>
                    <p className="text-white/90">
                      {typeof stats.primaryDevice.input_voltage_mv === 'number'
                        ? `${(stats.primaryDevice.input_voltage_mv / 1000).toFixed(2)} V (${stats.primaryDevice.input_voltage_mv >= 4500 ? 'Mains' : 'Battery'})`
                        : 'N/A'}
                    </p>
                  </div>
               </div>
            </div>
          ) : (
             <div className="mt-4 relative z-10">
                <p className="text-lg font-semibold">No devices registered</p>
                <p className="text-sm text-emerald-100/80">Add a device to get started</p>
             </div>
          )}
        </motion.div>

        <motion.div 
          variants={item}
          whileHover={{ y: -5 }}
          className="rounded-xl bg-card/70 p-6 shadow-lg border border-border"
        >
          <div className="flex items-center justify-between">
             <h3 className="text-sm font-medium text-muted-foreground">Online Devices</h3>
             <div className="rounded-full bg-emerald-500/10 p-2">
               <Wifi className="h-4 w-4 text-emerald-400" />
             </div>
          </div>
          <p className="mt-4 text-3xl font-bold text-foreground">{onlineDevices}</p>
          <p className="text-sm text-muted-foreground">{onlineDevices} of {totalDevices} devices online</p>
        </motion.div>

        <motion.div 
          variants={item}
          whileHover={{ y: -5 }}
          className="rounded-xl bg-card/70 p-6 shadow-lg border border-border"
        >
           <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Total Profiles</h3>
            <div className="rounded-full bg-sky-500/10 p-2">
              <Calendar className="h-4 w-4 text-sky-400" />
            </div>
           </div>
           <p className="mt-4 text-3xl font-bold text-foreground">{profileCount}</p>
           <p className="text-sm text-muted-foreground">Schedule configurations</p>
        </motion.div>

        <motion.div 
          variants={item}
          whileHover={{ y: -5 }}
          className="rounded-xl bg-card/70 p-6 shadow-lg border border-border"
        >
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Audio Files</h3>
                <div className="rounded-full bg-violet-500/10 p-2">
                  <HardDrive className="h-4 w-4 text-violet-400" />
                </div>
            </div>
            <p className="mt-4 text-3xl font-bold text-foreground">{audioCount}</p>
             <p className="text-sm text-muted-foreground">Uploaded files</p>
        </motion.div>

        <motion.div 
          variants={item}
          whileHover={{ y: -5 }}
          className="rounded-xl bg-card/70 p-6 shadow-lg border border-border"
        >
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Pending Commands</h3>
                <div className="rounded-full bg-amber-500/10 p-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
            </div>
            <p className="mt-4 text-3xl font-bold text-foreground">{pendingCommandsCount}</p>
             <p className="text-sm text-muted-foreground">Commands in queue</p>
        </motion.div>
      </div>

      <motion.div
        variants={item}
        className="grid gap-6 lg:grid-cols-[2.2fr,1.3fr]"
      >
        <div className="rounded-xl bg-card/70 p-6 shadow-xl border border-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Device Health</h3>
              <p className="text-xs text-muted-foreground mt-1">Live overview of online versus offline devices.</p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-3xl font-bold text-emerald-400">{onlinePercentage}%</span>
              <span className="text-xs text-muted-foreground">currently online</span>
            </div>
          </div>
          <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-500 transition-all duration-700"
              style={{ width: `${onlinePercentage}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <div>
                <p className="text-muted-foreground font-medium">Online</p>
                <p className="text-muted-foreground">{onlineDevices} devices</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-600" />
              <div>
                <p className="text-muted-foreground font-medium">Offline</p>
                <p className="text-muted-foreground">{offlineDevices} devices</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              <div>
                <p className="text-muted-foreground font-medium">Total</p>
                <p className="text-muted-foreground">{totalDevices} registered</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card/70 p-6 shadow-xl border border-border">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-sky-400" />
            <h3 className="text-lg font-medium text-foreground">System Distribution</h3>
          </div>
          <div className="flex items-end gap-4 h-40">
            {resourceData.map(entry => (
              <div key={entry.label} className="flex-1 flex flex-col items-center gap-3">
                <div className="flex h-full w-full items-end justify-center rounded-full bg-muted px-3 py-2">
                  <div
                    className={`${entry.color} w-6 rounded-full shadow-md transition-all duration-700`}
                    style={{ height: `${maxResourceValue ? (entry.value / maxResourceValue) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex flex-col items-center text-xs">
                  <span className="text-muted-foreground font-medium">{entry.label}</span>
                  <span className="text-muted-foreground">{entry.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div 
        variants={item}
        className="rounded-xl bg-card/70 p-6 shadow-lg border border-border"
      >
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-sky-400" />
          <h3 className="text-lg font-medium text-foreground">Recent Activity</h3>
        </div>
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {recentLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center text-muted-foreground bg-muted/30 rounded-xl border border-dashed border-border/70 space-y-2">
              <Activity className="h-8 w-8 text-muted-foreground/40 stroke-1" />
              <p className="text-sm font-medium text-foreground">No recent hardware activity logs</p>
              <p className="text-xs text-muted-foreground max-w-sm">Device events, scheduled bell rings, TTS broadcasts, and system commands will appear here in real-time.</p>
            </div>
          ) : (
            recentLogs.map((log) => {
              const isInQueue = log.level === 'in queue' || log.message.includes('[In Queue]')
              const isSuccess = log.level === 'success' || log.message.includes('[Ran Successfully]')
              const isError = log.level === 'error'
              const isTts = log.message.toLowerCase().includes('tts')
              const isVoice = log.message.toLowerCase().includes('voice note')
              const isPlay = log.message.toLowerCase().includes('play_url') || log.message.toLowerCase().includes('playback')

              return (
                <div
                  key={log.id}
                  className="flex items-start justify-between rounded-lg bg-card p-3.5 shadow-sm border border-border/60 transition-all hover:bg-accent/40 gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`mt-0.5 rounded-full p-2 flex-shrink-0 ${
                        isInQueue
                          ? 'bg-amber-500/10 text-amber-500'
                          : isSuccess
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : isError
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-sky-500/10 text-sky-500'
                      }`}
                    >
                      {isTts ? (
                        <Megaphone className="h-4 w-4" />
                      ) : isVoice ? (
                        <Mic className="h-4 w-4" />
                      ) : isPlay ? (
                        <Play className="h-4 w-4" />
                      ) : isInQueue ? (
                        <Clock className="h-4 w-4" />
                      ) : isSuccess ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : isError ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <Radio className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {log.device_name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
                            isInQueue
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : isSuccess
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : isError
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                          }`}
                        >
                          {isInQueue ? 'In Queue' : isSuccess ? 'Ran Successfully' : isError ? 'Error' : 'Info'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed break-words">
                        {log.message.replace(/^\[(In Queue|Ran Successfully)\]\s*/i, '')}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0 font-mono mt-0.5">
                    {formatNotificationTime(log.created_at)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
