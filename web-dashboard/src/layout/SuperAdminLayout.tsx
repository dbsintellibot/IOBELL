import { useAuth } from '@/hooks/useAuth'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, School, Package, LogOut, Menu, X, Users, DatabaseBackup } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { AutoBellLogoMark } from '@/components/AutoBellLogo'

export default function SuperAdminLayout() {
  const { signOut, user } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navigation = [
    { name: 'Overview', href: '/super-admin', icon: LayoutDashboard },
    { name: 'School Management', href: '/super-admin/schools', icon: School },
    { name: 'User Management', href: '/super-admin/users', icon: Users },
    { name: 'Inventory', href: '/super-admin/inventory', icon: Package },
    { name: 'Backups & Restore', href: '/super-admin/backups', icon: DatabaseBackup }
  ]

  const isActive = (path: string) => {
      if (path === '/super-admin' && location.pathname === '/super-admin') return true
      if (path !== '/super-admin' && location.pathname.startsWith(path)) return true
      return false
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
            <div className="flex flex-shrink-0 items-center px-4">
              <AutoBellLogoMark className="h-9 w-9" />
              <span className="ml-2 text-xl font-bold">AutoBell Super</span>
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
                        ? 'bg-primary/20 text-primary'
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
                <span className="inline-flex items-center rounded-full bg-primary/20 px-2.5 py-1 text-xs font-medium text-primary">
                  Super Admin
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

      <div className="hidden w-64 flex-col bg-card/70 shadow-xl border-r border-border backdrop-blur md:flex">
        <div className="flex h-16 items-center justify-center border-b border-border px-4">
          <AutoBellLogoMark className="h-9 w-9" />
          <span className="ml-2 text-xl font-bold">AutoBell Super</span>
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
            <span className="inline-flex items-center rounded-full bg-primary/20 px-2.5 py-1 text-xs font-medium text-primary">
              Super Admin
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

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between bg-card/70 px-4 shadow-lg md:px-8 backdrop-blur border-b border-border">
          <div className="flex items-center">
            <button
              className="mr-4 text-muted-foreground focus:outline-none md:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-semibold text-foreground">
              {navigation.find(n => isActive(n.href))?.name || 'Super Admin'}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-xs md:text-sm text-muted-foreground">
            <div className="text-right">
              <div className="font-medium text-foreground">Super Admin</div>
              <div className="font-mono text-muted-foreground">{user?.email}</div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
