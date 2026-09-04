import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, Save, Loader2, Copy, AlertTriangle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

import type { BellProfile, BellTimeRow, ScheduleItem, AudioFileItem } from '@/types/profile'

type ProfileEditorBodyProps = {
    selectedProfileId: string
    initialProfileName: string
    initialSchedule: ScheduleItem[]
    audioFiles: AudioFileItem[]
    selectedDay: number
    setSelectedDay: (day: number) => void
    days: string[]
    queryClient: ReturnType<typeof useQueryClient>
    schoolId: string | null
}

import { formatTimeForDatabase, formatTimeForDisplay, parseAmPmParts } from '@/lib/timeFormat'
import { TimeSlotRow } from '@/components/profile/TimeSlotRow'

export default function ProfileEditor() {
    const { schoolId } = useAuth()
    const queryClient = useQueryClient()
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const [selectedDay, setSelectedDay] = useState(new Date().getDay())
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
    
    // Modal States
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [createProfileName, setCreateProfileName] = useState('')
    const [profileToDelete, setProfileToDelete] = useState<BellProfile | null>(null)

    // Fetch Profiles
    const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
        queryKey: ['profiles'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('bell_profiles')
                .select('id, name, is_active')
                .order('name')
            if (error) {
                console.warn("Error fetching profiles:", error)
                return []
            }
            return data as BellProfile[]
        }
    })
    const activeProfileId = selectedProfileId ?? profiles[0]?.id ?? null

    const deleteProfileMutation = useMutation({
        mutationFn: async (profile: BellProfile) => {
            // 1. Delete associated bell_times (defensive, in case cascade is missing)
            const { error: timesError } = await supabase
                .from('bell_times')
                .delete()
                .eq('profile_id', profile.id)
            if (timesError) throw timesError

            // 2. Delete the profile
            const { error: profileError } = await supabase
                .from('bell_profiles')
                .delete()
                .eq('id', profile.id)
            if (profileError) throw profileError
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['profiles'] })
            if (selectedProfileId === variables.id) {
                setSelectedProfileId(null)
            }
        },
        onError: (error) => {
            console.error("Delete failed:", error)
            setNotification({ type: 'error', message: `Failed to delete profile: ${error.message}` })
            setTimeout(() => setNotification(null), 3000)
        }
    })

    const handleDeleteProfileClick = (profile: BellProfile, e: React.MouseEvent) => {
        e.stopPropagation()
        setProfileToDelete(profile)
    }

    const confirmDeleteProfile = () => {
        if (profileToDelete) {
            deleteProfileMutation.mutate(profileToDelete)
            setProfileToDelete(null)
        }
    }

    // Fetch Audio Files for dropdown
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
                
             if (error) {
                 return []
             }
             return (data ?? []) as BellTimeRow[]
        }
    })

    const handleCreateProfileClick = () => {
        setCreateProfileName('')
        setIsCreateModalOpen(true)
    }

    const confirmCreateProfile = async () => {
        if (!createProfileName.trim()) return
        
        if (!schoolId) {
            setNotification({ type: 'error', message: 'No school found for this user.' })
            setTimeout(() => setNotification(null), 3000)
            return
        }
        
        const name = createProfileName.trim()
        const { data, error } = await supabase
            .from('bell_profiles')
            .insert({
                name,
                school_id: schoolId
            })
            .select('id')
            .single()
            
        if (error) {
            setNotification({ type: 'error', message: 'Failed to create profile' })
            setTimeout(() => setNotification(null), 3000)
            setIsCreateModalOpen(false)
            return
        }
        
        if (data?.id) {
            setSelectedProfileId(data.id)
            queryClient.setQueryData<BellProfile[]>(['profiles'], (current) => {
                const next = [...(current ?? []), { id: data.id, name, is_active: false }]
                return next.sort((a, b) => a.name.localeCompare(b.name))
            })
        }
        setIsCreateModalOpen(false)
    }
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
                // UI (0=Sun, 1=Mon...6=Sat) <-> DB (1=Mon...7=Sun)
                // When reading FROM DB: 7 (Sun) -> 0 (Sun), 1 (Mon) -> 1 (Mon)
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
        <div className="flex h-full flex-col gap-6 md:flex-row">
            {/* Profiles Sidebar */}
            <div className="w-full rounded-lg border bg-card text-foreground shadow-sm md:w-64 shrink-0">
                {notification && (
                    <div className={`p-2 text-xs text-center ${notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive dark:text-red-400'}`}>
                        {notification.message}
                    </div>
                )}
                <div className="flex items-center justify-between border-b p-4">
                    <h3 className="font-medium text-foreground">Profiles</h3>
                    <button onClick={handleCreateProfileClick} className="rounded p-1 hover:bg-muted">
                        <Plus className="h-4 w-4 text-muted-foreground" />
                    </button>
                </div>
                <div className="p-2">
                    {loadingProfiles ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> : profiles.map(profile => (
                        <div 
                            key={profile.id}
                            className={`group flex cursor-pointer items-center justify-between rounded-md p-3 text-sm ${
                                activeProfileId === profile.id 
                                ? 'bg-primary text-primary-foreground shadow-sm' 
                                : 'text-foreground hover:bg-muted'
                            }`}
                            onClick={() => setSelectedProfileId(profile.id)}
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="truncate">{profile.name}</span>
                            </div>
                            <button
                                onClick={(e) => handleDeleteProfileClick(profile, e)}
                                className="ml-2 rounded p-1 text-muted-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive hover:opacity-100 group-hover:opacity-100"
                                title="Delete Profile"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>


            {/* Editor Area */}
            {activeProfileId ? (
                <ProfileEditorBody
                    key={scheduleKey}
                    selectedProfileId={activeProfileId}
                    initialProfileName={selectedProfileName}
                    initialSchedule={expandedSchedule}
                    audioFiles={audioFiles}
                    selectedDay={selectedDay}
                    setSelectedDay={setSelectedDay}
                    days={days}
                    queryClient={queryClient}
                    schoolId={schoolId}
                />
            ) : (
                <div className="flex-1 min-w-0 rounded-lg border bg-card text-muted-foreground shadow-sm p-6 text-sm">
                    Create a profile to begin editing bell times.
                </div>
            )}

            {/* Modals */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-lg bg-card text-foreground p-6 shadow-lg">
                        <h3 className="mb-4 text-lg font-bold text-foreground">Create New Profile</h3>
                        <input
                            type="text"
                            value={createProfileName}
                            onChange={(e) => setCreateProfileName(e.target.value)}
                            placeholder="Enter profile name"
                            className="w-full rounded-md border border-input bg-background text-foreground p-2 mb-4"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="rounded-md px-4 py-2 text-muted-foreground hover:bg-muted"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmCreateProfile}
                                disabled={!createProfileName.trim()}
                                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {profileToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-lg bg-card text-foreground p-6 shadow-lg">
                        <h3 className="mb-4 text-lg font-bold text-foreground">Delete Profile</h3>
                        <div className="mb-6 text-muted-foreground">
                            {profileToDelete.is_active ? (
                                <>
                                    <p className="font-medium text-destructive dark:text-red-400 mb-2">Warning: Active Profile</p>
                                    <p>"{profileToDelete.name}" is currently the ACTIVE profile.</p>
                                    <p className="mt-2">Deleting it will leave the system without an active schedule.</p>
                                    <p className="mt-2 font-medium">Are you sure you want to delete it?</p>
                                </>
                            ) : (
                                <p>Are you sure you want to delete profile "{profileToDelete.name}"?</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setProfileToDelete(null)}
                                className="rounded-md px-4 py-2 text-muted-foreground hover:bg-muted"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteProfile}
                                className="rounded-md bg-destructive px-4 py-2 text-destructive-foreground hover:bg-destructive/90"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function ProfileEditorBody({
    selectedProfileId,
    initialProfileName,
    initialSchedule,
    audioFiles,
    selectedDay,
    setSelectedDay,
    days,
    queryClient,
    schoolId
}: ProfileEditorBodyProps) {
    const [localSchedule, setLocalSchedule] = useState<ScheduleItem[]>(initialSchedule)
    const [localProfileName, setLocalProfileName] = useState(initialProfileName)
    
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
    const [isDirty, setIsDirty] = useState(false)
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
    const [activeTab, setActiveTab] = useState<'bells' | 'announcements'>('bells')
    
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
    const [renameInput, setRenameInput] = useState('')

    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false)
    const [selectedTargetDays, setSelectedTargetDays] = useState<number[]>([])
    const [copyBells, setCopyBells] = useState(true)
    const [copyAnnouncements, setCopyAnnouncements] = useState(true)

    const clashesMap = useMemo(() => {
        return detectClashes(localSchedule)
    }, [localSchedule])

    const renameMutation = useMutation({
        mutationFn: async (newName: string) => {
            const { error } = await supabase
                .from('bell_profiles')
                .update({ name: newName })
                .eq('id', selectedProfileId)
            
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profiles'] })
        },
        onError: (error) => {
            console.error('Rename failed:', error)
            setNotification({ type: 'error', message: 'Failed to rename profile' })
            setTimeout(() => setNotification(null), 3000)
            // Revert local name if failed?
            setLocalProfileName(initialProfileName) 
        }
    })

    const saveMutation = useMutation({
        mutationFn: async () => {
            const invalidTtsItem = localSchedule.find(item => {
                if (item.play_type !== 'tts') return false
                const hasAudio = !!item.audio_file_id
                const hasText = !!(item.tts_message && item.tts_message.trim().length > 0)
                return !hasAudio && !hasText
            })

            if (invalidTtsItem) {
                throw new Error(`For Text-to-Speech entries, select an audio file or enter text. (Check item at ${invalidTtsItem.bell_time})`)
            }

            const clashes = detectClashes(localSchedule)
            if (clashes.size > 0) {
                throw new Error('Scheduling conflicts detected. Please adjust the highlighted times before saving.')
            }

            const { error: profileError } = await supabase
                .from('bell_profiles')
                .update({
                    name: localProfileName
                })
                .eq('id', selectedProfileId)

            if (profileError) throw profileError
            
            const { error: deleteError } = await supabase
                .from('bell_times')
                .delete()
                .eq('profile_id', selectedProfileId)
            
            if (deleteError) throw deleteError

            // Group items by time + audio to optimize storage (combine days)
            const grouped = new Map<string, { 
                bell_time: string, 
                audio_file_id: string | null, 
                audio_file_id_2: string | null,
                delay_seconds: number,
                play_type: 'mp3' | 'tts',
                tts_message: string | null,
                label: string | null,
                include_weather: boolean,
                tts_gender: 'male' | 'female' | null,
                tts_language: 'en' | 'ur' | 'ar' | null,
                days: Set<number> 
            }>();

            localSchedule.forEach(item => {
                // Convert display time (12h AM/PM) to database format (24h)
                const dbTime = formatTimeForDatabase(item.bell_time);
                const key = `${dbTime}-${item.audio_file_id ?? 'null'}-${item.audio_file_id_2 ?? 'null'}-${item.delay_seconds}-${item.play_type}-${item.tts_message ?? 'null'}-${item.label ?? 'null'}-${item.include_weather ? 'true' : 'false'}-${item.tts_gender ?? 'null'}-${item.tts_language ?? 'default'}`;
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
                    });
                }
                grouped.get(key)!.days.add(item.day_of_week);
            });

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
                // Fix Day Mapping: Map Index 0 (Sun) to 7, 1 (Mon) to 1, etc.
                // UI (0=Sun) -> DB (7=Sun)
                day_of_week: Array.from(g.days).map(d => d === 0 ? 7 : d).sort((a, b) => a - b),
                profile_id: selectedProfileId
            }));

            if (itemsToInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('bell_times')
                    .insert(itemsToInsert)
                
                if (insertError) throw insertError
            }

            // Automatically sync with all devices in the school
            if (schoolId) {
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

                const { data: devices } = await supabase
                    .from('bell_devices')
                    .select('id')
                    .eq('school_id', schoolId)

                if (devices && devices.length > 0) {
                    const commands = devices.map(d => ({
                        device_id: d.id,
                        command: 'SYNC_SCHEDULES',
                        payload: { source: 'profile_save', profile_id: selectedProfileId }
                    }))

                    const { error: cmdError } = await supabase
                        .from('command_queue')
                        .insert(commands)

                    if (cmdError) {
                        console.error("Failed to queue sync commands:", cmdError)
                    }
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schedule', selectedProfileId] })
            queryClient.invalidateQueries({ queryKey: ['profiles'] })
            setIsDirty(false)
            setNotification({ type: 'success', message: 'Profile saved and devices syncing...' })
            setTimeout(() => setNotification(null), 3000)
        },
        onError: (error) => {
            console.error('Save failed:', error)
            setNotification({ type: 'error', message: `Failed to save profile: ${error.message}` })
            setTimeout(() => setNotification(null), 3000)
        }
    })

    const handleUpdateItem = <K extends keyof ScheduleItem>(id: string, field: K, value: ScheduleItem[K]) => {
        setLocalSchedule(prev => prev.map(item => 
            item.id === id ? { ...item, [field]: value } : item
        ))
        setIsDirty(true)
    }

    const handleDeleteItem = (id: string) => {
        setLocalSchedule(prev => prev.filter(item => item.id !== id))
        setIsDirty(true)
    }

    const handleAddItem = () => {
        const newItem: ScheduleItem = {
            id: `temp-${Date.now()}`,
            bell_time: '08:00 AM',
            audio_file_id: activeTab === 'bells' ? (audioFiles[0]?.id ?? null) : null,
            audio_file_id_2: null,
            delay_seconds: 0,
            day_of_week: selectedDay,
            play_type: activeTab === 'bells' ? 'mp3' : 'tts',
            tts_message: null,
            label: null,
            include_weather: false,
            tts_gender: null,
            tts_language: null
        }
        setLocalSchedule(prev => [...prev, newItem])
        setIsDirty(true)
    }

    const handleRenameClick = () => {
        setRenameInput(localProfileName)
        setIsRenameModalOpen(true)
    }

    const confirmRename = () => {
        const newName = renameInput.trim()
        if (newName && newName.length > 0 && newName !== localProfileName) {
            setLocalProfileName(newName)
            renameMutation.mutate(newName)
        }
        setIsRenameModalOpen(false)
    }

    const handleCopyScheduleConfirm = () => {
        const nextSchedule = localSchedule.filter(item => {
            if (selectedTargetDays.includes(item.day_of_week)) {
                if (item.play_type === 'mp3' && copyBells) return false;
                if (item.play_type === 'tts' && copyAnnouncements) return false;
            }
            return true;
        });

        const sourceItems = localSchedule.filter(item => {
            if (item.day_of_week === selectedDay) {
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
        setNotification({ type: 'success', message: `Copied schedule to target days. Click 'Save Changes' to save.` });
        setTimeout(() => setNotification(null), 4000);
    };

    return (
        <div className="flex-1 min-w-0 rounded-lg border bg-card text-foreground shadow-sm p-6">
            {notification && (
                <div className={`mb-4 p-4 rounded-md ${notification.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-destructive/10 text-destructive dark:text-red-400 border border-destructive/20'}`}>
                    {notification.message}
                </div>
            )}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-foreground">
                        {localProfileName}
                    </h2>
                    <p className="text-sm text-muted-foreground">Manage bell timings for this profile</p>
                </div>
                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                    <button 
                        onClick={handleRenameClick}
                        className="flex items-center rounded-md bg-background border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                        <Edit2 className="mr-2 h-4 w-4" /> Rename
                    </button>
                    <button 
                        onClick={() => saveMutation.mutate()}
                        disabled={!isDirty || saveMutation.isPending}
                        className="flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
            
            {/* Rename Modal */}
            {isRenameModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-lg bg-card text-foreground p-6 shadow-lg">
                        <h3 className="mb-4 text-lg font-bold text-foreground">Rename Profile</h3>
                        <input
                            type="text"
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            placeholder="Enter new profile name"
                            className="w-full rounded-md border border-input bg-background text-foreground p-2 mb-4"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setIsRenameModalOpen(false)}
                                className="rounded-md px-4 py-2 text-muted-foreground hover:bg-muted"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRename}
                                disabled={!renameInput.trim() || renameInput.trim() === localProfileName}
                                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
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
                        <div className="flex items-center gap-2 mb-2 text-blue-600">
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
                                    className="text-xs text-blue-600 hover:underline font-medium"
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
                                                    ? 'border-blue-600/50 bg-blue-600/5 text-blue-600 font-medium dark:text-blue-400'
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
                                                className="rounded border-input text-blue-600 focus:ring-blue-500 h-4 w-4"
                                            />
                                            <span>{day}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Options Selection */}
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
                                        className="rounded border-input text-blue-600 focus:ring-blue-500 h-4 w-4"
                                    />
                                    <span>🔔 Period Bells</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={copyAnnouncements}
                                        onChange={(e) => setCopyAnnouncements(e.target.checked)}
                                        className="rounded border-input text-blue-600 focus:ring-blue-500 h-4 w-4"
                                    />
                                    <span>📢 Announcements</span>
                                </label>
                            </div>
                        </div>

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
                                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCopyScheduleConfirm}
                                disabled={selectedTargetDays.length === 0 || (!copyBells && !copyAnnouncements)}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                Copy & Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Period Bells vs Announcements tabs */}
            <div className="mb-6 border-b border-border">
                <nav className="-mb-px flex space-x-6">
                    <button
                        onClick={() => setActiveTab('bells')}
                        className={`whitespace-nowrap border-b-2 pb-3 px-1 text-sm font-semibold flex items-center gap-2 ${
                            activeTab === 'bells'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                        }`}
                    >
                        <span>🔔</span> Period Bells
                    </button>
                    <button
                        onClick={() => setActiveTab('announcements')}
                        className={`whitespace-nowrap border-b-2 pb-3 px-1 text-sm font-semibold flex items-center gap-2 ${
                            activeTab === 'announcements'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                        }`}
                    >
                        <span>📢</span> Announcements
                    </button>
                </nav>
            </div>

            <div className="mb-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <nav className="-mb-px flex space-x-8 overflow-x-auto">
                    {days.map((day, index) => (
                        <button
                            key={day}
                            onClick={() => setSelectedDay(index)}
                            className={`whitespace-nowrap border-b-2 pb-4 px-1 text-sm font-medium ${
                                selectedDay === index
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                            }`}
                        >
                            {day}
                        </button>
                    ))}
                </nav>
                <button
                    onClick={() => {
                        setSelectedTargetDays([]);
                        setIsCopyModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted text-foreground transition-colors shrink-0 mb-2"
                >
                    <Copy className="h-3.5 w-3.5" /> Copy Schedule
                </button>
            </div>

            <div className="space-y-4">
                 {localSchedule
                     .filter(s => s.day_of_week === selectedDay && s.play_type === (activeTab === 'bells' ? 'mp3' : 'tts'))
                     .map((item) => (
                         <TimeSlotRow 
                            key={item.id}
                            item={item}
                            audioFiles={audioFiles}
                            handleUpdateItem={handleUpdateItem}
                            handleDeleteItem={handleDeleteItem}
                            clashMessage={clashesMap.get(item.id)}
                            defaultTtsLanguage={schoolSettings?.default_tts_language || 'en'}
                         />
                     ))
                 }
                 
                 <button 
                    onClick={handleAddItem}
                    className="flex w-full items-center justify-center rounded-md border-2 border-dashed border-input p-4 text-sm text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                >
                     <Plus className="mr-2 h-4 w-4" /> Add {activeTab === 'bells' ? 'Bell Time' : 'Announcement'}
                 </button>
            </div>
        </div>
    )
}

