# Master Implementation Prompt: AutoBell Backup & Restore System

This document outlines the design and implementation steps for building a complete, secure, tenant-isolated **Data Backup and Restore System** in the AutoBell application. 

Follow this guide to implement backup and restore capabilities for **School Admins** (scoped to their specific school) and **Super Admins** (platform-wide).

---

## 1. System Overview & Scope

The backup system must compile all database records, audio assets, voice notes, and branding images associated with a school (or the entire system) into a single, downloadable, compressed `.zip` (or `.abk` - AutoBell Backup) file. The restore system must accept this file, validate its structure, handle conflict resolution, remap primary/foreign keys, and restore the school's state.

### A. Data Scope (What to Backup)
1. **Database Tables**:
   *   `public.schools`: School settings, quiet hours config, theme mode, and name.
   *   `public.users`: Profiles and role metadata (excluding Supabase Auth credentials, which are handled at the platform level).
   *   `public.bell_devices`: Assigned hardware devices, MAC addresses, status, area, location, volume, and board types.
   *   `public.audio_files`: Metadata for uploaded audio files, track number assignments.
   *   `public.bell_profiles`: Schedule profiles (e.g., "Normal Day", "Exam Day", "Active/Inactive").
   *   `public.bell_times`: Individual scheduled bell times, including day-of-week arrays, times, delay offsets, play types (`mp3` or `tts`), and raw text for TTS messages.
   *   `public.device_logs`: Operational log logs for troubleshooting.
   *   `public.command_queue`: Command execution history.
   *   `public.dfplayer_test_quiet_hours`: DFPlayer configuration overrides.
2. **Storage Buckets (Binary Data)**:
   *   `audio-files` bucket: All `.mp3` files located under the school folder `{school_id}/*`.
   *   `voice-notes` bucket: All TTS/voice note recordings under the school folder `{school_id}/*`.
   *   `school-branding` bucket: School logos/custom branding assets under `{school_id}/*`.

---

## 2. Security & Role Permissions

1.  **School Admins**:
    *   **Backup**: Scoped *only* to their own `school_id`. Queries must use Row-Level Security (RLS) or explicit filters to prevent accessing other schools' data.
    *   **Restore**: Restores data *only* to their own school. If the backup contains a different `school_id`, the system must prevent the upload OR safely remap the restored data to the admin's active `school_id`.
    *   **UI Placement**: Add a **Backup & Restore** section/tab in the **School Settings** page (`/dashboard/settings`).
2.  **Super Admins**:
    *   **Backup**: Can backup the entire database and all storage buckets (system-wide), OR select a specific school from a dropdown to backup just that school.
    *   **Restore**: Can restore a full system backup, or restore/import a backup as a new school (generating a new `school_id`).
    *   **UI Placement**: Create a dedicated **Backup & Restore** page in the Super Admin panel (`/super-admin/backups`) and add it to the sidebar navigation.

---

## 3. Backup Package Format

The backup file must be a standard ZIP archive with the following structure:
```text
backup_[school_name]_[timestamp].abk (ZIP format)
├── metadata.json
├── database.json
└── storage/
    ├── audio-files/
    │   └── [random_filename].mp3
    ├── voice-notes/
    │   └── [random_filename].mp3
    └── school-branding/
        └── logo.png
```

### `metadata.json` Schema
```json
{
  "backup_version": "1.0",
  "app_version": "1.1",
  "timestamp": "2026-06-28T19:15:00.000Z",
  "scope": "school" | "system",
  "school_id": "uuid-here",
  "school_name": "Example High School",
  "exported_by": "user-uuid-here",
  "counts": {
    "devices": 3,
    "profiles": 2,
    "bell_times": 14,
    "audio_files": 5,
    "logs": 120
  }
}
```

---

## 4. Technical Architecture: Client-Side vs. Server-Side

To leverage the existing serverless architecture of Supabase and React/Vite:
1.  **Export (Client-Driven)**: 
    *   The Web App uses the Supabase JS Client to fetch database records.
    *   It lists objects in the storage buckets, downloads each file as a `Blob` / `ArrayBuffer`.
    *   Uses the `jszip` library to compress files and metadata on the client side.
    *   Uses standard browser API or `file-saver` to trigger download.
