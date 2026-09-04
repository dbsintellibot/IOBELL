export type BellProfile = {
    id: string
    name: string
    is_active: boolean
}

export type BellTimeRow = {
    id: string
    bell_time: string
    audio_file_id: string | null
    audio_file_id_2: string | null
    delay_seconds: number
    day_of_week: number[] | null
    play_type: 'mp3' | 'tts'
    tts_message: string | null
    label: string | null
    include_weather: boolean
    tts_gender: 'male' | 'female' | null
    tts_language: 'en' | 'ur' | 'ar' | null
}

export type ScheduleItem = {
    id: string
    bell_time: string
    audio_file_id: string | null
    audio_file_id_2: string | null
    delay_seconds: number
    day_of_week: number
    play_type: 'mp3' | 'tts'
    tts_message: string | null
    label: string | null
    include_weather: boolean
    tts_gender: 'male' | 'female' | null
    tts_language: 'en' | 'ur' | 'ar' | null
}

export type AudioFileItem = {
    id: string
    name: string
}
