-- Group device schedules by time to optimize JSON payload size
-- Date: 2026-02-13

DROP FUNCTION IF EXISTS public.get_device_config(text);

CREATE OR REPLACE FUNCTION public.get_device_config(device_mac text)
RETURNS json AS $$
DECLARE
    v_device_id uuid;
    v_school_id uuid;
    v_schedule_data json;
    v_profile_name text;
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
        SELECT id, name INTO v_active_profile_id, v_profile_name FROM public.bell_profiles 
        WHERE school_id = v_school_id AND is_active = true LIMIT 1;

        IF v_active_profile_id IS NULL THEN
            SELECT id, name INTO v_active_profile_id, v_profile_name FROM public.bell_profiles 
            WHERE school_id = v_school_id ORDER BY created_at ASC LIMIT 1;
        END IF;

        SELECT json_agg(sched) INTO v_schedule_data FROM (
            SELECT 
                to_char(t.bell_time, 'HH24:MI:SS') as t,
                json_agg(DISTINCT t.d ORDER BY t.d) as d,
                COALESCE(MAX(af1.track_number), 12) as tr,
                COALESCE(MAX(af2.track_number), 0) as tr2,
                COALESCE(MAX(t.delay_seconds), 0) as ds,
                MAX(CASE WHEN t.play_type = 'tts' THEN 'tts' ELSE 'mp3' END) as ty,
                COALESCE(MAX(t.tts_message), '') as tt,
                MAX(af1.storage_path) as audio_url,
                MAX(af1.id)::text as audio_id
            FROM (
                SELECT 
                    bt.bell_time,
                    bt.audio_file_id,
                    bt.audio_file_id_2,
                    bt.delay_seconds,
                    bt.play_type,
                    bt.tts_message,
                    unnest(bt.day_of_week) AS d
                FROM public.bell_times bt
                WHERE bt.profile_id = v_active_profile_id
            ) t
            LEFT JOIN public.audio_files af1 ON t.audio_file_id = af1.id
            LEFT JOIN public.audio_files af2 ON t.audio_file_id_2 = af2.id
            GROUP BY 
                t.bell_time, 
                t.audio_file_id, 
                t.audio_file_id_2, 
                t.play_type, 
                t.tts_message
            ORDER BY t.bell_time
        ) sched;
    END;

    RETURN json_build_object(
        'status', 'ok',
        'school_id', v_school_id,
        'timezone_offset', v_timezone_offset, 
        'profile_name', COALESCE(v_profile_name, 'Unknown'),
        'schedules', coalesce(v_schedule_data, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_device_config(text) TO anon, authenticated, service_role;
