import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { School, User, Wifi, HardDrive, Activity, Handshake } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { formatNotificationTime } from '@/lib/timeFormat'


export default function Overview() {
  const [stats, setStats] = useState({
    schools: 0,
    devices: 0,
    onlineDevices: 0,
    inventory: 0,
    users: 0,
    partners: 0
  })

  interface DeviceLog {
    id: string
    device_id: string
    message: string
    level: string
    created_at: string
    bell_devices?: {
      name: string
      school_id: string
      schools?: {
        name: string
      } | null
    } | null
  }

  const [logs, setLogs] = useState<DeviceLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const isMounted = useRef(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    async function fetchStats() {
      try {
        const [
          schoolsRes,
          devicesRes,
          activeDevicesRes,
          inventoryRes,
          usersRes,
          partnersRes
        ] = await Promise.all([
          supabase.from('schools').select('*', { count: 'exact', head: true }),
          supabase.from('bell_devices').select('*', { count: 'exact', head: true }),
          supabase.from('bell_devices').select('id, status, last_heartbeat'),
          supabase.from('device_inventory').select('*', { count: 'exact', head: true }),
          supabase.from('users').select('*', { count: 'exact', head: true }),
          supabase.from('partners').select('*', { count: 'exact', head: true })
        ])

        const schoolsCount = schoolsRes.count || 0
        const totalDevicesCount = devicesRes.count || 0
        const activeDevicesData = activeDevicesRes.data || []
        const inventoryCount = inventoryRes.count || 0
        const usersCount = usersRes.count || 0

        const onlineCount = activeDevicesData.filter(d => {
          const isOnlineByStatus = d.status === 'online'
          const isOnlineByHeartbeat = d.last_heartbeat 
            ? Date.now() - new Date(d.last_heartbeat).getTime() <= 5 * 60 * 1000 
            : false
          return isOnlineByStatus || isOnlineByHeartbeat
        }).length || 0

        if (isMounted.current) {
          setStats({
            schools: schoolsCount,
            devices: totalDevicesCount,
            onlineDevices: onlineCount,
            inventory: inventoryCount,
            users: usersCount,
            partners: partnersRes.count || 0
          })
        }
      } catch (error) {
        if (!isMounted.current) return
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error fetching stats:', error)
      }
    }
    fetchStats()
  }, [])

  useEffect(() => {
    async function fetchLogs() {
      try {
        const { data, error } = await supabase
          .from('device_logs')
          .select(`
            id,
            device_id,
            message,
            level,
            created_at,
            bell_devices (
              name,
              school_id,
              schools (
                name
              )
            )
          `)
          .order('created_at', { ascending: false })
          .limit(10)

        if (error) throw error

        if (isMounted.current) {
          const mappedLogs = (data || []).map((log: any) => {
            const device = Array.isArray(log.bell_devices) ? log.bell_devices[0] : log.bell_devices;
            const school = device && Array.isArray(device.schools) ? device.schools[0] : (device?.schools || null);
            return {
              id: log.id,
              device_id: log.device_id,
              message: log.message,
              level: log.level,
              created_at: log.created_at,
              bell_devices: device ? {
                name: device.name,
                school_id: device.school_id,
                schools: school
              } : null
            };
          });
          setLogs(mappedLogs)
          setLoadingLogs(false)
        }
      } catch (error) {
        console.error('Error fetching logs:', error)
        if (isMounted.current) {
          setLoadingLogs(false)
        }
      }
    }
    fetchLogs()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('public:device_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'device_logs' },
        async (payload) => {
          const newLogRaw = payload.new as any
          try {
            const { data: deviceData } = await supabase
              .from('bell_devices')
              .select(`
                name,
                school_id,
                schools (
                  name
                )
              `)
              .eq('id', newLogRaw.device_id)
              .single()

            const completeLog = {
              ...newLogRaw,
              bell_devices: deviceData
            }

            if (isMounted.current) {
              setLogs((prevLogs) => [completeLog, ...prevLogs].slice(0, 10))
            }
          } catch (err) {
            console.error('Error processing real-time log payload:', err)
            if (isMounted.current) {
              setLogs((prevLogs) => [newLogRaw, ...prevLogs].slice(0, 10))
            }
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [])

  const statCards = [
    { name: 'Total Schools', value: stats.schools, icon: School, color: 'text-blue-600', bg: 'bg-blue-100', href: '/super-admin/schools' },
    { name: 'Active Devices', value: `${stats.onlineDevices} / ${stats.devices}`, icon: Wifi, color: 'text-green-600', bg: 'bg-green-100', href: '/super-admin/schools' },
    { name: 'Active Partners', value: stats.partners, icon: Handshake, color: 'text-indigo-600', bg: 'bg-indigo-100', href: '/super-admin/partners' },
    { name: 'Inventory Stock', value: stats.inventory, icon: HardDrive, color: 'text-purple-600', bg: 'bg-purple-100', href: '/super-admin/inventory' },
    { name: 'Total Users', value: stats.users, icon: User, color: 'text-orange-600', bg: 'bg-orange-100', href: '/super-admin/users' },
  ]

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 },
  }

  const barData = [
    { name: 'Schools', value: stats.schools, color: 'bg-sky-500' },
    { name: 'Devices', value: stats.devices, color: 'bg-emerald-500' },
    { name: 'Inventory', value: stats.inventory, color: 'bg-violet-500' },
    { name: 'Users', value: stats.users, color: 'bg-orange-500' },
  ]

  const maxValue = Math.max(...barData.map(entry => entry.value), 1)

  const onlinePercent = stats.devices > 0 ? (stats.onlineDevices / stats.devices) * 100 : 0
  
  let networkStatus = {
    text: 'Network Optimal',
    badgeClass: 'bg-emerald-500/10 border-emerald-500/40',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-700 dark:text-emerald-300'
  }
  
  if (stats.devices === 0) {
    networkStatus = {
      text: 'No Devices Connected',
      badgeClass: 'bg-slate-500/10 border-slate-500/40',
      dotClass: 'bg-slate-400',
      textClass: 'text-slate-700 dark:text-slate-300'
    }
  } else if (onlinePercent === 100) {
    networkStatus = {
      text: 'Network Optimal',
      badgeClass: 'bg-emerald-500/10 border-emerald-500/40',
      dotClass: 'bg-emerald-400',
      textClass: 'text-emerald-700 dark:text-emerald-300'
    }
  } else if (onlinePercent >= 75) {
    networkStatus = {
      text: 'Network Healthy',
      badgeClass: 'bg-emerald-500/10 border-emerald-500/40',
      dotClass: 'bg-emerald-400',
      textClass: 'text-emerald-700 dark:text-emerald-300'
    }
  } else if (onlinePercent >= 40) {
    networkStatus = {
      text: 'Degraded Service',
      badgeClass: 'bg-amber-500/10 border-amber-500/40',
      dotClass: 'bg-amber-400',
      textClass: 'text-amber-700 dark:text-amber-300'
    }
  } else {
    networkStatus = {
      text: 'Critical Network Outage',
      badgeClass: 'bg-red-500/10 border-red-500/40',
      dotClass: 'bg-red-400',
      textClass: 'text-red-700 dark:text-red-300'
    }
  }

  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div className="flex items-center justify-between" variants={item}>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dashboard Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Super Admin view across all schools and devices.</p>
        </div>
        <div className={`hidden sm:flex items-center gap-2 rounded-full px-4 py-2 border shadow-sm ${networkStatus.badgeClass}`}>
          <span className={`inline-flex h-2 w-2 rounded-full animate-ping ${networkStatus.dotClass}`} />
          <span className={`inline-flex h-2 w-2 rounded-full ${networkStatus.dotClass}`} />
          <span className={`text-xs font-medium ${networkStatus.textClass}`}>{networkStatus.text}</span>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5" variants={item}>
        {statCards.map((stat) => (
          <Link to={stat.href} key={stat.name} className="block">
          <motion.div
            className="overflow-hidden rounded-2xl bg-card/70 shadow-lg border border-border h-full cursor-pointer hover:border-primary/50 transition-all"
            whileHover={{ y: -4, scale: 1.01 }}
          >
            <div className="relative p-5">
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
              <div className="flex items-center relative z-10">
                <div className="flex-shrink-0">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-muted`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} aria-hidden="true" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="truncate text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {stat.name}
                    </dt>
                    <dd>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </motion.div>
          </Link>
        ))}
      </motion.div>

      <motion.div
        variants={item}
        className="grid gap-6 lg:grid-cols-[2.2fr,1.3fr]"
      >
        <div className="rounded-2xl bg-card/70 p-6 shadow-xl border border-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Global Deployment</h3>
              <p className="text-xs text-muted-foreground mt-1">Relative scale of schools, devices, inventory, and users.</p>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-1">
              <p>{stats.schools} schools</p>
              <p>{stats.devices} devices</p>
              <p>{stats.inventory} inventory</p>
              <p>{stats.users} users</p>
            </div>
          </div>
          <div className="flex items-end gap-4 h-52">
            {barData.map((entry) => (
              <div key={entry.name} className="flex-1 flex flex-col items-center gap-3">
                <div className="flex h-full w-full items-end justify-center rounded-2xl bg-muted px-3 py-3">
                  <div
                    className={`${entry.color} w-7 rounded-xl shadow-md transition-all duration-700`}
                    style={{ height: `${maxValue ? (entry.value / maxValue) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex flex-col items-center text-xs">
                  <span className="text-muted-foreground font-medium">{entry.name}</span>
                  <span className="text-muted-foreground">{entry.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-card/70 p-6 shadow-xl border border-border">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-sky-400" />
            <h3 className="text-lg font-medium text-foreground">Network Snapshot</h3>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="relative h-40 w-40">
              <div className="absolute inset-0 rounded-full bg-muted border border-border" />
              <div className="absolute inset-3 rounded-full bg-gradient-to-tr from-emerald-500/40 via-sky-500/40 to-violet-500/40 blur-sm" />
              <div className="absolute inset-6 rounded-full bg-background flex flex-col items-center justify-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Total Devices</span>
                <span className="mt-1 text-2xl font-semibold text-foreground">{stats.devices}</span>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              <div>
                <p className="text-muted-foreground font-medium">Schools</p>
                <p className="text-muted-foreground">{stats.schools}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <div>
                <p className="text-muted-foreground font-medium">Inventory</p>
                <p className="text-muted-foreground">{stats.inventory}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              <div>
                <p className="text-muted-foreground font-medium">Users</p>
                <p className="text-muted-foreground">{stats.users}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              <div>
                <p className="text-muted-foreground font-medium">Devices per School</p>
                <p className="text-muted-foreground">
                  {stats.schools > 0 ? (stats.devices / stats.schools).toFixed(1) : '0.0'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Global Live Activity Log */}
      <motion.div
        variants={item}
        className="rounded-2xl bg-card/70 p-6 shadow-xl border border-border"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-500 animate-pulse" />
            <h3 className="text-lg font-semibold text-foreground">Global Live Activity Log</h3>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            Live Feed
          </div>
        </div>

        {loadingLogs ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <span className="text-sm text-muted-foreground">Listening for device activities...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No recent device activities recorded.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Logs will appear in real-time as devices execute schedules.</p>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[300px] space-y-2 pr-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {logs.map((log) => {
              const deviceName = log.bell_devices?.name || 'Unknown Device'
              const schoolName = log.bell_devices?.schools?.name || 'Unknown School'
              
              let levelBadge = 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
              if (log.level === 'error' || log.level === 'critical') {
                levelBadge = 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
              } else if (log.level === 'warning') {
                levelBadge = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
              } else if (log.level === 'info') {
                levelBadge = 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20'
              }

              return (
                <div
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border ${levelBadge} capitalize`}>
                      {log.level || 'info'}
                    </span>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{log.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {schoolName} &bull; {deviceName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                    <span className="text-[10px] text-muted-foreground uppercase font-mono font-medium">
                      {formatNotificationTime(log.created_at)}
                    </span>
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