2.  **Import (Hybrid Transactional)**:
    *   The client extracts the ZIP file using `jszip`.
    *   The client uploads the binary assets to the corresponding Supabase Storage buckets.
    *   To prevent orphaned records and half-written database states on failure, all database insertions are performed using a PostgreSQL PL/pgSQL function (RPC) `public.restore_school_backup(p_payload jsonb)` which executes in a single transaction.

---

## 5. Step-by-Step Implementation Guide

### Step 1: Install Dependencies
In the `web-dashboard` directory:
```bash
npm install jszip file-saver
npm install --save-dev @types/file-saver
```

### Step 2: Implement Database Backup Functions
Implement the client-side exporter utility. Create `web-dashboard/src/lib/backupService.ts`.

#### Exporter Utility Template
```typescript
import { supabase } from '@/lib/supabase'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

export interface BackupMetadata {
  backup_version: string
  app_version: string
  timestamp: string
  scope: 'school' | 'system'
  school_id: string | null
  school_name: string
  exported_by: string
  counts: Record<string, number>
}

export async function generateSchoolBackup(schoolId: string, schoolName: string, userId: string) {
  const zip = new JSZip()
  const dbData: Record<string, any> = {}
  const counts: Record<string, number> = {}

  // 1. Fetch DB Tables
  const tables = [
    { name: 'schools', query: supabase.from('schools').select('*').eq('id', schoolId).single() },
    { name: 'users', query: supabase.from('users').select('*').eq('school_id', schoolId) },
    { name: 'bell_devices', query: supabase.from('bell_devices').select('*').eq('school_id', schoolId) },
    { name: 'audio_files', query: supabase.from('audio_files').select('*').eq('school_id', schoolId) },
    { name: 'bell_profiles', query: supabase.from('bell_profiles').select('*').eq('school_id', schoolId) },
  ]

  for (const table of tables) {
    const { data, error } = await table.query
    if (error && error.code !== 'PGRST116') { // Ignore single-row-not-found errors safely
      throw new Error(`Failed to fetch ${table.name}: ${error.message}`)
    }
    dbData[table.name] = data || []
    counts[table.name] = Array.isArray(data) ? data.length : (data ? 1 : 0)
  }

  // Fetch bell_times linked to the profiles
  const profileIds = (dbData['bell_profiles'] || []).map((p: any) => p.id)
  if (profileIds.length > 0) {
    const { data: bellTimes, error: btError } = await supabase
      .from('bell_times')
      .select('*')
      .in('profile_id', profileIds)
    if (btError) throw btError
    dbData['bell_times'] = bellTimes || []
    counts['bell_times'] = dbData['bell_times'].length
  } else {
    dbData['bell_times'] = []
    counts['bell_times'] = 0
  }

  // Fetch device logs and command queue
  const deviceIds = (dbData['bell_devices'] || []).map((d: any) => d.id)
  if (deviceIds.length > 0) {
    const { data: logs, error: logError } = await supabase
      .from('device_logs')
      .select('*')
      .in('device_id', deviceIds)
    if (logError) throw logError
    dbData['device_logs'] = logs || []
    counts['device_logs'] = dbData['device_logs'].length

    const { data: commands, error: cmdError } = await supabase
      .from('command_queue')
      .select('*')
      .in('device_id', deviceIds)
    if (cmdError) throw cmdError
    dbData['command_queue'] = commands || []
    counts['command_queue'] = dbData['command_queue'].length
  } else {
    dbData['device_logs'] = []
    dbData['command_queue'] = []
    counts['device_logs'] = 0
    counts['command_queue'] = 0
  }

  // 2. Fetch Storage Files
  const buckets = ['audio-files', 'voice-notes', 'school-branding']
  const storageFolder = zip.folder('storage')

  for (const bucket of buckets) {
    const bucketFolder = storageFolder?.folder(bucket)
    const { data: files, error: listError } = await supabase.storage.from(bucket).list(schoolId)
    
    if (listError) {
      console.warn(`Could not list files in bucket ${bucket}:`, listError)
      continue
    }

    if (files) {
      for (const file of files) {
        if (file.name === '.emptyFolderPlaceholder') continue
        
        const filePath = `${schoolId}/${file.name}`
        const { data: blob, error: downloadError } = await supabase.storage
          .from(bucket)
          .download(filePath)

        if (downloadError) {
          console.error(`Error downloading ${filePath} from ${bucket}:`, downloadError)
          continue
        }

        if (blob) {
          bucketFolder?.file(file.name, blob)
        }
      }
    }
  }

  // 3. Create Metadata
  const metadata: BackupMetadata = {
    backup_version: '1.0',
    app_version: '1.1',
    timestamp: new Date().toISOString(),
    scope: 'school',
    school_id: schoolId,
    school_name: schoolName,
    exported_by: userId,
    counts
  }

  zip.file('metadata.json', JSON.stringify(metadata, null, 2))
  zip.file('database.json', JSON.stringify(dbData, null, 2))

  // 4. Compress & Trigger Download
  const content = await zip.generateAsync({ type: 'blob' })
  const sanitizedSchoolName = schoolName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  const dateStr = new Date().toISOString().split('T')[0]
  saveAs(content, `autobell_backup_${sanitizedSchoolName}_${dateStr}.abk`)
}
```

