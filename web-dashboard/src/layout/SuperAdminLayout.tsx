import { useAuth } from '@/context/AuthContext'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, School, Package, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SuperAdminLayout() {
  const { signOut } = useAuth()
  const location = useLocation()

  const navigation = [
    { name: 'Overview', href: '/super-admin', icon: LayoutDashboard },
    { name: 'School Management', href: '/super-admin/schools', icon: School },
    { name: 'Inventory', href: '/super-admin/inventory', icon: Package },
  ]

  const isActive = (path: string) => {
      if (path === '/super-admin' && location.pathname === '/super-admin') return true
      if (path !== '/super-admin' && location.pathname.startsWith(path)) return true
      return false
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="hidden w-64 flex-col bg-white shadow-lg md:flex">
        <div className="flex h-16 items-center justify-center border-b px-4">
          <span className="text-xl font-bold text-gray-800">AutoBell Super</span>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'group flex items-center rounded-md px-2 py-2 text-sm font-medium',
                isActive(item.href)
                  ? 'bg-purple-50 text-purple-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive(item.href) ? 'text-purple-600' : 'text-gray-400 group-hover:text-gray-500'
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
                {navigation.find(n => isActive(n.href))?.name || 'Super Admin'}
            </h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
