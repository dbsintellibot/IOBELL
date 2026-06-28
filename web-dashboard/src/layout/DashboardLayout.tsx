import { useAuth } from '@/hooks/useAuth'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Calendar, Home, Mic, LogOut, AlertTriangle, Wifi, Menu, X, Settings, Megaphone, DatabaseBackup } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { AutoBellLogoMark } from '@/components/AutoBellLogo'

export default function DashboardLayout() {
  const { signOut, schoolId, user, role } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [emergencyPending, setEmergencyPending] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false)

  const { data: school } = useQuery({
    queryKey: ['school_name', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('name, logo_url, address').eq('id', schoolId).single()
      return data
    }
  })

  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: Home },
    { name: 'Bell Management', href: '/dashboard/bells', icon: Wifi },
    { name: 'Profiles & Schedules', href: '/dashboard/profiles', icon: Calendar },
    { name: 'Audio Manager', href: '/dashboard/audio', icon: Mic },
    { name: 'Broadcast', href: '/dashboard/broadcast', icon: Megaphone },
    { name: 'School Settings', href: '/dashboard/settings', icon: Settings },
    { name: 'Backups & Restore', href: '/dashboard/backups', icon: DatabaseBackup },
  ]

  const isActive = (path: string) => {
      if (path === '/dashboard' && location.pathname === '/dashboard') return true
      if (path !== '/dashboard' && location.pathname.startsWith(path)) return true
      return false
  }

  const handleEmergencyStopClick = () => {
    if (!schoolId) {
      setNotification({ type: 'error', message: 'No school found for this user.' })
      setTimeout(() => setNotification(null), 3000)
      return
    }
    setIsEmergencyModalOpen(true)
  }

  const confirmEmergencyStop = async () => {
    setIsEmergencyModalOpen(false)
    setEmergencyPending(true)
    try {
      const { data: devices, error: deviceError } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId)

      if (deviceError) throw deviceError

      if (!devices || devices.length === 0) {
        setNotification({ type: 'error', message: 'No devices registered for this school.' })
        setTimeout(() => setNotification(null), 3000)
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

      setNotification({ type: 'success', message: 'Emergency stop sent to all devices.' })
      setTimeout(() => setNotification(null), 3000)
    } catch (error) {
      console.error('Emergency stop failed:', error)
      setNotification({ type: 'error', message: 'Failed to send emergency stop. Please try again.' })
      setTimeout(() => setNotification(null), 3000)
    } finally {
      setEmergencyPending(false)
    }
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-background via-muted to-background text-foreground">
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-card pt-5 pb-4 border-r border-border">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-6 w-6 text-foreground" />
              </button>
            </div>
            <div className="flex flex-col px-4">
              <div className="flex items-center">
                {school?.logo_url ? (
                  <img src={school.logo_url} alt="School Logo" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <AutoBellLogoMark className="h-10 w-10" />
                )}
                <span className="ml-2 text-xl font-bold truncate">
                  {school?.name || 'AutoBell'}
                </span>
              </div>
              {school?.address && (
                <span className="mt-1 text-xs text-muted-foreground truncate">{school.address}</span>
              )}
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
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-4 h-6 w-6 flex-shrink-0',
                        isActive(item.href) ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="border-t p-4">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              {role === 'admin' ? 'Admin' : role === 'operator' ? 'Operator' : 'User'}
            </span>
          </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  signOut()
                }}
                className="group flex w-full items-center rounded-md px-2 py-2 text-base font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <LogOut className="mr-4 h-6 w-6 text-muted-foreground group-hover:text-foreground" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden w-64 shrink-0 flex-col bg-card/70 shadow-xl border-r border-border backdrop-blur md:flex">
        <div className="flex flex-col h-auto min-h-[4rem] justify-center border-b border-border px-4 py-4">
          <div className="flex items-center justify-center">
            {school?.logo_url ? (
              <img src={school.logo_url} alt="School Logo" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <AutoBellLogoMark className="h-8 w-8" />
            )}
            <span className="ml-2 text-lg font-bold truncate max-w-[160px]" title={school?.name || 'AutoBell'}>
              {school?.name || 'AutoBell'}
            </span>
          </div>
          {school?.address && (
             <div className="mt-1 text-center">
               <span className="text-xs text-muted-foreground truncate block max-w-full" title={school.address}>
                 {school.address}
               </span>
             </div>
          )}
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive(item.href) ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                )}
              />
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="border-t p-4">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              {role === 'admin' ? 'Admin' : role === 'operator' ? 'Operator' : 'User'}
            </span>
          </div>
          <button
            onClick={() => signOut()}
            className="group flex w-full items-center rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
          <LogOut className="mr-3 h-5 w-5 text-muted-foreground group-hover:text-foreground" />
            Sign Out
          </button>
          <div className="mt-4 px-2 text-xs text-muted-foreground">
            v1.1 (Buzzer Test)
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between bg-card/70 px-4 shadow-lg md:px-8 backdrop-blur border-b border-border">
          <div className="flex items-center">
            <button
              className="mr-4 text-muted-foreground focus:outline-none md:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-semibold text-foreground">
              {school?.name ? `${school.name} - ` : ''}
              {navigation.find(n => isActive(n.href))?.name || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end text-xs md:text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Signed in as {role === 'admin' ? 'Admin' : role === 'operator' ? 'Operator' : 'User'}
              </span>
              <span className="font-mono text-muted-foreground truncate max-w-[180px]">
                {user?.email}
              </span>
            </div>
            <button
              onClick={handleEmergencyStopClick}
              className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 shadow-sm transition-colors animate-pulse disabled:opacity-60"
              disabled={emergencyPending}
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">{emergencyPending ? 'SENDING...' : 'EMERGENCY STOP'}</span>
              <span className="sm:hidden">{emergencyPending ? 'SENDING' : 'STOP'}</span>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {notification && (
            <div
              className={`mb-4 p-4 rounded-md border ${
                notification.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                  : 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40'
              }`}
            >
              {notification.message}
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {isEmergencyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl border border-border">
                <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
                    <AlertTriangle className="h-8 w-8" />
                    <h3 className="text-xl font-bold text-foreground">Emergency Stop</h3>
                </div>
                <div className="mb-6 text-muted-foreground">
                    <p className="font-medium">Are you sure you want to stop all bells?</p>
                    <p className="mt-2 text-sm text-muted-foreground">This command will be sent immediately to all connected devices in your school.</p>
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => setIsEmergencyModalOpen(false)}
                        className="rounded-md px-4 py-2 text-foreground hover:bg-accent"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={confirmEmergencyStop}
                        className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 font-bold shadow-md"
                    >
                        STOP EVERYTHING
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}
