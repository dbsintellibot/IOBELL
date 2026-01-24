import { useAuth } from '@/hooks/useAuth'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, School, Package, LogOut, Menu, X, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export default function SuperAdminLayout() {
  const { signOut } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navigation = [
    { name: 'Overview', href: '/super-admin', icon: LayoutDashboard },
    { name: 'School Management', href: '/super-admin/schools', icon: School },
    { name: 'User Management', href: '/super-admin/users', icon: Users },
    { name: 'Inventory', href: '/super-admin/inventory', icon: Package },
  ]

  const isActive = (path: string) => {
      if (path === '/super-admin' && location.pathname === '/super-admin') return true
      if (path !== '/super-admin' && location.pathname.startsWith(path)) return true
      return false
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
               <span className="text-xl font-bold text-gray-800">AutoBell Super</span>
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
                        ? 'bg-purple-50 text-purple-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-4 h-6 w-6 flex-shrink-0',
                        isActive(item.href) ? 'text-purple-600' : 'text-gray-400 group-hover:text-gray-500'
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
        <header className="flex h-16 items-center justify-between bg-white px-4 shadow-sm md:px-8">
            <div className="flex items-center">
                <button
                    className="mr-4 text-gray-500 focus:outline-none md:hidden"
                    onClick={() => setMobileMenuOpen(true)}
                >
                    <Menu className="h-6 w-6" />
                </button>
                <h1 className="text-lg font-semibold text-gray-800">
                    {navigation.find(n => isActive(n.href))?.name || 'Super Admin'}
                </h1>
            </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
