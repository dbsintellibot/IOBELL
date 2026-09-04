-- Migration to automatically sync precombined schedule bells into public.audio_files table.
-- This allows the ESP32 device to cache them locally in LittleFS instead of streaming over HTTPS.

-- 1. Sync existing precombined schedules to public.audio_files
INSERT INTO public.audio_files (id, name, storage_path, school_id, duration)
SELECT 
    bt.id,
    COALESCE('Combined: ' || LEFT(bt.tts_message, 50), 'Combined Announcement'),
    'combined/s_' || bt.id || '.mp3',
    bp.school_id,
    5
FROM public.bell_times bt
JOIN public.bell_profiles bp ON bt.profile_id = bp.id
WHERE bt.precombined_at IS NOT NULL
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name,
    storage_path = EXCLUDED.storage_path,
    school_id = EXCLUDED.school_id;
