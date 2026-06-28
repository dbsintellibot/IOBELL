import { useState } from 'react'
import { Download, Upload, ShieldAlert, RefreshCw, CheckCircle } from 'lucide-react'
import { generateSchoolBackup, restoreSchoolBackup } from '@/lib/backupService'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export default function SchoolBackups() {
  const { schoolId, user } = useAuth()
  
  const { data: school } = useQuery({
    queryKey: ['school_name_for_backup', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('name').eq('id', schoolId).single()
      return data
    }
  })

  const schoolName = school?.name || 'Unknown'
  const userId = user?.id || ''

  const [restoring, setRestoring] = useState(false)
  const [progressStage, setProgressStage] = useState('')
  const [progressVal, setProgressVal] = useState(0)
  const [overwrite, setOverwrite] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  const handleExport = async () => {
    if(!schoolId) return;
    try {
      setStatus({ type: 'success', text: 'Generating backup...' })
      await generateSchoolBackup(schoolId, schoolName, userId)
      setStatus({ type: 'success', text: 'Backup downloaded!' })
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message || 'Backup failed.' })
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !schoolId) return

    const confirmMsg = overwrite 
      ? 'WARNING: This will completely replace your active schedules, device profiles, and audio logs. Are you sure you want to proceed?'
      : 'Are you sure you want to merge these backup settings into your current school settings?'
    
    if (!window.confirm(confirmMsg)) return

    setRestoring(true)
    setStatus(null)
    try {
      const result = await restoreSchoolBackup(file, schoolId, overwrite, (stage, percent) => {
        setProgressStage(stage)
        setProgressVal(percent)
      })
      
      setStatus({
        type: 'success',
        text: `Successfully restored! Devices: ${result.devices_restored}, Profiles: ${result.profiles_restored}, Schedules: ${result.bell_times_restored}.`
      })
    } catch (err: any) {
      console.error(err)
      setStatus({ type: 'error', text: err.message || 'Restore failed.' })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Data Backup & Recovery</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Export your schedules, devices configuration, and audio directories, or upload a backup file to restore them.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Box */}
        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10">
                <Download className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Export School Backup</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Downloads a compressed archive (.abk) containing:
            </p>
            <ul className="list-disc pl-5 mt-3 text-sm space-y-1 text-muted-foreground">
              <li>Active schedules, time rules, and TTS schedules</li>
              <li>Registered bells, volumes, locations, and status records</li>
              <li>All local MP3 audio files & custom voice notes</li>
              <li>Theme config and branding parameters</li>
            </ul>
          </div>
          <button
            onClick={handleExport}
            className="mt-6 flex w-full justify-center items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition"
          >
            Generate & Download Backup
          </button>
        </div>

        {/* Restore Box */}
        <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10">
                <Upload className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Import Backup Settings</h3>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="overwriteCheck"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary bg-background focus:ring-primary"
              />
              <label htmlFor="overwriteCheck" className="text-sm font-medium text-amber-600 dark:text-amber-500 flex items-center gap-1.5 cursor-pointer">
                <ShieldAlert className="h-4 w-4" /> Overwrite mode (clears active schedules)
              </label>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Upload a valid autobell_backup.abk file to recover school records.
            </p>
          </div>

          <div className="mt-6">
            {restoring ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-emerald-500" /> {progressStage}
                  </span>
                  <span>{progressVal}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progressVal}%` }}></div>
                </div>
              </div>
            ) : (
              <label className="flex w-full cursor-pointer justify-center items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition">
                <span>Upload & Restore Backup</span>
                <input type="file" accept=".abk,.zip" onChange={handleImport} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      {status && (
        <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 border text-sm ${
          status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
        }`}>
          {status.type === 'success' && <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />}
          <span className="font-semibold">{status.text}</span>
        </div>
      )}
    </div>
  )
}
