import { useAuth } from '@/context/AuthContext'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Bell, Calendar, Home, Mic, LogOut, AlertTriangle, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function DashboardLayout() {
  const { signOut } = useAuth()
  const location = useLocation()

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

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
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
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between bg-white px-6 shadow-sm md:px-8">
            <h1 className="text-lg font-semibold text-gray-800">
                {navigation.find(n => isActive(n.href))?.name || 'Dashboard'}
            </h1>
            <button className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 shadow-sm transition-colors animate-pulse">
                <AlertTriangle className="h-4 w-4" />
                EMERGENCY STOP
            </button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
