import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { School, User, Wifi, HardDrive, Activity } from 'lucide-react'
import { motion } from 'framer-motion'

export default function Overview() {
  const [stats, setStats] = useState({
    schools: 0,
    devices: 0,
    inventory: 0,
    users: 0
  })
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
          { count: schoolsCount },
          { count: devicesCount },
          { count: inventoryCount },
          { count: usersCount }
        ] = await Promise.all([
          supabase.from('schools').select('*', { count: 'exact', head: true }),
          supabase.from('bell_devices').select('*', { count: 'exact', head: true }),
          supabase.from('device_inventory').select('*', { count: 'exact', head: true }),
          supabase.from('users').select('*', { count: 'exact', head: true })
        ])

        if (isMounted.current) {
          setStats({
            schools: schoolsCount || 0,
            devices: devicesCount || 0,
            inventory: inventoryCount || 0,
            users: usersCount || 0
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

  const statCards = [
    { name: 'Total Schools', value: stats.schools, icon: School, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: 'Active Devices', value: stats.devices, icon: Wifi, color: 'text-green-600', bg: 'bg-green-100' },
    { name: 'Inventory Stock', value: stats.inventory, icon: HardDrive, color: 'text-purple-600', bg: 'bg-purple-100' },
    { name: 'Total Users', value: stats.users, icon: User, color: 'text-orange-600', bg: 'bg-orange-100' },
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
        <div className="hidden sm:flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 border border-emerald-500/40 shadow-sm">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Network Healthy</span>
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" variants={item}>
        {statCards.map((stat) => (
          <motion.div
            key={stat.name}
            className="overflow-hidden rounded-2xl bg-card/70 shadow-lg border border-border"
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
    </motion.div>
  )
}
