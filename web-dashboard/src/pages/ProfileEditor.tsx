import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, Save, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
type BellProfile = {
    id: string
    name: string
}

type BellTimeRow = {
    id: string
    bell_time: string
    audio_file_id: string | null
    day_of_week: number[] | null
}

type ScheduleItem = {
    id: string
    bell_time: string
    audio_file_id: string | null
    day_of_week: number
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
}

export default function ProfileEditor() {
    const { schoolId } = useAuth()
    const queryClient = useQueryClient()
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const [selectedDay, setSelectedDay] = useState(new Date().getDay())

    // Fetch Profiles
    const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
        queryKey: ['profiles'],
        queryFn: async () => {
            const { data, error } = await supabase.from('bell_profiles').select('*').order('name')
            if (error) {
                console.warn("Error fetching profiles:", error)
                return []
            }
            return data as BellProfile[]
        }
    })
    const activeProfileId = selectedProfileId ?? profiles[0]?.id ?? null

    // Fetch Audio Files for dropdown
    const { data: audioFiles = [] } = useQuery<AudioFileItem[]>({
        queryKey: ['audio_files_list'],
        queryFn: async () => {
            const { data, error } = await supabase.from('audio_files').select('id, name').order('name')
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
                .select('id, bell_time, day_of_week, audio_file_id')
                .eq('profile_id', activeProfileId)
                .order('bell_time', { ascending: true })
                
             if (error) {
                 return []
             }
             return (data ?? []) as BellTimeRow[]
        }
    })

    const handleCreateProfile = async () => {
        if (!schoolId) {
            alert('No school found for this user.')
            return
        }
        const name = window.prompt('Enter profile name:')
        if (!name) return
        const { data, error } = await supabase
            .from('bell_profiles')
            .insert({
                name,
                school_id: schoolId
            })
            .select('id')
            .single()
        if (error) {
            alert('Failed to create profile')
            return
        }
        if (data?.id) {
            setSelectedProfileId(data.id)
            queryClient.setQueryData<BellProfile[]>(['profiles'], (current) => {
                const next = [...(current ?? []), { id: data.id, name }]
                return next.sort((a, b) => a.name.localeCompare(b.name))
            })
        }
    }
    const expandedSchedule = useMemo<ScheduleItem[]>(() => {
        return schedule.flatMap((item) => {
            const dayValues = Array.isArray(item.day_of_week) ? item.day_of_week : []
            if (dayValues.length === 0) {
                return [{
                    id: item.id,
                    bell_time: item.bell_time,
                    audio_file_id: item.audio_file_id ?? null,
                    day_of_week: 0
                }]
            }
            return dayValues.map((day) => ({
                id: `${item.id}-${day}`,
                bell_time: item.bell_time,
                audio_file_id: item.audio_file_id ?? null,
                day_of_week: day
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
            .map(item => `${item.id}-${item.bell_time}-${item.audio_file_id ?? ''}-${item.day_of_week}`)
            .join('|')
        return `${activeProfileId ?? 'none'}-${scheduleToken}`
    }, [activeProfileId, expandedSchedule])

    return (
        <div className="flex h-full flex-col gap-6 md:flex-row">
            {/* Profiles Sidebar */}
            <div className="w-full rounded-lg border bg-white shadow-sm md:w-64">
                <div className="flex items-center justify-between border-b p-4">
                    <h3 className="font-medium text-gray-900">Profiles</h3>
                    <button onClick={handleCreateProfile} className="rounded p-1 hover:bg-gray-100">
                        <Plus className="h-4 w-4 text-gray-600" />
                    </button>
                </div>
                <div className="p-2">
                    {loadingProfiles ? <div className="p-4 text-sm text-gray-500">Loading...</div> : profiles.map(profile => (
                        <div 
                            key={profile.id}
                            onClick={() => setSelectedProfileId(profile.id)}
                            className={`flex cursor-pointer items-center justify-between rounded-md p-3 text-sm ${
                                activeProfileId === profile.id 
                                ? 'bg-blue-50 text-blue-700' 
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <span>{profile.name}</span>
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
                />
            ) : (
                <div className="flex-1 rounded-lg border bg-white shadow-sm p-6 text-sm text-gray-500">
                    Create a profile to begin editing bell times.
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
    queryClient
}: ProfileEditorBodyProps) {
    const [localSchedule, setLocalSchedule] = useState<ScheduleItem[]>(initialSchedule)
    const [localProfileName, setLocalProfileName] = useState(initialProfileName)
    const [isDirty, setIsDirty] = useState(false)

    const saveMutation = useMutation({
        mutationFn: async () => {
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

            const itemsToInsert = localSchedule.map(item => ({
                bell_time: item.bell_time,
                audio_file_id: item.audio_file_id,
                day_of_week: [item.day_of_week],
                profile_id: selectedProfileId
            }))

            if (itemsToInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('bell_times')
                    .insert(itemsToInsert)
                
                if (insertError) throw insertError
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schedule', selectedProfileId] })
            queryClient.invalidateQueries({ queryKey: ['profiles'] })
            setIsDirty(false)
            alert('Profile saved successfully!')
        },
        onError: (error) => {
            console.error('Save failed:', error)
            alert('Failed to save profile')
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
            bell_time: '08:00',
            audio_file_id: audioFiles[0]?.id ?? null,
            day_of_week: selectedDay
        }
        setLocalSchedule(prev => [...prev, newItem])
        setIsDirty(true)
    }

    const handleRename = () => {
        const newName = window.prompt('Enter new profile name:', localProfileName)
        if (newName && newName !== localProfileName) {
            setLocalProfileName(newName)
            setIsDirty(true)
        }
    }

    return (
        <div className="flex-1 rounded-lg border bg-white shadow-sm p-6">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">
                        {localProfileName}
                    </h2>
                    <p className="text-sm text-gray-500">Manage bell timings for this profile</p>
                </div>
                <div className="flex gap-2">
                     <button 
                        onClick={handleRename}
                        className="flex items-center rounded-md bg-white border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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

            <div className="mb-6 border-b border-gray-200">
                <nav className="-mb-px flex space-x-8 overflow-x-auto">
                    {days.map((day, index) => (
                        <button
                            key={day}
                            onClick={() => setSelectedDay(index)}
                            className={`whitespace-nowrap border-b-2 pb-4 px-1 text-sm font-medium ${
                                selectedDay === index
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                            }`}
                        >
                            {day}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="space-y-4">
                 {localSchedule.filter(s => s.day_of_week === selectedDay).map((item) => (
                     <div key={item.id} className="flex items-center gap-4 rounded-md border p-4 hover:bg-gray-50">
                        <input 
                            type="time" 
                            value={item.bell_time} 
                            onChange={(e) => handleUpdateItem(item.id, 'bell_time', e.target.value)}
                            className="rounded border-gray-300"
                        />
                        <div className="flex-1">
                             <div className="flex items-center gap-2">
                                 <span className="text-sm text-gray-500">Audio:</span>
                                 <select
                                    value={item.audio_file_id ?? ''}
                                    onChange={(e) => handleUpdateItem(item.id, 'audio_file_id', e.target.value || null)}
                                    className="text-sm border-none bg-transparent py-0 pl-2 pr-8 focus:ring-0"
                                 >
                                    <option value="">Select Audio...</option>
                                    {audioFiles.map((file) => (
                                        <option key={file.id} value={file.id}>{file.name}</option>
                                    ))}
                                 </select>
                             </div>
                         </div>
                         <button 
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-red-500 hover:text-red-700"
                         >
                             <Trash2 className="h-4 w-4" />
                         </button>
                     </div>
                 ))}
                 
                 <button 
                    onClick={handleAddItem}
                    className="flex w-full items-center justify-center rounded-md border-2 border-dashed border-gray-300 p-4 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
                >
                     <Plus className="mr-2 h-4 w-4" /> Add Bell Time
                 </button>
            </div>
        </div>
    )
}
