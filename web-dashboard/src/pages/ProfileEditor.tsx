import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Save, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Types would normally be in a types file
type BellProfile = {
    id: string
    name: string
    is_active: boolean
}

type ScheduleItem = {
    id: string
    time: string
    name: string
    audio_file: string
    day_of_week: number // 0-6 or 1-7
    profile_id?: string
}

export default function ProfileEditor() {
    const queryClient = useQueryClient()
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const [selectedDay, setSelectedDay] = useState(0)
    const [localSchedule, setLocalSchedule] = useState<ScheduleItem[]>([])
    const [localProfileName, setLocalProfileName] = useState('')
    const [isDirty, setIsDirty] = useState(false)

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

    // Fetch Audio Files for dropdown
    const { data: audioFiles = [] } = useQuery({
        queryKey: ['audio_files_list'],
        queryFn: async () => {
            const { data, error } = await supabase.from('audio_files').select('name').order('name')
            if (error) return []
            return data
        }
    })

    // Fetch Schedule for selected profile
    const { data: schedule = [] } = useQuery({
        queryKey: ['schedule', selectedProfileId],
        enabled: !!selectedProfileId,
        queryFn: async () => {
             const { data, error } = await supabase
                .from('bell_schedules')
                .select('*')
                .eq('profile_id', selectedProfileId)
                
             if (error) {
                 return [] as ScheduleItem[]
             }
             return data as ScheduleItem[]
        }
    })
    
    // Sync local state with fetched schedule and profile name
    useEffect(() => {
        if (schedule) {
            setLocalSchedule(JSON.parse(JSON.stringify(schedule))) // Deep copy
        }
        if (selectedProfileId && profiles.length > 0) {
            const profile = profiles.find(p => p.id === selectedProfileId)
            if (profile) {
                setLocalProfileName(profile.name)
            }
        }
        setIsDirty(false)
    }, [schedule, selectedProfileId, profiles])

    // Set selected profile when data loads
    if (profiles.length > 0 && !selectedProfileId) {
        setSelectedProfileId(profiles[0].id)
    }

    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!selectedProfileId) return

            // 1. Upsert Profile
            const { error: profileError } = await supabase
                .from('bell_profiles')
                .upsert({
                    id: selectedProfileId,
                    name: localProfileName,
                    // We preserve other fields if any, but here we assume only name is editable
                    // Ideally we should fetch the full object and merge, but for now name is the main thing.
                    // Note: upsert requires all non-nullable fields if it's an insert, but for update it's fine if partial?
                    // Supabase upsert updates if ID exists.
                })

            if (profileError) throw profileError
            
            // 2. Save Schedule
            // Strategy: Delete all for this profile and insert current localSchedule
            // This is simpler than diffing for now.
            
            const { error: deleteError } = await supabase
                .from('bell_schedules')
                .delete()
                .eq('profile_id', selectedProfileId)
            
            if (deleteError) throw deleteError

            // Prepare items for insertion
            const itemsToInsert = localSchedule.map(item => ({
                time: item.time,
                name: item.name,
                audio_file: item.audio_file,
                day_of_week: item.day_of_week,
                profile_id: selectedProfileId
            }))

            if (itemsToInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('bell_schedules')
                    .insert(itemsToInsert)
                
                if (insertError) throw insertError
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schedule', selectedProfileId] })
            queryClient.invalidateQueries({ queryKey: ['profiles'] }) // Refresh profiles list in case name changed
            setIsDirty(false)
            alert('Profile saved successfully!')
        },
        onError: (error) => {
            console.error('Save failed:', error)
            alert('Failed to save profile')
        }
    })

    const handleUpdateItem = (id: string, field: keyof ScheduleItem, value: any) => {
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
            id: `temp-${Date.now()}`, // Temporary ID
            time: '08:00',
            name: 'New Bell',
            audio_file: audioFiles[0]?.name || '',
            day_of_week: selectedDay,
            profile_id: selectedProfileId || undefined
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
        <div className="flex h-full flex-col gap-6 md:flex-row">
            {/* Profiles Sidebar */}
            <div className="w-full rounded-lg border bg-white shadow-sm md:w-64">
                <div className="flex items-center justify-between border-b p-4">
                    <h3 className="font-medium text-gray-900">Profiles</h3>
                    <button className="rounded p-1 hover:bg-gray-100">
                        <Plus className="h-4 w-4 text-gray-600" />
                    </button>
                </div>
                <div className="p-2">
                    {loadingProfiles ? <div className="p-4 text-sm text-gray-500">Loading...</div> : profiles.map(profile => (
                        <div 
                            key={profile.id}
                            onClick={() => setSelectedProfileId(profile.id)}
                            className={`flex cursor-pointer items-center justify-between rounded-md p-3 text-sm ${
                                selectedProfileId === profile.id 
                                ? 'bg-blue-50 text-blue-700' 
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <span>{profile.name}</span>
                            {profile.is_active && <span className="text-xs text-green-600 font-medium">Active</span>}
                        </div>
                    ))}
                </div>
            </div>


            {/* Editor Area */}
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

                {/* Day Tabs */}
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

                {/* Schedule List */}
                <div className="space-y-4">
                     {localSchedule.filter(s => s.day_of_week === selectedDay).map((item) => (
                         <div key={item.id} className="flex items-center gap-4 rounded-md border p-4 hover:bg-gray-50">
                             <input 
                                type="time" 
                                value={item.time} 
                                onChange={(e) => handleUpdateItem(item.id, 'time', e.target.value)}
                                className="rounded border-gray-300"
                             />
                             <div className="flex-1">
                                 <input 
                                    type="text" 
                                    value={item.name} 
                                    onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                                    className="w-full border-none bg-transparent font-medium focus:ring-0"
                                    placeholder="Bell Name"
                                 />
                                 <div className="flex items-center gap-2 mt-1">
                                     <span className="text-sm text-gray-500">Audio:</span>
                                     <select
                                        value={item.audio_file}
                                        onChange={(e) => handleUpdateItem(item.id, 'audio_file', e.target.value)}
                                        className="text-sm border-none bg-transparent py-0 pl-2 pr-8 focus:ring-0"
                                     >
                                        <option value="">Select Audio...</option>
                                        {audioFiles.map(f => (
                                            <option key={f.name} value={f.name}>{f.name}</option>
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
        </div>
    )
}