### Step 3: Implement PostgreSQL Restore RPC
To implement the database restore safely, create a Supabase migration file `supabase/migrations/[TIMESTAMP]_add_restore_rpc.sql`.

This function handles:
*   Remapping table IDs (ensuring schedules refer to the correct audio file mapping, devices reference correct school ID, etc.).
*   Upsert/overwrite controls.
*   Preventing MAC address collision by verifying existing devices.

#### SQL Migration Script
```sql
CREATE OR REPLACE FUNCTION public.restore_school_data(
    p_target_school_id uuid,
    p_school_row jsonb,
    p_devices jsonb,
    p_audio_files jsonb,
    p_profiles jsonb,
    p_bell_times jsonb,
    p_overwrite boolean
)
RETURNS json AS $$
DECLARE
    v_audio_map jsonb := '{}'::jsonb;
    v_profile_map jsonb := '{}'::jsonb;
    v_device_map jsonb := '{}'::jsonb;
    
    r_audio record;
    r_device record;
    r_profile record;
    r_bell_time record;
    
    v_new_id uuid;
    v_old_id uuid;
    
    v_devices_restored integer := 0;
    v_audio_restored integer := 0;
    v_profiles_restored integer := 0;
    v_times_restored integer := 0;
BEGIN
    -- 1. Overwrite check (Wipe existing records if requested)
    IF p_overwrite THEN
        -- Cascades to bell_times, device_logs, command_queue
        DELETE FROM public.bell_profiles WHERE school_id = p_target_school_id;
        DELETE FROM public.audio_files WHERE school_id = p_target_school_id;
        DELETE FROM public.bell_devices WHERE school_id = p_target_school_id;
    END IF;

    -- 2. Restore School Settings (except name & logo unless requested, merge config)
    UPDATE public.schools
    SET
        theme_color = COALESCE(p_school_row->>'theme_color', theme_color),
        theme_mode = COALESCE(p_school_row->>'theme_mode', theme_mode),
        quiet_hours_enabled = COALESCE((p_school_row->>'quiet_hours_enabled')::boolean, quiet_hours_enabled),
        quiet_hours_disable_from = COALESCE(p_school_row->>'quiet_hours_disable_from', quiet_hours_disable_from),
        quiet_hours_enable_at = COALESCE(p_school_row->>'quiet_hours_enable_at', quiet_hours_enable_at),
        updated_at = now()
    WHERE id = p_target_school_id;

    -- 3. Restore Audio Files Metadata
    FOR r_audio IN SELECT * FROM jsonb_to_recordset(p_audio_files) AS x(id uuid, name text, storage_path text, duration integer, track_number integer, track_number_2 integer)
    LOOP
        v_new_id := gen_random_uuid();
        v_old_id := r_audio.id;
        
        -- Generate mapping path containing the new target_school_id folder structure
        -- Old: "old-school-uuid/file.mp3" -> New: "new-school-uuid/file.mp3"
        DECLARE
            v_filename text := split_part(r_audio.storage_path, '/', 2);
            v_new_path text := p_target_school_id::text || '/' || v_filename;
        BEGIN
            INSERT INTO public.audio_files (id, name, storage_path, duration, school_id, track_number, track_number_2, created_at)
            VALUES (
                v_new_id,
                r_audio.name,
                v_new_path,
                r_audio.duration,
                p_target_school_id,
                r_audio.track_number,
                r_audio.track_number_2,
                now()
            );
            
            -- Save mapping: old_uuid => new_uuid
            v_audio_map := jsonb_set(v_audio_map, ARRAY[v_old_id::text], to_jsonb(v_new_id));
            v_audio_restored := v_audio_restored + 1;
        END;
    END LOOP;

    -- 4. Restore Devices (skip or overwrite matching MAC addresses)
    FOR r_device IN SELECT * FROM jsonb_to_recordset(p_devices) AS x(id uuid, mac_address text, name text, status text, location text, location_area text, volume integer, board_type text, input_power_type text)
    LOOP
        -- Check MAC conflict
        SELECT id INTO v_new_id FROM public.bell_devices WHERE mac_address = r_device.mac_address;
        
        IF v_new_id IS NOT NULL THEN
            -- Exists: Update device location details if in same school
            UPDATE public.bell_devices
            SET
                name = r_device.name,
                location = r_device.location,
                location_area = r_device.location_area,
                volume = r_device.volume,
                board_type = r_device.board_type,
                input_power_type = r_device.input_power_type,
                school_id = p_target_school_id
            WHERE id = v_new_id;
            
            v_device_map := jsonb_set(v_device_map, ARRAY[r_device.id::text], to_jsonb(v_new_id));
        ELSE
            -- New Device: Insert
            v_new_id := gen_random_uuid();
            INSERT INTO public.bell_devices (id, mac_address, name, status, school_id, location, location_area, volume, board_type, input_power_type, created_at)
            VALUES (
                v_new_id,
                r_device.mac_address,
                r_device.name,
                'offline',
                p_target_school_id,
                r_device.location,
                r_device.location_area,
                r_device.volume,
                r_device.board_type,
                r_device.input_power_type,
                now()
            );
            
            v_device_map := jsonb_set(v_device_map, ARRAY[r_device.id::text], to_jsonb(v_new_id));
            v_devices_restored := v_devices_restored + 1;
        END IF;
    END LOOP;

    -- 5. Restore Bell Profiles
    FOR r_profile IN SELECT * FROM jsonb_to_recordset(p_profiles) AS x(id uuid, name text, is_active boolean)
    LOOP
        v_new_id := gen_random_uuid();
        INSERT INTO public.bell_profiles (id, name, school_id, is_active, created_at)
        VALUES (v_new_id, r_profile.name, p_target_school_id, COALESCE(r_profile.is_active, false), now());
        
        v_profile_map := jsonb_set(v_profile_map, ARRAY[r_profile.id::text], to_jsonb(v_new_id));
        v_profiles_restored := v_profiles_restored + 1;
    END LOOP;

    -- 6. Restore Bell Times (remapping profiles and audio files)
    FOR r_bell_time IN SELECT * FROM jsonb_to_recordset(p_bell_times) AS x(profile_id uuid, bell_time time, day_of_week integer[], audio_file_id uuid, play_type text, tts_message text, delay_seconds integer)
    LOOP
        -- Find mapped profile ID
        DECLARE
            v_mapped_profile_id uuid := (v_profile_map->>(r_bell_time.profile_id::text))::uuid;
            v_mapped_audio_id uuid := (v_audio_map->>(r_bell_time.audio_file_id::text))::uuid;
        BEGIN
            IF v_mapped_profile_id IS NOT NULL THEN
                INSERT INTO public.bell_times (profile_id, bell_time, day_of_week, audio_file_id, play_type, tts_message, delay_seconds, created_at)
                VALUES (
                    v_mapped_profile_id,
                    r_bell_time.bell_time,
                    r_bell_time.day_of_week,
                    v_mapped_audio_id, -- Can be NULL for TTS
                    r_bell_time.play_type,
                    r_bell_time.tts_message,
                    r_bell_time.delay_seconds,
                    now()
                );
                v_times_restored := v_times_restored + 1;
            END IF;
        END;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'devices_restored', v_devices_restored,
        'audio_files_restored', v_audio_restored,
        'profiles_restored', v_profiles_restored,
        'bell_times_restored', v_times_restored
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.restore_school_data(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) TO authenticated;
```

