import { useAuth } from '@/hooks/useAuth'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Bell, Calendar, Home, Mic, LogOut, AlertTriangle, Wifi, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'

export default function DashboardLayout() {
  const { signOut, schoolId } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [emergencyPending, setEmergencyPending] = useState(false)

  const { data: schoolName } = useQuery({
    queryKey: ['school_name', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('name').eq('id', schoolId).single()
      return data?.name
    }
  })

  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: Home },
    { name: 'Bell Management', href: '/dashboard/bells', icon: Wifi },
    { name: 'Profiles & Schedules', href: '/dashboard/profiles', icon: Calendar },
    { name: 'Audio Manager', href: '/dashboard/audio', icon: Mic },
  ]

  const isActive = (path: string) => {
      if (path === '/dashboard' && location.pathname === '/dashboard') return true
      if (path !== '/dashboard' && location.pathname.startsWith(path)) return true
      return false
  }

  const handleEmergencyStop = async () => {
    if (!schoolId) {
      alert('No school found for this user.')
      return
    }
    if (!window.confirm('ARE YOU SURE? This will stop all bells immediately.')) {
      return
    }
    setEmergencyPending(true)
    try {
      const { data: devices, error: deviceError } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId)

      if (deviceError) throw deviceError

      if (!devices || devices.length === 0) {
        alert('No devices registered for this school.')
        return
      }

      const payload = devices.map((device) => ({
        device_id: device.id,
        command: 'EMERGENCY_STOP',
        payload: { source: 'dashboard' }
      }))

      const { error: insertError } = await supabase
        .from('command_queue')
        .insert(payload)

      if (insertError) throw insertError

      alert('Emergency stop sent to all devices.')
    } catch (error) {
      console.error('Emergency stop failed:', error)
      alert('Failed to send emergency stop. Please try again.')
    } finally {
      setEmergencyPending(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white pt-5 pb-4">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-6 w-6 text-white" />
              </button>
            </div>
            <div className="flex flex-shrink-0 items-center px-4">
               <Bell className="h-8 w-8 text-blue-600" />
               <span className="ml-2 text-xl font-bold text-gray-800">AutoBell</span>
            </div>
            <div className="mt-5 h-0 flex-1 overflow-y-auto">
              <nav className="space-y-1 px-2">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'group flex items-center rounded-md px-2 py-2 text-base font-medium',
                      isActive(item.href)
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-4 h-6 w-6 flex-shrink-0',
                        isActive(item.href) ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                      )}
                    />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>
             <div className="border-t p-4">
                <button
                    onClick={() => {
                        setMobileMenuOpen(false)
                        signOut()
                    }}
                    className="group flex w-full items-center rounded-md px-2 py-2 text-base font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                    <LogOut className="mr-4 h-6 w-6 text-gray-400 group-hover:text-gray-500" />
                    Sign Out
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden w-64 flex-col bg-white shadow-lg md:flex">
        <div className="flex h-16 items-center justify-center border-b px-4">
          <Bell className="h-6 w-6 text-blue-600" />
          <span className="ml-2 text-xl font-bold text-gray-800">AutoBell</span>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'group flex items-center rounded-md px-2 py-2 text-sm font-medium',
                isActive(item.href)
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive(item.href) ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                )}
              />
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="border-t p-4">
          <button
            onClick={() => signOut()}
            className="group flex w-full items-center rounded-md px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          >
            <LogOut className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
            Sign Out
          </button>
          <div className="mt-4 px-2 text-xs text-gray-400">
            v1.1 (Buzzer Test)
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between bg-white px-4 shadow-sm md:px-8">
            <div className="flex items-center">
                <button
                    className="mr-4 text-gray-500 focus:outline-none md:hidden"
                    onClick={() => setMobileMenuOpen(true)}
                >
                    <Menu className="h-6 w-6" />
                </button>
                <h1 className="text-lg font-semibold text-gray-800">
                    {schoolName ? `${schoolName} - ` : ''}{navigation.find(n => isActive(n.href))?.name || 'Dashboard'}
                </h1>
            </div>
            <button 
                onClick={handleEmergencyStop}
                className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 shadow-sm transition-colors animate-pulse disabled:opacity-60"
                disabled={emergencyPending}
            >
                <AlertTriangle className="h-4 w-4" />
                <span className="hidden sm:inline">{emergencyPending ? 'SENDING...' : 'EMERGENCY STOP'}</span>
                <span className="sm:hidden">{emergencyPending ? 'SENDING' : 'STOP'}</span>
            </button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
