import { useState, useMemo } from 'react'
import { Plus, Edit2, Save, Loader2, Calendar, Bell, Megaphone, Zap, AlertTriangle, Copy } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatTimeForDatabase, formatTimeForDisplay, parseAmPmParts } from '@/lib/timeFormat'
import { TimeSlotRow } from '@/components/profile/TimeSlotRow'
import type { BellProfile, ScheduleItem, AudioFileItem, BellTimeRow } from '@/types/profile'

type ClashInfo = {
  type: 'hard_clash' | 'buffer_warning' | 'quiet_hours'
  message: string
}

function parseTimeToSeconds(timeStr: string): number {
  const { h, m, ampm } = parseAmPmParts(timeStr)
  let hours = h
  if (ampm === 'PM' && hours !== 12) hours += 12
  if (ampm === 'AM' && hours === 12) hours = 0
  return hours * 3600 + m * 60
}

function computeClashes(
  schedule: ScheduleItem[],
  schoolQuietHours?: { enabled: boolean; fromSec: number; toSec: number }
): Map<string, ClashInfo> {
  const clashMap = new Map<string, ClashInfo>()

  for (let i = 0; i < schedule.length; i++) {
    const itemA = schedule[i]
    const startA = parseTimeToSeconds(itemA.bell_time)
    const durA = 5 + (itemA.delay_seconds || 3) + 20
    const endA = startA + durA

    if (schoolQuietHours?.enabled) {
      const { fromSec, toSec } = schoolQuietHours
      if (fromSec > toSec) {
        if (startA >= fromSec || startA < toSec) {
          clashMap.set(itemA.id, {
            type: 'quiet_hours',
            message: 'ℹ️ QUIET HOURS NOTICE: This time falls inside active quiet hours.'
          })
        }
      } else {
        if (startA >= fromSec && startA < toSec) {
          clashMap.set(itemA.id, {
            type: 'quiet_hours',
            message: 'ℹ️ QUIET HOURS NOTICE: This time falls inside active quiet hours.'
          })
        }
      }
    }

    for (let j = i + 1; j < schedule.length; j++) {
      const itemB = schedule[j]

      if (itemA.day_of_week === itemB.day_of_week) {
        const startB = parseTimeToSeconds(itemB.bell_time)
        const durB = 5 + (itemB.delay_seconds || 3) + 20
        const endB = startB + durB

        if (startA < endB && endA > startB) {
          const labelA = itemA.label || (itemA.play_type === 'mp3' ? 'Period Bell' : 'Scheduled Announcement')
          const labelB = itemB.label || (itemB.play_type === 'mp3' ? 'Period Bell' : 'Scheduled Announcement')
          
          clashMap.set(itemA.id, {
            type: 'hard_clash',
            message: `❌ TIME CLASH ERROR: Overlaps with [${labelB}] scheduled at ${itemB.bell_time}`
          })
          clashMap.set(itemB.id, {
            type: 'hard_clash',
            message: `❌ TIME CLASH ERROR: Overlaps with [${labelA}] scheduled at ${itemA.bell_time}`
          })
        } else {
          let gap = -1
          if (startB >= endA) gap = startB - endA
          else if (startA >= endB) gap = startA - endB

          if (gap >= 0 && gap < 60) {
            const labelA = itemA.label || (itemA.play_type === 'mp3' ? 'Period Bell' : 'Scheduled Announcement')
            const labelB = itemB.label || (itemB.play_type === 'mp3' ? 'Period Bell' : 'Scheduled Announcement')

            if (!clashMap.has(itemA.id)) {
              clashMap.set(itemA.id, {
                type: 'buffer_warning',
                message: `⚠️ TIGHT SCHEDULE WARNING: Only ${gap}s buffer gap with [${labelB}] at ${itemB.bell_time}. Audio may queue sequentially.`
              })
            }
            if (!clashMap.has(itemB.id)) {
              clashMap.set(itemB.id, {
                type: 'buffer_warning',
                message: `⚠️ TIGHT SCHEDULE WARNING: Only ${gap}s buffer gap with [${labelA}] at ${itemA.bell_time}. Audio may queue sequentially.`
              })
            }
          }
        }
      }
    }
  }

  return clashMap
}

