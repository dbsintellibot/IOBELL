import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Bell, Wifi, Calendar, HardDrive, MapPin } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function Overview() {
  const { schoolId } = useAuth()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['overview-stats', schoolId],
    queryFn: async () => {
      const [
        { count: totalDevices },
        { count: onlineDevices },
        { count: totalProfiles },
        { count: audioFilesCount }
      ] = await Promise.all([
        supabase.from('bell_devices').select('*', { count: 'exact', head: true }),
        supabase.from('bell_devices').select('*', { count: 'exact', head: true }).eq('status', 'online'),
        supabase.from('bell_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('audio_files').select('*', { count: 'exact', head: true })
      ])

      let schoolName = 'My School'
      if (schoolId) {
        // Try to fetch school name if table exists, otherwise fallback
        const { data: schoolData } = await supabase
          .from('schools')
          .select('name')
          .eq('id', schoolId)
          .maybeSingle()
        
        if (schoolData) {
          schoolName = schoolData.name
        }
      }

      // Fetch primary device (Online or First)
      let { data: primaryDevice } = await supabase
        .from('bell_devices')
        .select('name, mac_address, location')
        .eq('status', 'online')
        .limit(1)
        .maybeSingle()

      if (!primaryDevice) {
        const { data: firstDevice } = await supabase
          .from('bell_devices')
          .select('name, mac_address, location')
          .limit(1)
          .maybeSingle()
        primaryDevice = firstDevice
      }

      return {
        totalDevices: totalDevices || 0,
        onlineDevices: onlineDevices || 0,
        totalProfiles: totalProfiles || 0,
        audioFilesCount: audioFilesCount || 0,
        schoolName,
        primaryDevice
      }
    },
    enabled: !!schoolId // Only run query when schoolId is available (or we can let it run and handle null)
  })

  if (isLoading) {
    return <div className="text-gray-500">Loading overview...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{stats?.schoolName}</h1>
        <p className="text-sm text-gray-500">Dashboard Overview</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Active Bells Card - Enhanced with Primary Device Info */}
        <div className="rounded-lg bg-white p-6 shadow-sm border col-span-1 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">Primary Bell</h3>
            <Bell className="h-4 w-4 text-gray-400" />
          </div>
          {stats?.primaryDevice ? (
            <div className="mt-4">
               <p className="text-xl font-bold text-gray-900">{stats.primaryDevice.name}</p>
               <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                 <div>
                   <p className="text-gray-500">MAC Address</p>
                   <p className="font-mono text-gray-900">{stats.primaryDevice.mac_address}</p>
                 </div>
                 {stats.primaryDevice.location && (
                   <div>
                     <p className="text-gray-500">Location</p>
                     <div className="flex items-center text-gray-900">
                       <MapPin className="mr-1 h-3 w-3 text-gray-400" />
                       {stats.primaryDevice.location}
                     </div>
                   </div>
                 )}
               </div>
            </div>
          ) : (
             <div className="mt-4">
                <p className="text-lg text-gray-900">No devices registered</p>
                <p className="text-sm text-gray-500">Add a device to get started</p>
             </div>
          )}
        </div>

        {/* Online Devices Card */}
        <div className="rounded-lg bg-white p-6 shadow-sm border">
          <div className="flex items-center justify-between">
             <h3 className="text-sm font-medium text-gray-500">Online Devices</h3>
             <Wifi className="h-4 w-4 text-gray-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.onlineDevices}</p>
          <p className="text-sm text-gray-500">{stats?.onlineDevices} of {stats?.totalDevices} devices online</p>
        </div>

        {/* Total Profiles Card */}
        <div className="rounded-lg bg-white p-6 shadow-sm border">
           <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">Total Profiles</h3>
            <Calendar className="h-4 w-4 text-gray-400" />
           </div>
           <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.totalProfiles}</p>
           <p className="text-sm text-gray-500">Schedule configurations</p>
        </div>

        {/* Storage Used Card */}
        <div className="rounded-lg bg-white p-6 shadow-sm border">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500">Audio Files</h3>
                <HardDrive className="h-4 w-4 text-gray-400" />
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.audioFilesCount}</p>
             <p className="text-sm text-gray-500">Uploaded files</p>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm border">
        <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
        <div className="mt-4 space-y-4">
            <p className="text-sm text-gray-500">No recent activity logs.</p>
        </div>
      </div>
    </div>
  )
}
