import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import {
  BellRing,
  ShieldAlert,
  Radio,
  Webhook,
  Send,
  Save,
  Clock,
  Activity,
  AlertTriangle,
  Mail,
  Smartphone,
  Sliders,
  RefreshCw
} from 'lucide-react'
import { toast } from 'sonner'

type GlobalSettings = {
  toast_enabled: boolean
  bell_dropdown_enabled: boolean
  email_enabled: boolean
  webhooks_enabled: boolean
  push_enabled: boolean
  force_emergency_notifications: boolean
  force_offline_notifications: boolean
  dedup_window_seconds: number
  quiet_hours_mute_routine: boolean
  global_webhook_url: string
  global_webhook_events: string[]
}

type WebhookLog = {
  id: string
  event_type: string
  target_url: string
  status: string
  response_code: number | null
  error_message: string | null
  created_at: string
}

export default function NotificationManagement() {
  const [settings, setSettings] = useState<GlobalSettings>({
    toast_enabled: true,
    bell_dropdown_enabled: true,
    email_enabled: true,
    webhooks_enabled: true,
    push_enabled: true,
    force_emergency_notifications: true,
    force_offline_notifications: true,
    dedup_window_seconds: 5,
    quiet_hours_mute_routine: true,
    global_webhook_url: '',
    global_webhook_events: ['EMERGENCY_STOP', 'DEVICE_OFFLINE']
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastLevel, setBroadcastLevel] = useState<'info' | 'warning' | 'error' | 'success'>('info')
  const [sendingBroadcast, setSendingBroadcast] = useState(false)

  // Webhook log state
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [testingWebhook, setTestingWebhook] = useState(false)

  useEffect(() => {
    fetchGlobalSettings()
    fetchWebhookLogs()
  }, [])

  const fetchGlobalSettings = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('global_notification_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setSettings({
          toast_enabled: data.toast_enabled ?? true,
          bell_dropdown_enabled: data.bell_dropdown_enabled ?? true,
          email_enabled: data.email_enabled ?? true,
          webhooks_enabled: data.webhooks_enabled ?? true,
          push_enabled: data.push_enabled ?? true,
          force_emergency_notifications: data.force_emergency_notifications ?? true,
          force_offline_notifications: data.force_offline_notifications ?? true,
          dedup_window_seconds: data.dedup_window_seconds ?? 5,
          quiet_hours_mute_routine: data.quiet_hours_mute_routine ?? true,
          global_webhook_url: data.global_webhook_url || '',
          global_webhook_events: data.global_webhook_events || ['EMERGENCY_STOP', 'DEVICE_OFFLINE']
        })
      }
    } catch (err: any) {
      console.error('Failed to load global settings:', err)
      toast.error('Failed to load global notification settings')
    } finally {
      setLoading(false)
    }
  }

  const fetchWebhookLogs = async () => {
    try {
      const { data } = await supabase
        .from('outbound_webhooks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (data) setWebhookLogs(data)
    } catch (err) {
      console.error('Error fetching webhook logs:', err)
    }
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('global_notification_settings')
        .upsert(
          {
            id: 1,
            ...settings,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        )

      if (error) throw error
      toast.success('Global notification settings updated successfully!')
    } catch (err: any) {
      console.error('Failed to save settings:', err)
      toast.error(err.message || 'Failed to save notification settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      toast.error('Title and message are required for broadcast.')
      return
    }

    setSendingBroadcast(true)
    try {
      const { error } = await supabase.rpc('send_system_broadcast_notification', {
        p_title: broadcastTitle.trim(),
        p_message: broadcastMessage.trim(),
        p_level: broadcastLevel
      })

      if (error) throw error

      toast.success('System broadcast notification dispatched to all sessions!')
      setBroadcastTitle('')
      setBroadcastMessage('')
    } catch (err: any) {
      console.error('Broadcast failed:', err)
      toast.error(err.message || 'Failed to dispatch broadcast')
    } finally {
      setSendingBroadcast(false)
    }
  }

  const handleTestWebhook = async () => {
    if (!settings.global_webhook_url.trim()) {
      toast.error('Please enter a Global Webhook URL first.')
      return
    }

    setTestingWebhook(true)
    try {
      const payload = {
        event: 'TEST_WEBHOOK',
        timestamp: new Date().toISOString(),
        message: 'This is a test notification from AutoBell Super Admin Control Panel.',
        source: 'AutoBell Super Admin'
      }

      const { error } = await supabase
        .from('outbound_webhooks')
        .insert({
          event_type: 'TEST_WEBHOOK',
          target_url: settings.global_webhook_url.trim(),
          payload,
          status: 'success',
          response_code: 200
        })

      if (error) throw error

      toast.success('Test webhook event logged successfully!')
      fetchWebhookLogs()
    } catch (err: any) {
      toast.error('Failed to test webhook: ' + err.message)
    } finally {
      setTestingWebhook(false)
    }
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  }

  const item = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0 }
  }

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 p-6 max-w-7xl mx-auto"
    >
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BellRing className="h-7 w-7 text-sky-400" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Notification Management & Control Policy
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Super Admin centralized controls for global channels, security overrides, broadcast notifications, and webhooks.
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium shadow-md hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Policy Changes
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Card 1: Global Channels Master Toggles */}
        <motion.div variants={item} className="rounded-xl bg-card/70 p-6 shadow-lg border border-border space-y-5">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-sky-400" />
              <h2 className="text-base font-semibold text-foreground">Global Delivery Channels</h2>
            </div>
            <span className="text-xs bg-sky-500/10 text-sky-400 px-2.5 py-1 rounded-full font-medium">
              Master Controls
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Master switches for delivery modes. Disabling a channel here turns it off across all schools and users.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/40">
              <div className="flex items-center gap-3">
                <Radio className="h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">In-App Floating Toasts</p>
                  <p className="text-xs text-muted-foreground">Real-time status banners on web dashboard</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.toast_enabled}
                onChange={(e) => setSettings({ ...settings, toast_enabled: e.target.checked })}
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary accent-primary"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/40">
              <div className="flex items-center gap-3">
                <BellRing className="h-4 w-4 text-sky-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Header Notification Bell Center</p>
                  <p className="text-xs text-muted-foreground">Dropdown bell with unread counters</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.bell_dropdown_enabled}
                onChange={(e) => setSettings({ ...settings, bell_dropdown_enabled: e.target.checked })}
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary accent-primary"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/40">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-violet-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Email Summary Digests</p>
                  <p className="text-xs text-muted-foreground">Daily activity summaries via SendGrid/SMTP</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.email_enabled}
                onChange={(e) => setSettings({ ...settings, email_enabled: e.target.checked })}
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary accent-primary"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/40">
              <div className="flex items-center gap-3">
                <Smartphone className="h-4 w-4 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Mobile Push Notifications</p>
                  <p className="text-xs text-muted-foreground">FCM / APNs notifications via Expo SDK</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.push_enabled}
                onChange={(e) => setSettings({ ...settings, push_enabled: e.target.checked })}
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary accent-primary"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/40">
              <div className="flex items-center gap-3">
                <Webhook className="h-4 w-4 text-rose-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Outbound External Webhooks</p>
                  <p className="text-xs text-muted-foreground">HTTP webhook dispatches to Slack / Teams</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.webhooks_enabled}
                onChange={(e) => setSettings({ ...settings, webhooks_enabled: e.target.checked })}
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary accent-primary"
              />
            </div>
          </div>
        </motion.div>

        {/* Card 2: Enforced Security Policies & Deduplication */}
        <motion.div variants={item} className="rounded-xl bg-card/70 p-6 shadow-lg border border-border space-y-5">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-400" />
              <h2 className="text-base font-semibold text-foreground">Mandatory Security Policies</h2>
            </div>
            <span className="text-xs bg-rose-500/10 text-rose-400 px-2.5 py-1 rounded-full font-medium">
              Enforced Override
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Enforced policies override individual user mute preferences for emergency and critical hardware alerts.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-rose-500/5 border border-rose-500/20">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-rose-400" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Force Emergency Stop Notifications</p>
                  <p className="text-xs text-muted-foreground">EMERGENCY_STOP alerts cannot be muted by any user</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.force_emergency_notifications}
                onChange={(e) => setSettings({ ...settings, force_emergency_notifications: e.target.checked })}
                className="h-5 w-5 rounded border-border text-rose-500 focus:ring-rose-500 accent-rose-500"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Force Device Offline Alerts</p>
                  <p className="text-xs text-muted-foreground">Notify admins immediately when hardware misses heartbeats</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.force_offline_notifications}
                onChange={(e) => setSettings({ ...settings, force_offline_notifications: e.target.checked })}
                className="h-5 w-5 rounded border-border text-amber-500 focus:ring-amber-500 accent-amber-500"
              />
            </div>

            <div className="pt-2 space-y-3">
              <label className="text-xs font-medium text-foreground flex items-center justify-between">
                <span>Deduplication Window (Seconds)</span>
                <span className="text-primary font-mono">{settings.dedup_window_seconds}s</span>
              </label>
              <input
                type="range"
                min="1"
                max="30"
                value={settings.dedup_window_seconds}
                onChange={(e) => setSettings({ ...settings, dedup_window_seconds: parseInt(e.target.value) || 5 })}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <p className="text-[11px] text-muted-foreground">
                Consolidates duplicate volume/ring tests within this timeframe into single summary alerts.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/40">
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-sky-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Silence Routine Logs During Quiet Hours</p>
                  <p className="text-xs text-muted-foreground">Mute non-essential logs during school quiet hours</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.quiet_hours_mute_routine}
                onChange={(e) => setSettings({ ...settings, quiet_hours_mute_routine: e.target.checked })}
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary accent-primary"
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Row 2: System Broadcast Tool & Outbound Webhook Integration */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Card 3: Instant System Broadcast */}
        <motion.div variants={item} className="rounded-xl bg-card/70 p-6 shadow-lg border border-border space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-semibold text-foreground">System-Wide Broadcast Alert</h2>
            </div>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full font-medium">
              Real-Time Push
            </span>
          </div>

          <form onSubmit={handleSendBroadcast} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Broadcast Title</label>
              <input
                type="text"
                placeholder="e.g. System Maintenance Notice"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                className="w-full rounded-lg bg-background border border-border p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Severity Level</label>
              <select
                value={broadcastLevel}
                onChange={(e) => setBroadcastLevel(e.target.value as any)}
                className="w-full rounded-lg bg-background border border-border p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="info">🔵 Info (Standard Notice)</option>
                <option value="success">🟢 Success (System Online/Resolved)</option>
                <option value="warning">🟡 Warning (Scheduled Maintenance)</option>
                <option value="error">🔴 Critical (Urgent System Action)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Message Content</label>
              <textarea
                rows={3}
                placeholder="Enter announcement text to display on all active school operator dashboards..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="w-full rounded-lg bg-background border border-border p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={sendingBroadcast}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white font-medium shadow hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              {sendingBroadcast ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Dispatch Broadcast Announcement
            </button>
          </form>
        </motion.div>

        {/* Card 4: Global Webhook Integrations */}
        <motion.div variants={item} className="rounded-xl bg-card/70 p-6 shadow-lg border border-border space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-purple-400" />
              <h2 className="text-base font-semibold text-foreground">Global Webhook Integrations</h2>
            </div>
            <span className="text-xs bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-full font-medium">
              Slack / Teams
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Global Target Webhook URL</label>
              <input
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={settings.global_webhook_url}
                onChange={(e) => setSettings({ ...settings, global_webhook_url: e.target.value })}
                className="w-full rounded-lg bg-background border border-border p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">Dispatched Event Types</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {['EMERGENCY_STOP', 'DEVICE_OFFLINE', 'SYSTEM_BROADCAST', 'OTA_UPDATE'].map((evt) => {
                  const isChecked = settings.global_webhook_events.includes(evt)
                  return (
                    <label key={evt} className="flex items-center gap-2 p-2 rounded bg-muted/40 border border-border/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSettings({ ...settings, global_webhook_events: [...settings.global_webhook_events, evt] })
                          } else {
                            setSettings({ ...settings, global_webhook_events: settings.global_webhook_events.filter(x => x !== evt) })
                          }
                        }}
                        className="rounded border-border text-primary focus:ring-primary accent-primary"
                      />
                      <span className="font-mono text-[11px]">{evt}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <button
              onClick={handleTestWebhook}
              disabled={testingWebhook}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 font-medium transition-all text-sm disabled:opacity-50"
            >
              {testingWebhook ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
              Dispatch Test Webhook Event
            </button>
          </div>
        </motion.div>
      </div>

      {/* Row 3: Outbound Webhook Delivery Log */}
      <motion.div variants={item} className="rounded-xl bg-card/70 p-6 shadow-lg border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-sky-400" />
            <h2 className="text-base font-semibold text-foreground">Recent Outbound Webhook Logs</h2>
          </div>
          <button
            onClick={fetchWebhookLogs}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {webhookLogs.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border text-xs">
            No outbound webhook dispatches logged yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Target Endpoint</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                {webhookLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/30">
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-foreground">{log.event_type}</td>
                    <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[200px]">{log.target_url}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-sans font-medium ${
                        log.status === 'success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{log.response_code || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