export default function PeriodBellsAndAnnouncements() {
  const { schoolId } = useAuth()
  const queryClient = useQueryClient()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const [selectedDay, setSelectedDay] = useState(new Date().getDay())
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [activeBoardType, setActiveBoardType] = useState<'ESP32-S3 N16R8' | 'ESP32-C3 Mini'>('ESP32-S3 N16R8')

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createProfileName, setCreateProfileName] = useState('')

  // Fetch School Devices to detect S3/Mini presence
  const { data: schoolDevices = [] } = useQuery({
    queryKey: ['school_devices_types', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from('bell_devices').select('board_type').eq('school_id', schoolId)
      return data || []
    }
  })

  const hasS3 = schoolDevices.length === 0 || schoolDevices.some(d => !d.board_type || d.board_type !== 'ESP32-C3 Mini')
  const hasMini = schoolDevices.some(d => d.board_type === 'ESP32-C3 Mini')

  // Set default board type based on school devices
  useState(() => {
    if (schoolDevices.length > 0) {
      const hasS3Devices = schoolDevices.some(d => !d.board_type || d.board_type !== 'ESP32-C3 Mini')
      if (!hasS3Devices) {
        setActiveBoardType('ESP32-C3 Mini')
      }
    }
  })

  const handleBoardTypeChange = (type: 'ESP32-S3 N16R8' | 'ESP32-C3 Mini') => {
    setActiveBoardType(type)
    setSelectedProfileId(null)
  }

  // Fetch Profiles filtered by Board Type
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ['profiles', activeBoardType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bell_profiles')
        .select('id, name, is_active, board_type')
        .order('name')
      if (error) return []
      return (data || []).filter(p => {
        const bt = p.board_type || 'ESP32-S3 N16R8'
        return bt === activeBoardType
      }) as BellProfile[]
    }
  })
  const activeProfileId = selectedProfileId ?? profiles[0]?.id ?? null

  // Fetch Audio Files
  const { data: audioFiles = [] } = useQuery<AudioFileItem[]>({
    queryKey: ['audio_files_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audio_files')
        .select('id, name')
        .not('storage_path', 'ilike', 'combined/%')
        .order('name')
      if (error) return []
      return data as AudioFileItem[]
    }
  })

  // Fetch Quiet Hours Settings
  const { data: quietHours } = useQuery({
    queryKey: ['school_quiet_hours', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from('schools')
        .select('quiet_hours_enabled, quiet_hours_disable_from, quiet_hours_enable_at')
        .eq('id', schoolId)
        .single()
      
      if (!data) return { enabled: false, fromSec: 75600, toSec: 25200 }
      const fromParts = (data.quiet_hours_disable_from || '21:00:00').split(':')
      const toParts = (data.quiet_hours_enable_at || '07:00:00').split(':')

      return {
        enabled: !!data.quiet_hours_enabled,
        fromSec: parseInt(fromParts[0]) * 3600 + parseInt(fromParts[1]) * 60,
        toSec: parseInt(toParts[0]) * 3600 + parseInt(toParts[1]) * 60
      }
    }
  })

  // Fetch School Settings (for default TTS language/gender)
  const { data: schoolSettings } = useQuery({
    queryKey: ['school_settings_tts', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('default_tts_language, default_tts_gender')
        .eq('id', schoolId)
        .single()
      if (error) return { default_tts_language: 'en', default_tts_gender: 'female' }
      return data
    }
  })

  // Fetch Schedule for selected profile
  const { data: schedule = [] } = useQuery<BellTimeRow[]>({
    queryKey: ['schedule', activeProfileId],
    enabled: !!activeProfileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bell_times')
        .select('id, bell_time, day_of_week, audio_file_id, audio_file_id_2, delay_seconds, play_type, tts_message, label, include_weather, tts_gender, tts_language')
        .eq('profile_id', activeProfileId)
        .order('bell_time', { ascending: true })
      if (error) return []
      return (data ?? []) as BellTimeRow[]
    }
  })

  const expandedSchedule = useMemo<ScheduleItem[]>(() => {
    return schedule.flatMap((item) => {
      const dayValues = Array.isArray(item.day_of_week) ? item.day_of_week : []
      if (dayValues.length === 0) {
        return [{
          id: item.id,
          bell_time: item.bell_time,
          audio_file_id: item.audio_file_id ?? null,
          audio_file_id_2: item.audio_file_id_2 ?? null,
          delay_seconds: item.delay_seconds ?? 0,
          day_of_week: 0,
          play_type: item.play_type ?? 'mp3',
          tts_message: item.tts_message ?? null,
          label: item.label ?? null,
          include_weather: item.include_weather ?? false,
          tts_gender: item.tts_gender ?? null,
          tts_language: item.tts_language ?? null
        }]
      }
      return dayValues.map((day) => ({
        id: `${item.id}-${day}`,
        bell_time: formatTimeForDisplay(item.bell_time),
        audio_file_id: item.audio_file_id ?? null,
        audio_file_id_2: item.audio_file_id_2 ?? null,
        delay_seconds: item.delay_seconds ?? 0,
        day_of_week: day === 7 ? 0 : day,
        play_type: item.play_type ?? 'mp3',
        tts_message: item.tts_message ?? null,
        label: item.label ?? null,
        include_weather: item.include_weather ?? false,
        tts_gender: item.tts_gender ?? null,
        tts_language: item.tts_language ?? null
      }))
    })
  }, [schedule])

  const selectedProfileName = useMemo(() => {
    if (!activeProfileId) return ''
    const profile = profiles.find(p => p.id === activeProfileId)
    return profile?.name ?? ''
  }, [activeProfileId, profiles])

  const scheduleKey = useMemo(() => {
    const scheduleToken = expandedSchedule
      .map(item => `${item.id}-${item.bell_time}-${item.audio_file_id ?? ''}-${item.audio_file_id_2 ?? ''}-${item.delay_seconds}-${item.day_of_week}-${item.play_type}-${item.tts_message ?? ''}-${item.tts_gender ?? ''}-${item.tts_language ?? ''}`)
      .join('|')
    return `${activeProfileId ?? 'none'}-${scheduleToken}`
  }, [activeProfileId, expandedSchedule])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-7 w-7 text-primary" />
            Period Bells & Scheduled Announcements
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Unified timeline with mandatory pre-announcements and real-time clash error detection.
          </p>
        </div>
      </div>

      <div className="flex h-full flex-col gap-6 md:flex-row">
        {/* Sidebar */}
        <div className="w-full rounded-xl border border-border bg-card text-foreground shadow-sm md:w-64 shrink-0 overflow-hidden">
          {hasS3 && hasMini && (
            <div className="flex border-b border-border bg-muted/20 p-1">
              <button
                onClick={() => handleBoardTypeChange('ESP32-S3 N16R8')}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded-md transition-all ${
                  activeBoardType === 'ESP32-S3 N16R8'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                AutoBell S3
              </button>
              <button
                onClick={() => handleBoardTypeChange('ESP32-C3 Mini')}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded-md transition-all ${
                  activeBoardType === 'ESP32-C3 Mini'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                AutoBell Mini
              </button>
            </div>
          )}
          <div className="flex items-center justify-between border-b border-border p-4 bg-muted/30">
            <h3 className="font-semibold text-sm text-foreground">Schedules & Profiles</h3>
            <button
              onClick={() => {
                setCreateProfileName('')
                setIsCreateModalOpen(true)
              }}
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Create Profile"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="p-2 space-y-1">
            {loadingProfiles ? (
              <div className="p-4 text-xs text-muted-foreground">Loading schedules...</div>
            ) : profiles.map(profile => (
              <div
                key={profile.id}
                className={`group flex cursor-pointer items-center justify-between rounded-lg p-3 text-xs transition-colors ${
                  activeProfileId === profile.id
                    ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                    : 'text-foreground hover:bg-muted'
                }`}
                onClick={() => setSelectedProfileId(profile.id)}
              >
                <div className="flex items-center gap-2 overflow-hidden min-w-0">
                  <span className="truncate">{profile.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Editor Body */}
        {activeProfileId ? (
          <PeriodBellsEditorBody
            key={scheduleKey}
            selectedProfileId={activeProfileId}
            initialProfileName={selectedProfileName}
            initialSchedule={expandedSchedule}
            audioFiles={audioFiles}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            days={days}
            quietHours={quietHours}
            queryClient={queryClient}
            schoolId={schoolId}
            defaultTtsLanguage={schoolSettings?.default_tts_language || 'en'}
            boardType={activeBoardType}
          />
        ) : (
          <div className="flex-1 min-w-0 rounded-xl border border-border bg-card text-muted-foreground shadow-sm p-8 text-center text-sm">
            Select or create a schedule profile to manage period bells and announcements.
          </div>
        )}
      </div>

      {/* Create Profile Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-card text-foreground p-6 shadow-2xl border border-border">
            <h3 className="mb-4 text-lg font-bold text-foreground">Create New Schedule Profile</h3>
            <input
              type="text"
              value={createProfileName}
              onChange={(e) => setCreateProfileName(e.target.value)}
              placeholder="e.g. Normal School Day, Exam Schedule"
              className="w-full rounded-lg border border-input bg-background text-foreground p-2.5 mb-4 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!createProfileName.trim() || !schoolId) return
                  const name = createProfileName.trim()
                  const { data } = await supabase
                    .from('bell_profiles')
                    .insert({ name, school_id: schoolId, board_type: activeBoardType })
                    .select('id')
                    .single()
                  if (data?.id) {
                    setSelectedProfileId(data.id)
                    queryClient.invalidateQueries({ queryKey: ['profiles'] })
                  }
                  setIsCreateModalOpen(false)
                }}
                disabled={!createProfileName.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PeriodBellsEditorBody({
  selectedProfileId,
  initialProfileName,
  initialSchedule,
  audioFiles,
  selectedDay,
  setSelectedDay,
  days,
  quietHours,
  queryClient,
  schoolId,
  defaultTtsLanguage,
  boardType
}: {
  selectedProfileId: string
  initialProfileName: string
  initialSchedule: ScheduleItem[]
  audioFiles: AudioFileItem[]
  selectedDay: number
  setSelectedDay: (day: number) => void
  days: string[]
  quietHours?: { enabled: boolean; fromSec: number; toSec: number }
  queryClient: ReturnType<typeof useQueryClient>
  schoolId: string | null
  defaultTtsLanguage?: 'en' | 'ur' | 'ar'
  boardType: 'ESP32-S3 N16R8' | 'ESP32-C3 Mini'
}) {
  const [localSchedule, setLocalSchedule] = useState<ScheduleItem[]>(initialSchedule)
  const [localProfileName, setLocalProfileName] = useState(initialProfileName)
  const [isDirty, setIsDirty] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [renameInput, setRenameInput] = useState('')

  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false)
  const [selectedTargetDays, setSelectedTargetDays] = useState<number[]>([])
  const [copyBells, setCopyBells] = useState(true)
  const [copyAnnouncements, setCopyAnnouncements] = useState(true)

  const clashesMap = useMemo(() => {
    return computeClashes(localSchedule, quietHours)
  }, [localSchedule, quietHours])

  const hasHardClash = useMemo(() => {
    return Array.from(clashesMap.values()).some(c => c.type === 'hard_clash')
  }, [clashesMap])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (hasHardClash) {
        throw new Error('❌ Cannot save: Time clash errors detected! Please resolve highlighted red conflicts.')
      }

      const { error: profileError } = await supabase
        .from('bell_profiles')
        .update({ name: localProfileName })
        .eq('id', selectedProfileId)
      if (profileError) throw profileError

      const { error: deleteError } = await supabase
        .from('bell_times')
        .delete()
        .eq('profile_id', selectedProfileId)
      if (deleteError) throw deleteError

      const grouped = new Map<string, {
        bell_time: string
        audio_file_id: string | null
        audio_file_id_2: string | null
        delay_seconds: number
        play_type: 'mp3' | 'tts'
        tts_message: string | null
        label: string | null
        include_weather: boolean
        tts_gender: 'male' | 'female' | null
        tts_language: 'en' | 'ur' | 'ar' | null
        days: Set<number>
      }>()

      localSchedule.forEach(item => {
        const dbTime = formatTimeForDatabase(item.bell_time)
        const key = `${dbTime}-${item.audio_file_id ?? 'null'}-${item.audio_file_id_2 ?? 'null'}-${item.delay_seconds}-${item.play_type}-${item.tts_message ?? 'null'}-${item.label ?? 'null'}-${item.include_weather ? 'true' : 'false'}-${item.tts_gender ?? 'null'}-${item.tts_language ?? 'default'}`
        if (!grouped.has(key)) {
          grouped.set(key, {
            bell_time: dbTime,
            audio_file_id: item.audio_file_id,
            audio_file_id_2: item.audio_file_id_2,
            delay_seconds: item.delay_seconds,
            play_type: item.play_type,
            tts_message: item.tts_message,
            label: item.label ?? null,
            include_weather: item.include_weather ?? false,
            tts_gender: item.tts_gender ?? null,
            tts_language: item.tts_language ?? null,
            days: new Set()
          })
        }
        grouped.get(key)!.days.add(item.day_of_week)
      })

      const itemsToInsert = Array.from(grouped.values()).map(g => ({
        bell_time: g.bell_time,
        audio_file_id: g.audio_file_id,
        audio_file_id_2: g.audio_file_id_2,
        delay_seconds: g.delay_seconds,
        play_type: g.play_type,
        tts_message: g.tts_message,
        label: g.label,
        include_weather: g.include_weather,
        tts_gender: g.tts_gender,
        tts_language: g.tts_language,
        day_of_week: Array.from(g.days).map(d => d === 0 ? 7 : d).sort((a, b) => a - b),
        profile_id: selectedProfileId
      }))

      if (itemsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('bell_times').insert(itemsToInsert)
        if (insertError) throw insertError
      }

      if (schoolId && boardType === 'ESP32-S3 N16R8') {
        try {
          const { data: precombineResult } = await supabase.functions.invoke('precombine-schedule', { body: { school_id: schoolId } })
          if (precombineResult?.failed_count > 0) {
            console.warn(`Precombine: ${precombineResult.processed_count} succeeded, ${precombineResult.failed_count} failed`, precombineResult.failed_ids)
          } else {
            console.log(`Precombine: ${precombineResult?.processed_count || 0} schedules pre-combined successfully`)
          }
        } catch (err) {
          console.warn('Precombine schedule error (announcements will play without chime):', err)
        }
      }

      if (schoolId) {
        const { data: devices } = await supabase.from('bell_devices').select('id').eq('school_id', schoolId)
        if (devices && devices.length > 0) {
          const commands = devices.map(d => ({
            device_id: d.id,
            command: 'SYNC_SCHEDULES',
            payload: { source: 'combined_profile_save', profile_id: selectedProfileId }
          }))
          await supabase.from('command_queue').insert(commands)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', selectedProfileId] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      setIsDirty(false)
      setNotification({ type: 'success', message: 'Combined schedule saved successfully! Devices syncing...' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error) => {
      setNotification({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save schedule.' })
      setTimeout(() => setNotification(null), 3000)
    }
  })

  const handleUpdateItem = <K extends keyof ScheduleItem>(id: string, field: K, value: ScheduleItem[K]) => {
    setLocalSchedule(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
    setIsDirty(true)
  }

  const handleDeleteItem = (id: string) => {
    setLocalSchedule(prev => prev.filter(item => item.id !== id))
    setIsDirty(true)
  }

  const handleCopyScheduleConfirm = () => {
    const nextSchedule = localSchedule.filter(item => {
      if (selectedTargetDays.includes(item.day_of_week)) {
        if (boardType === 'ESP32-C3 Mini') return false; // Mini overwrites all items on target days
        if (item.play_type === 'mp3' && copyBells) return false;
        if (item.play_type === 'tts' && copyAnnouncements) return false;
      }
      return true;
    });

    const sourceItems = localSchedule.filter(item => {
      if (item.day_of_week === selectedDay) {
        if (boardType === 'ESP32-C3 Mini') return true; // Mini copies all items
        if (item.play_type === 'mp3' && copyBells) return true;
        if (item.play_type === 'tts' && copyAnnouncements) return true;
      }
      return false;
    });

    const clonedItems = selectedTargetDays.flatMap(targetDay =>
      sourceItems.map(item => ({
        ...item,
        id: `copy-${item.id}-${targetDay}-${Math.random().toString(36).substr(2, 9)}`,
        day_of_week: targetDay
      }))
    );

    setLocalSchedule([...nextSchedule, ...clonedItems]);
    setIsDirty(true);
    setIsCopyModalOpen(false);
    setNotification({ type: 'success', message: 'Copied schedule to target days. Click "Save Schedule" to persist changes.' });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleAddItem = (type: 'mp3' | 'tts') => {
    const isMini = boardType === 'ESP32-C3 Mini'
    const newItem: ScheduleItem = {
      id: `temp-${Date.now()}`,
      bell_time: '08:00 AM',
      audio_file_id: (type === 'mp3' && !isMini) ? (audioFiles[0]?.id ?? null) : null,
      audio_file_id_2: null,
      delay_seconds: isMini ? 5 : 3,
      day_of_week: selectedDay,
      play_type: type,
      tts_message: (type === 'tts' && !isMini) ? 'Attention students, class is starting.' : null,
      label: isMini ? 'Relay Bell Trigger' : (type === 'mp3' ? 'Period Bell' : 'Scheduled Announcement'),
      include_weather: false,
      tts_gender: null,
      tts_language: null
    }
    setLocalSchedule(prev => [...prev, newItem])
    setIsDirty(true)
  }

  const dayItems = useMemo(() => {
    return localSchedule
      .filter(s => s.day_of_week === selectedDay)
      .sort((a, b) => parseTimeToSeconds(a.bell_time) - parseTimeToSeconds(b.bell_time))
  }, [localSchedule, selectedDay])

  return (
    <div className="flex-1 min-w-0 rounded-xl border border-border bg-card text-foreground shadow-sm p-6 space-y-6">
      {notification && (
        <div className={`p-4 rounded-xl text-sm ${notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20'}`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            {localProfileName}
            <button
              onClick={() => {
                setRenameInput(localProfileName)
                setIsRenameModalOpen(true)
              }}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          </h2>
          <p className="text-xs text-muted-foreground">Editing combined timeline for {days[selectedDay]}</p>
        </div>

        <div className="flex items-center gap-3">
          {hasHardClash && (
            <span className="text-xs font-bold text-red-500 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/30 flex items-center gap-1.5 animate-pulse">
              <AlertTriangle className="h-4 w-4" />
              Save Blocked (Time Clash)
            </span>
          )}
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || saveMutation.isPending || hasHardClash}
            className="flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
          >
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saveMutation.isPending ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>

      {/* Rename Modal */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card text-foreground p-6 shadow-lg border border-border">
            <h3 className="mb-4 text-lg font-bold text-foreground">Rename Profile</h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              placeholder="Enter new profile name"
              className="w-full rounded-md border border-input bg-background text-foreground p-2 mb-4 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsRenameModalOpen(false)}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const newName = renameInput.trim()
                  if (newName) {
                    setLocalProfileName(newName)
                    setIsDirty(true)
                  }
                  setIsRenameModalOpen(false)
                }}
                disabled={!renameInput.trim() || renameInput.trim() === localProfileName}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Modal */}
      {isCopyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-card text-foreground p-6 shadow-2xl border border-border">
            <div className="flex items-center gap-2 mb-2 text-primary">
              <Copy className="h-5 w-5" />
              <h3 className="text-lg font-bold text-foreground">Copy Schedule</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Copy the schedule from <strong>{days[selectedDay]}</strong> to other days.
            </p>

            {/* Target Days Selection */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Target Days
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const allOtherDays = days
                      .map((_, idx) => idx)
                      .filter(idx => idx !== selectedDay);
                    if (selectedTargetDays.length === allOtherDays.length) {
                      setSelectedTargetDays([]);
                    } else {
                      setSelectedTargetDays(allOtherDays);
                    }
                  }}
                  className="text-xs text-primary hover:underline font-medium cursor-pointer"
                >
                  {selectedTargetDays.length === days.length - 1 ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                {days.map((day, idx) => {
                  const isSource = idx === selectedDay;
                  return (
                    <label
                      key={day}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border text-sm transition-all ${
                        isSource
                          ? 'opacity-40 bg-muted cursor-not-allowed border-transparent'
                          : selectedTargetDays.includes(idx)
                          ? 'border-primary/50 bg-primary/5 text-primary font-medium'
                          : 'border-border bg-background hover:bg-muted/50 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isSource}
                        checked={!isSource && selectedTargetDays.includes(idx)}
                        onChange={() => {
                          if (isSource) return;
                          setSelectedTargetDays(prev =>
                            prev.includes(idx)
                              ? prev.filter(d => d !== idx)
                              : [...prev, idx]
                          );
                        }}
                        className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                      />
                      <span>{day}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Options Selection */}
            {boardType !== 'ESP32-C3 Mini' && (
              <div className="border-t border-border pt-4 mb-6">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Schedule Types to Copy
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={copyBells}
                      onChange={(e) => setCopyBells(e.target.checked)}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>🔔 Period Bells</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={copyAnnouncements}
                      onChange={(e) => setCopyAnnouncements(e.target.checked)}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>📢 Announcements</span>
                  </label>
                </div>
              </div>
            )}

            {/* Overwrite Warning Banner */}
            {selectedTargetDays.length > 0 && (
              <div className="mb-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Overwrite Warning</p>
                  <p className="mt-0.5">
                    This will replace existing items on the selected target days for the checked schedule types.
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCopyModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleCopyScheduleConfirm}
                disabled={selectedTargetDays.length === 0 || (!copyBells && !copyAnnouncements)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Copy & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Days Tab */}
      <div className="border-b border-border pb-3 flex items-center justify-between gap-4">
        <div className="flex space-x-1 overflow-x-auto">
          {days.map((day, idx) => (
            <button
              key={day}
              onClick={() => setSelectedDay(idx)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                selectedDay === idx
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setSelectedTargetDays([]);
            setIsCopyModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted text-foreground transition-colors shrink-0 cursor-pointer"
        >
          <Copy className="h-3.5 w-3.5" /> Copy Schedule
        </button>
      </div>

      {/* Timeline View */}
      <div className="space-y-4">
        {dayItems.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-border rounded-xl text-muted-foreground text-xs">
            {boardType === 'ESP32-C3 Mini' 
              ? `No relay bells scheduled for ${days[selectedDay]}.`
              : `No period bells or announcements scheduled for ${days[selectedDay]}.`}
          </div>
        ) : (
          dayItems.map((item) => {
            const clash = clashesMap.get(item.id)
            const isMini = boardType === 'ESP32-C3 Mini'
            return (
              <div key={item.id} className="relative">
                {/* Badges Bar */}
                <div className="flex items-center gap-2 mb-1 pl-1">
                  {isMini ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">
                      <Bell className="h-3 w-3" /> Relay Bell Trigger
                    </span>
                  ) : item.play_type === 'mp3' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
                      <Bell className="h-3 w-3" /> Period Bell
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
                      <Megaphone className="h-3 w-3" /> Scheduled Announcement
                    </span>
                  )}
                  {!isMini && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                      <Zap className="h-3 w-3" /> Mandatory Pre-Chime (+3s)
                    </span>
                  )}
                </div>
 
                <TimeSlotRow
                  item={item}
                  audioFiles={audioFiles}
                  handleUpdateItem={handleUpdateItem}
                  handleDeleteItem={handleDeleteItem}
                  clashMessage={clash?.message}
                  defaultTtsLanguage={defaultTtsLanguage}
                  boardType={boardType}
                />
              </div>
            )
          })
        )}
 
        {/* Add Actions */}
        <div className="pt-2">
          {boardType === 'ESP32-C3 Mini' ? (
            <button
              onClick={() => handleAddItem('mp3')}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 p-4 text-xs font-semibold text-primary hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add Scheduled Relay Bell Trigger
            </button>
          ) : (
            <button
              onClick={() => handleAddItem('tts')}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-purple-500/30 p-4 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:border-purple-500 hover:bg-purple-500/5 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add Scheduled Announcement (📢 TTS Voice)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