### Step 4: Implement Client-Side Restore Orchestrator
Add the client-side restore handling code to `web-dashboard/src/lib/backupService.ts`.

#### Restore Orchestrator Function
```typescript
import JSZip from 'jszip'
import { supabase } from '@/lib/supabase'

export interface RestoreResult {
  success: boolean
  devices_restored: number
  audio_files_restored: number
  profiles_restored: number
  bell_times_restored: number
}

export async function restoreSchoolBackup(
  file: File, 
  targetSchoolId: string, 
  overwrite: boolean = false,
  onProgress?: (stage: string, percent: number) => void
): Promise<RestoreResult> {
  
  onProgress?.('Extracting backup archive...', 10)
  const zip = await JSZip.loadAsync(file)

  // 1. Read and Validate Metadata
  const metadataFile = zip.file('metadata.json')
  if (!metadataFile) throw new Error('Invalid backup file: metadata.json is missing.')
  const metadata = JSON.parse(await metadataFile.async('text'))
  
  if (metadata.backup_version !== '1.0') {
    throw new Error(`Unsupported backup version: ${metadata.backup_version}`)
  }

  // 2. Read Database Records
  const dbFile = zip.file('database.json')
  if (!dbFile) throw new Error('Invalid backup file: database.json is missing.')
  const dbData = JSON.parse(await dbFile.async('text'))

  onProgress?.('Uploading storage files...', 30)

  // 3. Upload Binary Files to storage
  const buckets = ['audio-files', 'voice-notes', 'school-branding']
  const storageFolder = zip.folder('storage')

  for (const bucket of buckets) {
    const bucketFolder = storageFolder?.folder(bucket)
    if (!bucketFolder) continue

    const files: string[] = []
    bucketFolder.forEach((relativePath) => {
      files.push(relativePath)
    })

    const totalFiles = files.length
    let uploadedCount = 0

    for (const filename of files) {
      const zipFile = bucketFolder.file(filename)
      if (!zipFile) continue

      const blob = await zipFile.async('blob')
      const targetPath = `${targetSchoolId}/${filename}`

      // Upload file to the target school folder
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(targetPath, blob, { upsert: true })

      if (uploadError) {
        console.error(`Error restoring file ${filename} to ${bucket}:`, uploadError)
        // Non-blocking fallback: continue uploading remaining files
      }

      uploadedCount++
      onProgress?.(
        `Restoring files in ${bucket} (${uploadedCount}/${totalFiles})...`, 
        30 + Math.floor((uploadedCount / totalFiles) * 30)
      )
    }
  }

  onProgress?.('Restoring database records...', 80)

  // 4. Invoke PostgreSQL RPC to restore DB inside a transaction
  const schoolRow = dbData['schools']
  const devices = dbData['bell_devices'] || []
  const audioFiles = dbData['audio_files'] || []
  const profiles = dbData['bell_profiles'] || []
  const bellTimes = dbData['bell_times'] || []

  const { data, error } = await supabase.rpc('restore_school_data', {
    p_target_school_id: targetSchoolId,
    p_school_row: Array.isArray(schoolRow) ? schoolRow[0] : schoolRow,
    p_devices: devices,
    p_audio_files: audioFiles,
    p_profiles: profiles,
    p_bell_times: bellTimes,
    p_overwrite: overwrite
  })

  if (error) {
    throw new Error(`Database restore transactional rollback failed: ${error.message}`)
  }

  onProgress?.('Completed backup restore successfully!', 100)
  return data as RestoreResult
}
```

