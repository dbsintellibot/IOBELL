import { useState, useEffect } from 'react'
import { Download, Upload, ShieldAlert, CheckCircle, RefreshCw, DatabaseBackup, Building2 } from 'lucide-react'
import { 
  generateSchoolBackup, 
  generatePlatformBackup, 
  restorePlatformBackup, 
  getAllSchools 
} from '@/lib/backupService'
import { useAuth } from '@/hooks/useAuth'

export default function Backups() {
  const { user } = useAuth()
  const [schools, setSchools] = useState<{id: string, name: string}[]>([])
  const [selectedSchool, setSelectedSchool] = useState<string>('')
  
  const [restoring, setRestoring] = useState(false)
  const [progressStage, setProgressStage] = useState('')
  const [progressVal, setProgressVal] = useState(0)
  const [overwrite, setOverwrite] = useState(false)
  
  const [status, setStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [restoreMessages, setRestoreMessages] = useState<string[]>([])

  useEffect(() => {
    getAllSchools().then(data => {
      setSchools(data || [])
      if(data && data.length > 0) setSelectedSchool(data[0].id)
    }).catch(console.error)
  }, [])

  const handleSchoolExport = async () => {
    if (!selectedSchool) return
    const schoolName = schools.find(s => s.id === selectedSchool)?.name || 'Unknown'
    
    try {
      setStatus({ type: 'success', text: `Generating backup for ${schoolName}...` })
      setRestoreMessages([])
      await generateSchoolBackup(selectedSchool, schoolName, user?.id || '')
      setStatus({ type: 'success', text: `Backup for ${schoolName} downloaded!` })
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Backup failed.' })
    }
  }

  const handlePlatformExport = async () => {
    try {
      setStatus({ type: 'success', text: 'Generating full platform backup...' })
      setRestoreMessages([])
      await generatePlatformBackup(user?.id || '')
      setStatus({ type: 'success', text: 'Platform backup downloaded!' })
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Platform backup failed.' })
    }
  }

  const handlePlatformImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const confirmMsg = overwrite 
      ? 'CRITICAL WARNING: This will overwrite data for ALL schools in this backup. Proceed?'
      : 'Merge platform backup into the current system?'
    
    if (!window.confirm(confirmMsg)) return

    setRestoring(true)
    setStatus(null)
    setRestoreMessages([])

    try {
      const result = await restorePlatformBackup(file, overwrite, (stage, percent) => {
        setProgressStage(stage)
        setProgressVal(percent)
      })
      
      setStatus({
        type: 'success',
        text: 'Platform restore operation completed.'
      })
      setRestoreMessages(result.messages)
    } catch (err: any) {
      console.error(err)
      setStatus({ type: 'error', text: err.message || 'Platform restore failed.' })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Super Admin Backups</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Perform isolated school backups or full system-wide backups.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Targeted School Backup */}
        <div className="p-6 rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10">
                <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Targeted School Backup</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Generate a standard <code>.abk</code> backup file for a specific school. This is identical to what School Admins download.
            </p>
            
            <div className="mt-5">
              <label className="block text-sm font-medium text-foreground mb-1">Select School</label>
              <select 
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
              >
                {schools.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <button
            onClick={handleSchoolExport}
            className="mt-6 flex w-full justify-center items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition"
          >
            <Download className="h-4 w-4" /> Download School Backup
          </button>
        </div>

        {/* Platform Backup */}
        <div className="p-6 rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10">
                <DatabaseBackup className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Platform Backup</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Exports the entire database (all schools, users, devices) and all storage buckets into a single comprehensive backup file.
            </p>
          </div>
          
          <button
            onClick={handlePlatformExport}
            className="mt-6 flex w-full justify-center items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition"
          >
            <Download className="h-4 w-4" /> Download Full Platform Backup
          </button>
        </div>
        
        {/* Platform Restore */}
        <div className="p-6 rounded-2xl border border-border bg-card shadow-sm flex flex-col lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10">
              <Upload className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Platform Restore</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Upload a platform-wide <code>.abk</code> file. This will iterate through all schools in the backup and restore their respective data securely.
          </p>
          
          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="overwriteCheck"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="h-4 w-4 rounded border-input text-amber-600"
            />
            <label htmlFor="overwriteCheck" className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5 cursor-pointer">
              <ShieldAlert className="h-4 w-4" /> Overwrite mode (Wipes existing school records before import)
            </label>
          </div>
          
          <div className="mt-6">
            {restoring ? (
              <div className="space-y-2 max-w-md">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-amber-500" /> {progressStage}
                  </span>
                  <span>{progressVal}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-amber-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progressVal}%` }}></div>
                </div>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer justify-center items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition">
                <span>Upload & Restore Platform</span>
                <input type="file" accept=".abk,.zip" onChange={handlePlatformImport} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      {status && (
        <div className={`p-4 rounded-xl flex flex-col gap-2 border text-sm ${
          status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 border-destructive/20 text-destructive dark:text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {status.type === 'success' && <CheckCircle className="h-5 w-5 flex-shrink-0" />}
            <span className="font-semibold">{status.text}</span>
          </div>
          {restoreMessages.length > 0 && (
            <div className="mt-2 text-xs space-y-1">
              {restoreMessages.map((msg, i) => (
                <div key={i}>• {msg}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
