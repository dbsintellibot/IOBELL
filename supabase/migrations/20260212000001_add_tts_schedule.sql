-- Add TTS support to bell_times and update get_device_config
-- Date: 2026-02-12

-- 1. Modify bell_times table
ALTER TABLE public.bell_times 
ADD COLUMN play_type text CHECK (play_type IN ('mp3', 'tts')) DEFAULT 'mp3',
ADD COLUMN tts_message text;

-- 2. Update get_device_config RPC
DROP FUNCTION IF EXISTS public.get_device_config(text);

CREATE OR REPLACE FUNCTION public.get_device_config(device_mac text)
RETURNS json AS $$
DECLARE
    v_device_id uuid;
    v_school_id uuid;
    v_schedule_data json;
    v_timezone_offset integer := 300; -- Default to GMT+5
BEGIN
    -- 1. Find Device and School
    SELECT id, school_id INTO v_device_id, v_school_id 
    FROM public.bell_devices 
    WHERE mac_address = device_mac;
    
    IF v_device_id IS NULL THEN
        RETURN json_build_object('error', 'Device not found');
    END IF;

    -- 2. Update Heartbeat
    UPDATE public.bell_devices 
    SET last_heartbeat = now(), status = 'online'
    WHERE id = v_device_id;

    -- 3. Get Active Schedule
    DECLARE
        v_active_profile_id uuid;
    BEGIN
        SELECT id INTO v_active_profile_id FROM public.bell_profiles 
        WHERE school_id = v_school_id AND is_active = true LIMIT 1;

        IF v_active_profile_id IS NULL THEN
            SELECT id INTO v_active_profile_id FROM public.bell_profiles 
            WHERE school_id = v_school_id ORDER BY created_at ASC LIMIT 1;
        END IF;

        SELECT json_agg(t) INTO v_schedule_data FROM (
            SELECT 
                to_char(bt.bell_time, 'HH24:MI:SS') as bell_time, -- FORCE 24H FORMAT
                bt.day_of_week,
                bt.day_of_week as days_of_week, 
                bt.play_type as type,           -- New field: 'mp3' or 'tts'
                bt.tts_message as tts_text,     -- New field: message for TTS
                af1.storage_path as audio_url,
                af1.duration,
                COALESCE(af1.track_number, 1) as track_number,
                COALESCE(af2.track_number, 0) as track_number_2,
                COALESCE(bt.delay_seconds, 0) as delay_seconds
            FROM public.bell_times bt
            LEFT JOIN public.audio_files af1 ON bt.audio_file_id = af1.id
            LEFT JOIN public.audio_files af2 ON bt.audio_file_id_2 = af2.id
            WHERE bt.profile_id = v_active_profile_id
        ) t;
    END;

    RETURN json_build_object(
        'status', 'ok',
        'school_id', v_school_id,
        'timezone_offset', v_timezone_offset, 
        'schedules', coalesce(v_schedule_data, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_device_config(text) TO anon, authenticated, service_role;
