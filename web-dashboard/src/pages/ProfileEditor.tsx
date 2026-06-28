import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, Save, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

type BellProfile = {
    id: string
    name: string
    is_active: boolean
}

type BellTimeRow = {
    id: string
    bell_time: string
    audio_file_id: string | null
    audio_file_id_2: string | null
    delay_seconds: number
    day_of_week: number[] | null
    play_type: 'mp3' | 'tts'
    tts_message: string | null
}

type ScheduleItem = {
    id: string
    bell_time: string
    audio_file_id: string | null
    audio_file_id_2: string | null
    delay_seconds: number
    day_of_week: number
    play_type: 'mp3' | 'tts'
    tts_message: string | null
}

type AudioFileItem = {
    id: string
    name: string
}

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

    const toggleActiveMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('bell_profiles').update({ is_active: true }).eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profiles'] })
        }
    })

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
                .select('id, bell_time, day_of_week, audio_file_id, audio_file_id_2, delay_seconds, play_type, tts_message')
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
                    tts_message: item.tts_message ?? null
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
                tts_message: item.tts_message ?? null
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
            .map(item => `${item.id}-${item.bell_time}-${item.audio_file_id ?? ''}-${item.audio_file_id_2 ?? ''}-${item.delay_seconds}-${item.day_of_week}-${item.play_type}-${item.tts_message ?? ''}`)
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
                                ? 'bg-primary/10 text-primary' 
                                : 'text-foreground hover:bg-muted'
                            }`}
                            onClick={() => setSelectedProfileId(profile.id)}
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <input
                                    type="radio"
                                    name="activeProfile"
                                    checked={profile.is_active}
                                    onChange={(e) => {
                                        e.stopPropagation()
                                        toggleActiveMutation.mutate(profile.id)
                                    }}
                                    className="h-4 w-4 flex-shrink-0 text-primary bg-background focus:ring-primary cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <span className="truncate">{profile.name}</span>
                                {profile.is_active && <span className="ml-1 flex-shrink-0 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">ACTIVE</span>}
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
    const [isDirty, setIsDirty] = useState(false)
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
    
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
    const [renameInput, setRenameInput] = useState('')

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
                days: Set<number> 
            }>();

            localSchedule.forEach(item => {
                // Convert display time (12h AM/PM) to database format (24h)
                const dbTime = formatTimeForDatabase(item.bell_time);
                const key = `${dbTime}-${item.audio_file_id ?? 'null'}-${item.audio_file_id_2 ?? 'null'}-${item.delay_seconds}-${item.play_type}-${item.tts_message ?? 'null'}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        bell_time: dbTime,
                        audio_file_id: item.audio_file_id,
                        audio_file_id_2: item.audio_file_id_2,
                        delay_seconds: item.delay_seconds,
                        play_type: item.play_type,
                        tts_message: item.tts_message,
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
                const { data: devices } = await supabase
                    .from('bell_devices')
                    .select('id')
                    .eq('school_id', schoolId)

                if (devices && devices.length > 0) {
                    const commands = devices.map(d => ({
                        device_id: d.id,
                        school_id: schoolId,
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
            audio_file_id: audioFiles[0]?.id ?? null,
            audio_file_id_2: null,
            delay_seconds: 0,
            day_of_week: selectedDay,
            play_type: 'mp3',
            tts_message: null
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

            <div className="mb-6 border-b border-border">
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
            </div>

            <div className="space-y-4">
                 {localSchedule.filter(s => s.day_of_week === selectedDay).map((item) => (
                     <div key={item.id} className="flex flex-col gap-2 rounded-md border p-4 hover:bg-muted">
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                            <div className="flex flex-wrap items-center gap-1 shrink-0">
                                <select
                                    value={parseAmPmParts(item.bell_time).h}
                                    onChange={(e) => {
                                        const { m, ampm } = parseAmPmParts(item.bell_time);
                                        const newH = parseInt(e.target.value);
                                        handleUpdateItem(item.id, 'bell_time', `${newH}:${String(m).padStart(2, '0')} ${ampm}`);
                                    }}
                                    className="rounded border-input bg-background text-foreground text-sm py-1 pl-2 pr-6"
                                >
                                    {Array.from({length: 12}, (_, i) => i + 1).map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                                <span className="text-muted-foreground">:</span>
                                <select
                                    value={parseAmPmParts(item.bell_time).m}
                                    onChange={(e) => {
                                        const { h, ampm } = parseAmPmParts(item.bell_time);
                                        const newM = parseInt(e.target.value);
                                        handleUpdateItem(item.id, 'bell_time', `${h}:${String(newM).padStart(2, '0')} ${ampm}`);
                                    }}
                                    className="rounded border-input bg-background text-foreground text-sm py-1 pl-2 pr-6"
                                >
                                    {Array.from({length: 60}, (_, i) => i).map(m => (
                                        <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                                    ))}
                                </select>
                                <select
                                    value={parseAmPmParts(item.bell_time).ampm}
                                    onChange={(e) => {
                                        const { h, m } = parseAmPmParts(item.bell_time);
                                        const newAmpm = e.target.value;
                                        handleUpdateItem(item.id, 'bell_time', `${h}:${String(m).padStart(2, '0')} ${newAmpm}`);
                                    }}
                                    className="rounded border-input bg-background text-foreground text-sm py-1 pl-2 pr-6"
                                >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                </select>
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col gap-2">
                                <div className="flex flex-wrap items-center gap-4 mb-1">
                                    <label className="flex items-center gap-2 text-xs text-foreground font-medium">
                                        <input
                                            type="radio"
                                            name={`playType-${item.id}`}
                                            value="mp3"
                                            checked={item.play_type !== 'tts'}
                                            onChange={() => handleUpdateItem(item.id, 'play_type', 'mp3')}
                                            className="h-3 w-3 text-primary bg-background focus:ring-primary"
                                        />
                                        MP3 Audio
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-foreground font-medium">
                                        <input
                                            type="radio"
                                            name={`playType-${item.id}`}
                                            value="tts"
                                            checked={item.play_type === 'tts'}
                                            onChange={() => {
                                                handleUpdateItem(item.id, 'play_type', 'tts')
                                                handleUpdateItem(item.id, 'audio_file_id', null)
                                            }}
                                            className="h-3 w-3 text-primary bg-background focus:ring-primary"
                                        />
                                        Text-to-Speech
                                    </label>
                                </div>

                                {item.play_type === 'tts' ? (
                                    <div className="flex flex-col gap-2 w-full">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground w-16 shrink-0">Audio:</span>
                                            <select
                                                value={item.audio_file_id ?? 'none'}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    const nextAudio = val === 'none' ? null : val
                                                    handleUpdateItem(
                                                        item.id,
                                                        'audio_file_id',
                                                        nextAudio
                                                    )
                                                    if (nextAudio !== null) {
                                                        handleUpdateItem(item.id, 'tts_message', null)
                                                    }
                                                }}
                                                className="min-w-0 flex-1 text-sm border-none bg-background text-foreground py-0 pl-2 pr-8 focus:ring-0"
                                            >
                                                <option value="none">None (custom text)</option>
                                                {audioFiles.map((file) => (
                                                    <option
                                                        key={`tts-${file.id}`}
                                                        value={file.id}
                                                    >
                                                        {file.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground w-16 shrink-0">Message:</span>
                                            <input
                                                type="text"
                                                value={item.tts_message ?? ''}
                                                onChange={(e) => handleUpdateItem(item.id, 'tts_message', e.target.value)}
                                                placeholder="Enter text to speak..."
                                                className="min-w-0 flex-1 rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm px-3 py-1 border"
                                                maxLength={100}
                                                disabled={item.audio_file_id !== null}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground w-16">Audio 1:</span>
                                            <select
                                                value={item.audio_file_id ?? ''}
                                                onChange={(e) => handleUpdateItem(item.id, 'audio_file_id', e.target.value || null)}
                                                className="min-w-0 flex-1 text-sm border-none bg-background text-foreground py-0 pl-2 pr-8 focus:ring-0"
                                            >
                                                <option value="">Select Audio...</option>
                                                {audioFiles.map((file) => (
                                                    <option
                                                        key={file.id}
                                                        value={file.id}
                                                    >
                                                        {file.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {item.audio_file_id_2 && (
                                            <div className="flex flex-wrap items-center gap-2 sm:ml-4">
                                                <span className="text-sm text-muted-foreground">Delay:</span>
                                                <select
                                                    value={item.delay_seconds}
                                                    onChange={(e) => handleUpdateItem(item.id, 'delay_seconds', parseInt(e.target.value))}
                                                    className="text-sm border-none bg-background text-foreground py-0 pl-2 pr-8 focus:ring-0"
                                                >
                                                    {Array.from({length: 31}, (_, i) => i).map(s => (
                                                        <option key={s} value={s}>{s}s</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground w-16">Audio 2:</span>
                                            <select
                                                value={item.audio_file_id_2 ?? ''}
                                                onChange={(e) => handleUpdateItem(item.id, 'audio_file_id_2', e.target.value || null)}
                                                className="min-w-0 flex-1 text-sm border-none bg-background text-foreground py-0 pl-2 pr-8 focus:ring-0"
                                            >
                                                <option value="">None</option>
                                                {audioFiles.map((file) => (
                                                    <option
                                                        key={`2-${file.id}`}
                                                        value={file.id}
                                                    >
                                                        {file.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>
                            <button 
                                onClick={() => handleDeleteItem(item.id)}
                                className="text-destructive hover:text-destructive/80 self-start sm:self-center"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                     </div>
                 ))}
                 
                 <button 
                    onClick={handleAddItem}
                    className="flex w-full items-center justify-center rounded-md border-2 border-dashed border-input p-4 text-sm text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                >
                     <Plus className="mr-2 h-4 w-4" /> Add Bell Time
                 </button>
            </div>
        </div>
    )
}
