import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { School, User, Wifi, HardDrive } from 'lucide-react'

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
        // Parallel requests
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard Overview</h2>
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.name} className="overflow-hidden rounded-lg bg-white shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-md ${stat.bg}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} aria-hidden="true" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="truncate text-sm font-medium text-gray-500">{stat.name}</dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">{stat.value}</div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