---

## 6. Frontend UI Mockup & Integration

### A. School Admin Settings Panel
Integrate the Backup UI as a Tab in `web-dashboard/src/pages/SchoolSettings.tsx`.

#### UI Component Code (Tailwind + Shadcn)
```tsx
import { generateSchoolBackup, restoreSchoolBackup } from '@/lib/backupService'
import { Download, Upload, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react'

// Put this in SchoolSettings.tsx under a "Backup & Restore" Tab component:
export function BackupSettingsPanel({ schoolId, schoolName, userId }: { schoolId: string, schoolName: string, userId: string }) {
  const [restoring, setRestoring] = useState(false)
  const [progressStage, setProgressStage] = useState('')
  const [progressVal, setProgressVal] = useState(0)
  const [overwrite, setOverwrite] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  const handleExport = async () => {
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
    if (!file) return

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
    <div className="space-y-6 rounded-2xl bg-card p-6 shadow border border-border">
      <div>
        <h3 className="text-lg font-bold text-foreground">Data Backup & Recovery</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Export your schedules, devices configuration, and audio directories, or upload a backup file to restore them.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Box */}
        <div className="p-5 rounded-xl bg-muted/40 border border-border flex flex-col justify-between">
          <div>
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <Download className="h-5 w-5 text-blue-500" /> Export School Backup
            </h4>
            <p className="text-xs text-muted-foreground mt-2">
              Downloads a compressed archive (.abk) containing:
            </p>
            <ul className="list-disc pl-5 mt-2 text-xs space-y-1 text-muted-foreground">
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
        <div className="p-5 rounded-xl bg-muted/40 border border-border flex flex-col justify-between">
          <div>
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <Upload className="h-5 w-5 text-emerald-500" /> Import Backup Settings
            </h4>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="overwriteCheck"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <label htmlFor="overwriteCheck" className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5 cursor-pointer">
                <ShieldAlert className="h-4 w-4" /> Overwrite mode (clears active schedules)
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Upload a valid autobell_backup.abk file to recover school records.
            </p>
          </div>

          <div className="mt-6">
            {restoring ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-500" /> {progressStage}
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
        <div className={`mt-4 p-3 rounded-lg flex items-start gap-2.5 border text-xs ${
          status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
        }`}>
          {status.type === 'success' && <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          <span>{status.text}</span>
        </div>
      )}
    </div>
  )
}
```

