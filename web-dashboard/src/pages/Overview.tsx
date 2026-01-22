import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Bell, Wifi, Calendar, HardDrive } from 'lucide-react'

export default function Overview() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['overview-stats'],
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

      return {
        totalDevices: totalDevices || 0,
        onlineDevices: onlineDevices || 0,
        totalProfiles: totalProfiles || 0,
        audioFilesCount: audioFilesCount || 0
      }
    }
  })

  if (isLoading) {
    return <div className="text-gray-500">Loading overview...</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Active Bells Card */}
        <div className="rounded-lg bg-white p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">Active Bells</h3>
            <Bell className="h-4 w-4 text-gray-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats?.totalDevices}</p>
          <div className="mt-2 flex items-center text-sm text-green-600">
            <span className="h-2 w-2 rounded-full bg-green-600 mr-2"></span>
            Operational
          </div>
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