function parseTimeToMinutes(timeStr: string): number {
    const { h, m, ampm } = parseAmPmParts(timeStr)
    let hours = h
    if (ampm === 'PM' && hours !== 12) hours += 12
    if (ampm === 'AM' && hours === 12) hours = 0
    return hours * 60 + m
}

function detectClashes(schedule: ScheduleItem[], thresholdMinutes: number = 2): Map<string, string> {
    const clashesMap = new Map<string, string>()
    
    for (let i = 0; i < schedule.length; i++) {
        for (let j = i + 1; j < schedule.length; j++) {
            const itemA = schedule[i]
            const itemB = schedule[j]
            
            if (itemA.day_of_week === itemB.day_of_week) {
                const minA = parseTimeToMinutes(itemA.bell_time)
                const minB = parseTimeToMinutes(itemB.bell_time)
                
                if (Math.abs(minA - minB) < thresholdMinutes) {
                    let msgA = ''
                    let msgB = ''
                    if (itemA.play_type === itemB.play_type) {
                        const typeStr = itemA.play_type === 'mp3' ? 'bell' : 'announcement'
                        msgA = `Clashes with another ${typeStr} at ${itemB.bell_time}`
                        msgB = `Clashes with another ${typeStr} at ${itemA.bell_time}`
                    } else {
                        const typeA = itemA.play_type === 'mp3' ? 'bell' : 'announcement'
                        const typeB = itemB.play_type === 'mp3' ? 'bell' : 'announcement'
                        msgA = `Clashes with ${typeB} at ${itemB.bell_time}`
                        msgB = `Clashes with ${typeA} at ${itemA.bell_time}`
                    }
                    
                    if (!clashesMap.has(itemA.id)) clashesMap.set(itemA.id, msgA)
                    if (!clashesMap.has(itemB.id)) clashesMap.set(itemB.id, msgB)
                }
            }
        }
    }
    
    return clashesMap
}