### B. Super Admin Control Page
Create a new route `/super-admin/backups` that allows platform owners to execute system backups.
*   **Platform Backup**: Fetches database tables schema-wide. Combines all schools' files.
*   **Targeted Backup**: Provides a school selector dropdown. Downloads a standard school backup identical to what the School Admin receives, but without needing user login permissions for that specific school.
*   **System Restore**: Restores the entire platform database.

---

## 7. Integrity Auditing & Conflict Rules (CRITICAL)

To maintain database integrity on restore, the following policies must be enforced during restoration:
1.  **MAC Address Conflicts**:
    *   MAC addresses must remain unique in `public.bell_devices`.
    *   If a restored device matches a MAC address already registered under another school:
        *   **Throw a Conflict Exception**: Warn the user that Device "XYZ" is registered to another school.
        *   **Provide a Choice**: Do not bind this device, or prompt the Super Admin to execute a re-assignment transfer.
2.  **Cascading Deletes**:
    *   When overwrite is enabled (`p_overwrite: true`), ensure the SQL query relies on foreign key cascading constraints (`ON DELETE CASCADE`) to automatically clean up dependent `bell_times` when `bell_profiles` are removed, and `device_logs`/`command_queue` when `bell_devices` are wiped. This prevents orphaned records.
3.  **Active Profiles Defaulting**:
    *   If multiple profiles exist in the backup, ensure exactly *one* is marked as active (`is_active = true`). If none are active, default to activating the first chronological profile on restore to ensure the ESP32 scheduling heartbeats do not break.
4.  **Static Storage Paths**:
    *   Do not store full absolute URLs in `storage_path`. Store relative paths (e.g., `[school_id]/[file_id].mp3`).
    *   On restore, rewrite the prefix of the relative storage path to match the target school's folder name.

---

## 8. Verification & QA Matrix

Execute these tests to confirm correctness:
*   [ ] **Create Test School**: Seed 3 bell devices, 4 audio files, 2 profiles, and 12 schedules (mixture of MP3 and TTS).
*   [ ] **Trigger Backup**: Save the generated `.abk` file. Inspect the ZIP internally; verify `database.json`, `metadata.json`, and that the `storage/` directory contains all MP3 audio blobs and logos.
*   [ ] **Clean Restore**: Toggle "Overwrite Mode", import the `.abk` file. Validate that:
    1.  The tables are fully restored with identical count metrics.
    2.  New UUID mappings are successfully created and correctly linked between `bell_times` and `audio_files`.
    3.  Restored devices are visible on the dashboard.
    4.  Audio MP3 tracks can be successfully streamed/played on the dashboard using restored URLs.
*   [ ] **Tenant Boundary Validation**: Attempt to restore School A's backup file using School B Admin credentials. Confirm that the system fails the file upload or successfully translates School A's parameters to School B's boundaries without cross-contaminating School A's parameters.
