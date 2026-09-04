import { useAuth } from '@/hooks/useAuth'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Handshake, CreditCard, DollarSign, Settings, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'


export default function PartnerLayout() {
  const { signOut, user } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navigation = [
    { name: 'Partner Overview', href: '/partner', icon: LayoutDashboard },
    { name: 'Lead Management', href: '/partner/leads', icon: Users },
    { name: 'Deals & Locking', href: '/partner/deals', icon: Handshake },
    { name: 'Payment Registry', href: '/partner/payments', icon: CreditCard },
    { name: 'Commissions', href: '/partner/commissions', icon: DollarSign },
    { name: 'Payout Settings', href: '/partner/settings', icon: Settings }
  ]

  const isActive = (path: string) => {
    if (path === '/partner' && location.pathname === '/partner') return true
    if (path !== '/partner' && location.pathname.startsWith(path)) return true
    return false
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-card pt-5 pb-4 border-r border-border">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none ring-2 ring-violet-500"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-6 w-6 text-foreground" />
              </button>
            </div>
            <div className="flex flex-shrink-0 items-center justify-center px-4 py-1">
              <img src="/logo.png" alt="AutoBell Logo" className="h-11 w-auto max-h-11 object-contain rounded-xl drop-shadow-sm" />
            </div>
            <div className="mt-5 h-0 flex-1 overflow-y-auto">
              <nav className="space-y-1 px-2">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'group flex items-center rounded-lg px-3 py-2.5 text-base font-medium transition-all duration-200',
                      isActive(item.href)
                        ? 'bg-gradient-to-r from-violet-600/30 to-indigo-600/30 border-l-2 border-violet-500 text-violet-350'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-4 h-6 w-6 flex-shrink-0 transition-colors',
                        isActive(item.href) ? 'text-violet-400' : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="border-t border-border p-4">
              <div className="mb-3">
                <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-400 ring-1 ring-inset ring-violet-500/20">
                  Global Partner
                </span>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  signOut()
                }}
                className="group flex w-full items-center rounded-lg px-3 py-2 text-base font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <LogOut className="mr-4 h-6 w-6 text-muted-foreground group-hover:text-foreground" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden w-64 flex-col bg-card/70 border-r border-border backdrop-blur-xl md:flex">
        <div className="flex h-16 items-center justify-center border-b border-border px-4">
          <img src="/logo.png" alt="AutoBell Logo" className="h-11 w-auto max-h-11 object-contain rounded-xl drop-shadow-sm" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive(item.href)
                  ? 'bg-gradient-to-r from-violet-600/20 to-indigo-600/20 border-l-2 border-violet-500 text-violet-300'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                  isActive(item.href) ? 'text-violet-400' : 'text-muted-foreground group-hover:text-foreground'
                )}
              />
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-4 bg-card/30">
          <div className="mb-3">
            <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-400 ring-1 ring-inset ring-violet-500/20">
              Global Partner
            </span>
          </div>
          <button
            onClick={() => signOut()}
            className="group flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="mr-3 h-5 w-5 text-muted-foreground group-hover:text-foreground" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between bg-card/70 px-4 md:px-8 border-b border-border backdrop-blur-md">
          <div className="flex items-center">
            <button
              className="mr-4 text-muted-foreground hover:text-foreground focus:outline-none md:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {navigation.find(n => isActive(n.href))?.name || 'Partner Portal'}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-xs md:text-sm text-muted-foreground">
            <div className="text-right">
              <div className="font-semibold text-foreground">Partner User</div>
              <div className="font-mono text-muted-foreground">{user?.email}</div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-background/50">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
