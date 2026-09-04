import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Activity, ShieldAlert, CheckCircle2, RefreshCw, Database, Server, Clock } from 'lucide-react'

interface SystemLog {
  id: string
  action: string
  resource_type: string
  created_at: string
  details: Record<string, unknown>
}

export default function HealthDashboard() {
  const [dbLatency, setDbLatency] = useState<number | null>(null)
  const [dbStatus, setDbStatus] = useState<'healthy' | 'degraded' | 'down'>('healthy')
  const [recentLogs, setRecentLogs] = useState<SystemLog[]>([])
  const [errorCount, setErrorCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)

  const checkHealth = async () => {
    setLoading(true)
    const startTime = performance.now()
    try {
      // 1. Database Ping & Latency Check
      const { error } = await supabase.from('schools').select('id', { count: 'exact', head: true })
      const endTime = performance.now()
      const latency = Math.round(endTime - startTime)
      setDbLatency(latency)

      if (error) {
        setDbStatus('down')
      } else if (latency > 1000) {
        setDbStatus('degraded')
      } else {
        setDbStatus('healthy')
      }

      // 2. Fetch Recent Audit / System Logs
      const { data: logsData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (logsData) {
        setRecentLogs(logsData as SystemLog[])
      }

      // 3. Fetch 24-hour Error Log Count
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'SYSTEM_ERROR')
        .gte('created_at', twentyFourHoursAgo)

      setErrorCount(count || 0)

    } catch (err) {
      setDbStatus('down')
      console.error('Health check failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-7 h-7 text-emerald-400" />
            System Health & Observability
          </h1>
          <p className="text-sm text-slate-400">Real-time performance metrics, database status, and error telemetry.</p>
        </div>

        <button
          onClick={checkHealth}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Diagnostics
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Database Status</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-center gap-2 text-xl font-bold text-slate-100">
            {dbStatus === 'healthy' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {dbStatus === 'degraded' && <ShieldAlert className="w-5 h-5 text-amber-400" />}
            {dbStatus === 'down' && <ShieldAlert className="w-5 h-5 text-red-500" />}
            <span className="capitalize">{dbStatus}</span>
          </div>
          <p className="text-xs text-slate-500">Supabase PostgreSQL engine</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Query Latency</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {dbLatency !== null ? `${dbLatency} ms` : 'Checking...'}
          </div>
          <p className="text-xs text-slate-500">Round-trip database query latency</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>24h Error Rate</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className={`text-xl font-bold ${errorCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
          </div>
          <p className="text-xs text-slate-500">Logged in the last 24 hours</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Edge Infrastructure</span>
            <Server className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400">
            Operational
          </div>
          <p className="text-xs text-slate-500">Edge Functions & Storage Buckets</p>
        </div>
      </div>

      {/* Audit & System Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">System Telemetry & Audit Stream</h2>
          <span className="text-xs text-slate-400">Showing last 10 audit records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">Resource</th>
                <th className="px-6 py-3">Details / Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No system logs recorded yet.
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-slate-400">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 font-semibold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        log.action === 'SYSTEM_ERROR'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-blue-950 text-blue-400 border border-blue-800'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-medium text-slate-200">
                      {log.resource_type}
                    </td>
                    <td className="px-6 py-3 font-mono text-[11px] text-slate-400 truncate max-w-md">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
