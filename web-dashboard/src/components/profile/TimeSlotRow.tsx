import { useState } from 'react'
import { parseAmPmParts } from '@/lib/timeFormat'
import { translateText } from '@/lib/translate'
import { Trash2, Languages } from 'lucide-react'
import type { ScheduleItem, AudioFileItem } from '@/types/profile'

interface TimeSlotRowProps {
    item: ScheduleItem
    audioFiles: AudioFileItem[]
    handleUpdateItem: <K extends keyof ScheduleItem>(id: string, field: K, value: ScheduleItem[K]) => void
    handleDeleteItem: (id: string) => void
    clashMessage?: string
    defaultTtsLanguage?: 'en' | 'ur' | 'ar'
    boardType?: 'ESP32-S3 N16R8' | 'ESP32-C3 Mini'
}

export function TimeSlotRow({ item, audioFiles, handleUpdateItem, handleDeleteItem, clashMessage, defaultTtsLanguage = 'en', boardType = 'ESP32-S3 N16R8' }: TimeSlotRowProps) {
    const [isTranslating, setIsTranslating] = useState(false)
    const resolvedLang = item.tts_language || defaultTtsLanguage
    
    return (
        <div className={`flex flex-col gap-2 rounded-md border p-4 hover:bg-muted transition-colors ${
            clashMessage 
                ? 'border-destructive/50 bg-destructive/5 hover:bg-destructive/10' 
                : 'border-border'
        }`}>
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
                    {boardType === 'ESP32-C3 Mini' ? (
                        <div className="flex flex-col gap-2">
                            <div className="text-xs text-primary font-medium p-2 rounded bg-primary/5 border border-primary/10 mb-1 select-none">
                                ℹ️ Mini variant: Triggers the physical gong relay at this scheduled time.
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-16 shrink-0">Duration:</span>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="number"
                                        min={1}
                                        max={60}
                                        value={item.delay_seconds || 5}
                                        onChange={(e) => {
                                            let val = parseInt(e.target.value) || 5;
                                            if (val < 1) val = 1;
                                            if (val > 60) val = 60;
                                            handleUpdateItem(item.id, 'delay_seconds', val);
                                        }}
                                        className="w-16 rounded border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary text-xs px-2 py-0.5 border"
                                    />
                                    <span className="text-xs text-muted-foreground">seconds</span>
                                </div>
                            </div>
                        </div>
                    ) : item.play_type === 'tts' ? (
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
                            {item.audio_file_id === null && (
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground w-16 shrink-0 font-medium">Voice:</span>
                                        <select
                                            value={item.tts_gender ?? 'default'}
                                            onChange={(e) => {
                                                const val = e.target.value
                                                handleUpdateItem(
                                                    item.id,
                                                    'tts_gender',
                                                    val === 'default' ? null : (val as 'male' | 'female')
                                                )
                                            }}
                                            className="rounded border border-input bg-background text-foreground text-xs py-1 pl-2 pr-8 shadow-sm focus:border-primary focus:ring-primary cursor-pointer"
                                        >
                                            <option value="default">School Default</option>
                                            <option value="female">Female Voice</option>
                                            <option value="male">Male Voice</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground shrink-0 font-medium">Language:</span>
                                        <select
                                            value={item.tts_language ?? 'default'}
                                            onChange={(e) => {
                                                const val = e.target.value
                                                handleUpdateItem(
                                                    item.id,
                                                    'tts_language',
                                                    val === 'default' ? null : (val as 'en' | 'ur' | 'ar')
                                                )
                                            }}
                                            className="rounded border border-input bg-background text-foreground text-xs py-1 pl-2 pr-8 shadow-sm focus:border-primary focus:ring-primary cursor-pointer"
                                        >
                                            <option value="default">School Default ({defaultTtsLanguage === 'ur' ? 'Urdu' : defaultTtsLanguage === 'ar' ? 'Arabic' : 'English'})</option>
                                            <option value="en">English</option>
                                            <option value="ur">Urdu</option>
                                            <option value="ar">Arabic</option>
                                        </select>
                                    </div>
                                    {(resolvedLang === 'ur' || resolvedLang === 'ar') && item.tts_message?.trim() && (
                                        <button
                                            type="button"
                                            disabled={isTranslating}
                                            onClick={async () => {
                                                setIsTranslating(true)
                                                try {
                                                    const translated = await translateText(item.tts_message || '', resolvedLang)
                                                    handleUpdateItem(item.id, 'tts_message', translated)
                                                } catch (err) {
                                                    console.error('Translation error:', err)
                                                } finally {
                                                    setIsTranslating(false)
                                                }
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                        >
                                            <Languages className="h-3 w-3" />
                                            {isTranslating ? 'Translating...' : `Translate to ${resolvedLang === 'ur' ? 'Urdu' : 'Arabic'}`}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-16">Audio:</span>
                            <select
                                value={item.audio_file_id ?? ''}
                                onChange={(e) => {
                                    handleUpdateItem(item.id, 'audio_file_id', e.target.value || null);
                                    if (item.audio_file_id_2 !== null) {
                                        handleUpdateItem(item.id, 'audio_file_id_2', null);
                                    }
                                    if (item.delay_seconds !== 0) {
                                        handleUpdateItem(item.id, 'delay_seconds', 0);
                                    }
                                }}
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
                    )}

                    {/* Label Field */}
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">Label:</span>
                        <input
                            type="text"
                            value={item.label ?? ''}
                            onChange={(e) => handleUpdateItem(item.id, 'label', e.target.value || null)}
                            placeholder="e.g. Period 1, Recess, Assembly..."
                            className="min-w-0 flex-1 rounded border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary text-xs px-2 py-0.5 border"
                            maxLength={30}
                        />
                    </div>

                    {/* Predefined Templates for Announcements */}
                    {boardType !== 'ESP32-C3 Mini' && item.play_type === 'tts' && (
                        <div className="flex flex-col gap-2 mt-1 border-t border-dashed pt-2">
                            {/* Predefined templates selector */}
                            {item.audio_file_id === null && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground shrink-0">Use Template:</span>
                                    <select
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                handleUpdateItem(item.id, 'tts_message', e.target.value);
                                                e.target.value = ''; // reset dropdown
                                            }
                                        }}
                                        className="text-[10px] border border-input rounded bg-background text-foreground py-0.5 px-1 cursor-pointer min-w-0 flex-1"
                                    >
                                        <option value="">-- Select a Quick School Template --</option>
                                        <option value="Attention all students and teachers, the morning assembly is about to begin. Please proceed to the assembly ground immediately.">Morning Assembly Warning</option>
                                        <option value="The first period is starting now. Teachers, please check attendance. Students, please open your books.">First Period Start</option>
                                        <option value="It is now recess time. Please leave the classrooms in an orderly fashion and enjoy your break.">Recess Start</option>
                                        <option value="The recess period has ended. All students must return to their classrooms immediately. Silence in the corridors.">Recess End</option>
                                        <option value="It is lunch time. Please wash your hands before eating and maintain silence in the dining area.">Lunch Time Start</option>
                                        <option value="School is closed for the day. Please pack your bags and exit the building quietly. Have a safe journey home.">Dispersal / End of School</option>
                                        <option value="The examination is about to begin. No communication is allowed. Good luck to everyone.">Exam Commencement</option>
                                        <option value="Attention! This is an emergency evacuation drill. Please walk to the nearest assembly point immediately.">Emergency Evacuation Drill</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {clashMessage && (
                        <div className="text-xs text-destructive font-medium mt-1 flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                            {clashMessage}
                        </div>
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
    )
}
