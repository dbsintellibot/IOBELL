import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { exportToCSV, triggerPrint, type ReportColumn } from '@/lib/reportingEngine'
import { FileText, Download, Printer, Filter, Calendar, RefreshCw } from 'lucide-react'

type ReportType = 'audit' | 'devices' | 'schedules' | 'users'

interface AuditRecord {
  id: string
  created_at: string
  action: string
  resource_type: string
  schools?: { name: string }
  details: Record<string, unknown>
}

interface DeviceRecord {
  id: string
  device_name: string
  mac_address: string
  status: string
  firmware_version?: string
  last_heartbeat?: string
  schools?: { name: string }
}

interface ScheduleRecord {
  id: string
  time: string
  period_name?: string
  day_of_week?: string
  enabled: boolean
  schools?: { name: string }
}

export default function ReportsManager() {
  const [activeReport, setActiveReport] = useState<ReportType>('audit')
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchReportData = useCallback(async () => {
    setLoading(true)
    try {
      if (activeReport === 'audit') {
        let query = supabase.from('audit_logs').select('*, schools(name)').order('created_at', { ascending: false }).limit(100)
        if (dateFrom) query = query.gte('created_at', dateFrom)
        if (dateTo) query = query.lte('created_at', dateTo)
        const { data: res } = await query
        setData((res as unknown as Record<string, unknown>[]) || [])

      } else if (activeReport === 'devices') {
        let query = supabase.from('bell_devices').select('*, bell_profiles(name), schools(name)').order('name', { ascending: true })
        if (statusFilter !== 'all') query = query.eq('status', statusFilter)
        const { data: res } = await query
        const formatted = (res || []).map((row: any) => ({
          ...row,
          device_name: row.name || row.device_name || 'Unnamed Device',
          profile_name: row.bell_profiles?.name || 'School Active (Default)'
        }))
        setData(formatted || [])

      } else if (activeReport === 'schedules') {
        const { data: res } = await supabase.from('bell_times').select('*, schools(name)').order('time', { ascending: true }).limit(100)
        setData((res as unknown as Record<string, unknown>[]) || [])

      } else if (activeReport === 'users') {
        const { data: res } = await supabase.from('users').select('*, schools(name)').order('created_at', { ascending: false })
        setData((res as unknown as Record<string, unknown>[]) || [])
      }
    } catch (err) {
      console.error('Failed to fetch report data:', err)
    } finally {
      setLoading(false)
    }
  }, [activeReport, dateFrom, dateTo, statusFilter])

  useEffect(() => {
    fetchReportData()
  }, [fetchReportData])

  const handleExportCSV = () => {
    if (data.length === 0) return

    let cols: ReportColumn<Record<string, unknown>>[] = []
    if (activeReport === 'audit') {
      cols = [
        { key: 'created_at', header: 'Timestamp' },
        { key: 'action', header: 'Action' },
        { key: 'resource_type', header: 'Resource Type' },
        { key: 'schools.name', header: 'School Name' },
      ]
    } else if (activeReport === 'devices') {
      cols = [
        { key: 'device_name', header: 'Device Name' },
        { key: 'mac_address', header: 'MAC Address' },
        { key: 'profile_name', header: 'Assigned Profile' },
        { key: 'status', header: 'Status' },
        { key: 'firmware_version', header: 'Firmware' },
        { key: 'schools.name', header: 'School' },
      ]
    } else if (activeReport === 'schedules') {
      cols = [
        { key: 'time', header: 'Bell Time' },
        { key: 'period_name', header: 'Period Name' },
        { key: 'enabled', header: 'Enabled' },
        { key: 'schools.name', header: 'School' },
      ]
    } else {
      cols = [
        { key: 'email', header: 'Email' },
        { key: 'full_name', header: 'Full Name' },
        { key: 'role', header: 'Role' },
        { key: 'schools.name', header: 'School' },
      ]
    }

    exportToCSV(`autobell_${activeReport}_report`, cols, data)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Non-printable screen header */}
      <div className="print:hidden flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-400" />
            Enterprise Reporting Engine
          </h1>
          <p className="text-sm text-slate-400">Generate, filter, print, and export system audit, inventory, and operational reports.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            disabled={data.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors border border-slate-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export to CSV
          </button>

          <button
            onClick={triggerPrint}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Printable Header - Visible only in Print Mode */}
      <div className="hidden print:block text-black p-4 border-b border-black mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold uppercase">AutoBell (PRISMA SaaS) Report</h1>
            <p className="text-sm">Report Category: <span className="font-semibold capitalize">{activeReport} Report</span></p>
          </div>
          <div className="text-right text-xs">
            <p>Generated: {new Date().toLocaleString()}</p>
            <p>Page 1 of 1</p>
          </div>
        </div>
      </div>

      {/* Report Selection Tabs (Screen only) */}
      <div className="print:hidden border-b border-slate-800 flex gap-4">
        <button
          onClick={() => setActiveReport('audit')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeReport === 'audit'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Audit & Security Logs
        </button>

        <button
          onClick={() => setActiveReport('devices')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeReport === 'devices'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Device Fleet Summary
        </button>

        <button
          onClick={() => setActiveReport('schedules')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeReport === 'schedules'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Schedules Digest
        </button>

        <button
          onClick={() => setActiveReport('users')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeReport === 'users'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          User & Tenant Roster
        </button>
      </div>

      {/* Filter Controls (Screen only) */}
      <div className="print:hidden bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-4 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span>Date From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span>Date To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 focus:outline-none"
          />
        </div>

        {activeReport === 'devices' && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2 py-1 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        )}

        <button
          onClick={fetchReportData}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Apply Filters
        </button>
      </div>

      {/* Report Results Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden print:border-black print:bg-white print:text-black">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 print:bg-slate-200 print:text-black print:border-black">
              {activeReport === 'audit' && (
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Resource</th>
                  <th className="px-6 py-3">School</th>
                </tr>
              )}
              {activeReport === 'devices' && (
                <tr>
                  <th className="px-6 py-3">Device Name</th>
                  <th className="px-6 py-3">MAC Address</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Firmware</th>
                  <th className="px-6 py-3">School</th>
                </tr>
              )}
              {activeReport === 'schedules' && (
                <tr>
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Period Name</th>
                  <th className="px-6 py-3">Enabled</th>
                  <th className="px-6 py-3">School</th>
                </tr>
              )}
              {activeReport === 'users' && (
                <tr>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Full Name</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">School</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-800 print:divide-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading report data...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No records found for this report.</td>
                </tr>
              ) : (
                data.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 print:hover:bg-transparent">
                    {activeReport === 'audit' && (
                      <>
                        <td className="px-6 py-3 font-mono text-slate-400 print:text-black">
                          {new Date(String(item.created_at)).toLocaleString()}
                        </td>
                        <td className="px-6 py-3 font-semibold text-slate-200 print:text-black">{String(item.action)}</td>
                        <td className="px-6 py-3 text-slate-300 print:text-black">{String(item.resource_type)}</td>
                        <td className="px-6 py-3 text-slate-400 print:text-black">{(item as unknown as AuditRecord).schools?.name || 'Global'}</td>
                      </>
                    )}
                    {activeReport === 'devices' && (
                      <>
                        <td className="px-6 py-3 font-semibold text-slate-200 print:text-black">{String(item.device_name)}</td>
                        <td className="px-6 py-3 font-mono text-slate-400 print:text-black">{String(item.mac_address)}</td>
                        <td className="px-6 py-3 capitalize text-emerald-400 print:text-black">{String(item.status)}</td>
                        <td className="px-6 py-3 font-mono text-slate-400 print:text-black">{String(item.firmware_version || 'v1.0.0')}</td>
                        <td className="px-6 py-3 text-slate-400 print:text-black">{(item as unknown as DeviceRecord).schools?.name || 'Unassigned'}</td>
                      </>
                    )}
                    {activeReport === 'schedules' && (
                      <>
                        <td className="px-6 py-3 font-mono font-bold text-slate-200 print:text-black">{String(item.time)}</td>
                        <td className="px-6 py-3 text-slate-300 print:text-black">{String(item.period_name || 'Standard Bell')}</td>
                        <td className="px-6 py-3 text-slate-400 print:text-black">{item.enabled ? 'Yes' : 'No'}</td>
                        <td className="px-6 py-3 text-slate-400 print:text-black">{(item as unknown as ScheduleRecord).schools?.name || 'N/A'}</td>
                      </>
                    )}
                    {activeReport === 'users' && (
                      <>
                        <td className="px-6 py-3 font-mono text-slate-200 print:text-black">{String(item.email)}</td>
                        <td className="px-6 py-3 text-slate-300 print:text-black">{String(item.full_name || 'N/A')}</td>
                        <td className="px-6 py-3 font-semibold text-indigo-400 print:text-black uppercase">{String(item.role)}</td>
                        <td className="px-6 py-3 text-slate-400 print:text-black">{String((item.schools as { name: string })?.name || 'Super Admin')}</td>
                      </>
                    )}
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
