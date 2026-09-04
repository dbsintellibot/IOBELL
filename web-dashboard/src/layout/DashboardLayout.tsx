import { useAuth } from '@/hooks/useAuth'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Calendar, Home, Mic, LogOut, AlertTriangle, Wifi, Menu, X, Settings, Megaphone, DatabaseBackup, Bell, CheckCircle, Clock, Trash2, Radio, FileText, Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { formatNotificationTime } from '@/lib/timeFormat'

interface NotificationItem {
  id: string
  title: string
  message: string
  level: 'in queue' | 'success' | 'error' | 'info'
  created_at: string
  read: boolean
}

export default function DashboardLayout() {
  const { signOut, schoolId, user, role, isImpersonating } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [emergencyPending, setEmergencyPending] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false)

  // Notification Center & Toast states
  const [notificationsList, setNotificationsList] = useState<NotificationItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('autobell_notifications')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [toastAlert, setToastAlert] = useState<NotificationItem | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem('autobell_notifications', JSON.stringify(notificationsList))
    } catch (e) {
      console.error('Error saving notifications', e)
    }
  }, [notificationsList])

  useEffect(() => {
    if (!schoolId) return

    const loadInitialLogs = async () => {
      if (notificationsList.length > 0) return
      const { data: devices } = await supabase.from('bell_devices').select('id, name').eq('school_id', schoolId)
      if (!devices || devices.length === 0) return
      const deviceIds = devices.map(d => d.id)

      const { data: recentLogs } = await supabase
        .from('device_logs')
        .select('id, message, level, created_at, device_id')
        .in('device_id', deviceIds)
        .order('created_at', { ascending: false })
        .limit(10)

      if (recentLogs && recentLogs.length > 0) {
        const items: NotificationItem[] = recentLogs.map(log => {
          let title = 'System Log'
          if (log.level === 'in queue' || log.message?.includes('[In Queue]')) title = 'Command in Queue'
          else if (log.level === 'success' || log.message?.includes('[Ran Successfully]')) title = 'Ran Successfully'
          else if (log.level === 'error') title = 'Execution Error'

          return {
            id: log.id,
            title,
            message: log.message || '',
            level: (log.level as any) || 'info',
            created_at: log.created_at,
            read: true
          }
        })
        setNotificationsList(items)
      }
    }
    loadInitialLogs()

    const channel = supabase
      .channel(`school-notifications-${schoolId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'device_logs'
        },
        async (payload) => {
          const newLog = payload.new as any

          // 1. System Broadcast (device_id is null)
          const isSystemBroadcast = !newLog.device_id || newLog.message?.includes('[System Broadcast]')

          if (!isSystemBroadcast && newLog.device_id) {
            const { data: dev } = await supabase.from('bell_devices').select('name').eq('id', newLog.device_id).eq('school_id', schoolId).maybeSingle()
            if (!dev) return
          }

          // 2. Fetch Effective Settings
          let effective: any = { toast_enabled: true, bell_dropdown_enabled: true, notify_tts: true, notify_voice_note: true, notify_stream: true, notify_ring: true, notify_volume: true }
          try {
            const { data: effData } = await supabase.rpc('get_effective_notification_settings', { p_user_id: user?.id })
            if (effData) effective = effData
          } catch {
            // fallback default
          }

          const msgLower = (newLog.message || '').toLowerCase()
          const isEmergency = msgLower.includes('emergency_stop') || msgLower.includes('emergency')
          const isOffline = msgLower.includes('offline')
          const isTts = msgLower.includes('tts')
          const isVoice = msgLower.includes('voice note')
          const isStream = msgLower.includes('stream')
          const isRing = msgLower.includes('ring') || msgLower.includes('bell')
          const isVolume = msgLower.includes('volume')

          // Check if muted by user routine preferences (unless emergency/offline)
          if (!isEmergency && !isOffline && !isSystemBroadcast) {
            if (isTts && !effective.notify_tts) return
            if (isVoice && !effective.notify_voice_note) return
            if (isStream && !effective.notify_stream) return
            if (isRing && !effective.notify_ring) return
            if (isVolume && !effective.notify_volume) return
          }

          let title = 'New System Event'
          if (isSystemBroadcast) {
            title = '📢 System Broadcast'
          } else if (newLog.level === 'in queue' || newLog.message?.includes('[In Queue]')) {
            title = 'Command Added to Queue'
          } else if (newLog.level === 'success' || newLog.message?.includes('[Ran Successfully]')) {
            title = 'Command Ran Successfully'
          } else if (newLog.level === 'error') {
            title = 'Command Error'
          }

          const item: NotificationItem = {
            id: newLog.id || Math.random().toString(),
            title,
            message: newLog.message || '',
            level: newLog.level || 'info',
            created_at: newLog.created_at || new Date().toISOString(),
            read: false
          }

          if (effective.bell_dropdown_enabled) {
            setNotificationsList(prev => [item, ...prev.slice(0, 49)])
          }

          if (effective.toast_enabled) {
            setToastAlert(item)
            setTimeout(() => {
              setToastAlert(curr => curr?.id === item.id ? null : curr)
            }, 6000)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [schoolId, user?.id])

  const markAllAsRead = () => {
    setNotificationsList(prev => prev.map(n => ({ ...n, read: true })))
  }

  const clearNotifications = () => {
    setNotificationsList([])
    setIsNotificationOpen(false)
  }

  const unreadCount = notificationsList.filter(n => !n.read).length

  const { data: schoolDevices = [] } = useQuery({
    queryKey: ['school_devices_types', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from('bell_devices').select('board_type').eq('school_id', schoolId)
      return data || []
    }
  })

  const showAudioFeatures = schoolDevices.length === 0 || schoolDevices.some(d => !d.board_type || d.board_type !== 'ESP32-C3 Mini')

  const { data: school } = useQuery({
    queryKey: ['school_name', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('name, logo_url, address').eq('id', schoolId).single()
      return data
    }
  })

  const rawNavigationSections = [
    {
      title: 'Operations',
      items: [
        { name: 'Overview', href: '/dashboard', icon: Home },
        { name: 'Bell Management', href: '/dashboard/bells', icon: Wifi },
        { name: 'Broadcast', href: '/dashboard/broadcast', icon: Megaphone, hide: !showAudioFeatures },
      ]
    },
    {
      title: 'Schedules & Audio',
      items: [
        { name: 'Period Bells & Schedule', href: '/dashboard/bells-and-announcements', icon: Calendar },
        { name: 'Audio Manager', href: '/dashboard/audio', icon: Mic, hide: !showAudioFeatures },
      ]
    },
    {
      title: 'System & Reports',
      items: [
        { name: 'Reports & Export', href: '/dashboard/reports', icon: FileText },
        { name: 'School Settings', href: '/dashboard/settings', icon: Settings },
        { name: 'Backups & Restore', href: '/dashboard/backups', icon: DatabaseBackup },
      ]
    },
    {
      title: 'Support',
      items: [
        { name: 'Support Tickets', href: '/dashboard/tickets', icon: Ticket },
      ]
    }
  ]

  const navigationSections = rawNavigationSections.map(section => ({
    ...section,
    items: section.items.filter(item => !item.hide)
  })).filter(section => section.items.length > 0)

  const navigation = navigationSections.flatMap(s => s.items)

  const isActive = (path: string) => {
      if (path === '/dashboard') return location.pathname === '/dashboard'
      return location.pathname === path || location.pathname.startsWith(path + '/')
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
    <div className={cn(
      "flex h-screen bg-gradient-to-br from-background via-muted to-background text-foreground",
      isImpersonating && "pt-10"
    )}>
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-card pt-5 pb-4 border-r border-border">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close mobile navigation menu"
              >
                <X className="h-6 w-6 text-foreground" />
              </button>
            </div>
            <div className="flex items-center justify-center px-4 py-2">
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
                      'group flex items-center rounded-md px-2 py-2 text-base font-medium',
                      isActive(item.href)
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-4 h-6 w-6 flex-shrink-0',
                        isActive(item.href) ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'
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
        <div className="flex flex-col h-auto min-h-[4rem] justify-center border-b border-border px-4 py-3">
          <div className="flex items-center justify-center py-1">
            <img src="/logo.png" alt="AutoBell Logo" className="h-11 w-auto max-h-11 object-contain rounded-xl drop-shadow-sm" />
          </div>
        </div>
        <nav className="flex-1 space-y-6 px-3 py-4 overflow-y-auto">
          {navigationSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <h3 className="px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                {section.title}
              </h3>
              {section.items.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'group flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150',
                    isActive(item.href)
                      ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:bg-accent/80 hover:text-foreground'
                  )}
                >
                  <item.icon
                    className={cn(
                      'mr-3 h-4 w-4 flex-shrink-0 transition-transform duration-150 group-hover:scale-110',
                      isActive(item.href) ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  />
                  {item.name}
                </Link>
              ))}
            </div>
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
            v1.2 (Enterprise Hardened)
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        <header className="relative z-30 flex h-16 items-center justify-between bg-card/70 px-4 shadow-lg md:px-8 backdrop-blur border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="mr-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary rounded-md p-1 md:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile navigation menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            {school?.logo_url && (
              <img
                src={school.logo_url}
                alt={school.name || 'School Logo'}
                className="h-9 w-9 rounded-full object-cover border border-border/80 shadow-sm shrink-0"
              />
            )}
            <h1 className="text-lg font-semibold text-foreground truncate">
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

            {/* Notification Center */}
            <div className="relative">
              <button
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="relative flex items-center justify-center rounded-full p-2.5 bg-accent/50 hover:bg-accent text-foreground transition-all shadow-sm border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary"
                title="Activity & Notifications"
                aria-label={`Activity and Notifications (${unreadCount} unread)`}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {isNotificationOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsNotificationOpen(false)} />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-card border border-border shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/60 border-b border-border">
                      <div className="flex items-center gap-2">
                        <Megaphone className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Activity & Notifications</h3>
                        {unreadCount > 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            Mark all read
                          </button>
                        )}
                        {notificationsList.length > 0 && (
                          <button
                            onClick={clearNotifications}
                            className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                            title="Clear all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto divide-y divide-border/40">
                      {notificationsList.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                          <Bell className="h-8 w-8 text-muted-foreground/40 stroke-1" />
                          <p>No notifications yet</p>
                          <span className="text-xs text-muted-foreground/70">Events like TTS commands, voice notes, and schedules will appear here.</span>
                        </div>
                      ) : (
                        notificationsList.map(n => (
                          <div
                            key={n.id}
                            className={cn(
                              "p-3.5 transition-colors hover:bg-muted/40 flex items-start gap-3 cursor-pointer",
                              !n.read && "bg-primary/5"
                            )}
                            onClick={() => {
                              setNotificationsList(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item))
                            }}
                          >
                            <div className={cn(
                              "mt-0.5 rounded-full p-2 flex-shrink-0",
                              n.level === 'in queue' || n.message.includes('[In Queue]') ? "bg-amber-500/10 text-amber-500" :
                              n.level === 'success' || n.message.includes('[Ran Successfully]') ? "bg-emerald-500/10 text-emerald-500" :
                              n.level === 'error' ? "bg-red-500/10 text-red-500" : "bg-sky-500/10 text-sky-500"
                            )}>
                              {n.level === 'in queue' || n.message.includes('[In Queue]') ? (
                                <Clock className="h-4 w-4" />
                              ) : n.level === 'success' || n.message.includes('[Ran Successfully]') ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : n.level === 'error' ? (
                                <AlertTriangle className="h-4 w-4" />
                              ) : (
                                <Radio className="h-4 w-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground truncate">
                                  {n.title}
                                </span>
                                <span className="text-[10px] text-muted-foreground flex-shrink-0 font-medium">
                                  {formatNotificationTime(n.created_at)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                {n.message}
                              </p>
                            </div>
                            {!n.read && (
                              <span className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
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
        <main className="flex-1 overflow-y-auto p-4 md:p-6 relative">
          {/* Floating Live Toast Alert */}
          {toastAlert && (
            <div className="fixed bottom-6 right-6 z-50 max-w-sm sm:max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300">
              <div className={cn(
                "rounded-xl p-4 shadow-2xl border flex items-start gap-3 backdrop-blur-md",
                toastAlert.level === 'in queue' || toastAlert.message.includes('[In Queue]')
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-950 dark:text-amber-100"
                  : toastAlert.level === 'success' || toastAlert.message.includes('[Ran Successfully]')
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-950 dark:text-emerald-100"
                  : toastAlert.level === 'error'
                  ? "bg-red-500/15 border-red-500/40 text-red-950 dark:text-red-100"
                  : "bg-card/90 border-border text-foreground"
              )}>
                <div className={cn(
                  "rounded-full p-2",
                  toastAlert.level === 'in queue' || toastAlert.message.includes('[In Queue]') ? "bg-amber-500 text-white" :
                  toastAlert.level === 'success' || toastAlert.message.includes('[Ran Successfully]') ? "bg-emerald-500 text-white" :
                  toastAlert.level === 'error' ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"
                )}>
                  {toastAlert.level === 'in queue' || toastAlert.message.includes('[In Queue]') ? (
                    <Clock className="h-5 w-5" />
                  ) : toastAlert.level === 'success' || toastAlert.message.includes('[Ran Successfully]') ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : toastAlert.level === 'error' ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <Bell className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold truncate">{toastAlert.title}</h4>
                    <button
                      onClick={() => setToastAlert(null)}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs mt-1 leading-relaxed opacity-90">{toastAlert.message}</p>
                </div>
              </div>
            </div>
          )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl border border-red-500/30 dark:border-red-500/20">
                <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
                    <div className="rounded-full bg-red-500/10 p-2.5">
                      <AlertTriangle className="h-7 w-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">Emergency Stop All Devices</h3>
                      <p className="text-xs text-muted-foreground">School-Wide Hardware Broadcast Override</p>
                    </div>
                </div>
                <div className="mb-6 space-y-2 text-muted-foreground text-sm leading-relaxed">
                    <p className="font-semibold text-foreground">Are you sure you want to stop all active bells, broadcasts, and audio playback?</p>
                    <p className="text-xs">This command will be pushed immediately to all registered school hardware units.</p>
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setIsEmergencyModalOpen(false)}
                        className="rounded-lg px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent border border-border/60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label="Cancel emergency stop"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={confirmEmergencyStop}
                        disabled={emergencyPending}
                        className="rounded-lg bg-red-600 px-5 py-2.5 text-sm text-white hover:bg-red-700 font-bold shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60 flex items-center gap-2"
                        aria-label="Confirm emergency stop all devices"
                    >
                        {emergencyPending ? (
                          <>
                            <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            STOPPING...
                          </>
                        ) : (
                          'STOP EVERYTHING NOW'
                        )}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}
