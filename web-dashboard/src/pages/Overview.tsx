import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Bell, Wifi, Calendar, HardDrive, MapPin, Activity } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { motion } from 'framer-motion'

export default function Overview() {
  const { schoolId } = useAuth()

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

      let schoolName = 'My School'
      if (schoolId) {
        const schoolRes = await supabase
          .from('schools')
          .select('name')
          .eq('id', schoolId)
          .maybeSingle()

        if (!schoolRes.error && schoolRes.data) {
          schoolName = schoolRes.data.name
        }
      }

      const primaryOnlineRes = await supabase
        .from('bell_devices')
        .select('name, mac_address, location')
        .eq('status', 'online')
        .limit(1)
        .maybeSingle()

      const firstDeviceRes = await supabase
        .from('bell_devices')
        .select('name, mac_address, location')
        .limit(1)
        .maybeSingle()

      const primaryDevice = primaryOnlineRes.data || firstDeviceRes.data || null

      return {
        totalDevices: totalDevicesRes.count ?? 0,
        onlineDevices: onlineDevicesRes.count ?? 0,
        totalProfiles: totalProfilesRes.count ?? 0,
        audioFilesCount: audioFilesRes.count ?? 0,
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
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
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
               <p className="text-2xl font-bold">{stats.primaryDevice.name}</p>
               <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                 <div>
                   <p className="text-emerald-100 text-xs uppercase tracking-wider">MAC Address</p>
                   <p className="font-mono text-white/90">{stats.primaryDevice.mac_address}</p>
                 </div>
                 {stats.primaryDevice.location && (
                   <div>
                    <p className="text-emerald-100 text-xs uppercase tracking-wider">Location</p>
                     <div className="flex items-center text-white/90">
                       <MapPin className="mr-1 h-3 w-3" />
                       {stats.primaryDevice.location}
                     </div>
                   </div>
                 )}
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
        <div className="space-y-4">
            <div className="flex items-center justify-center py-8 text-muted-foreground bg-muted rounded-lg border border-dashed border-border">
              <p className="text-sm">No recent activity logs available.</p>
            </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
