-- Fix get_device_config to include track_number for ESP32 schedule parsing
-- Issue: ESP32 was defaulting to track 1 because track_number was missing from the response.

CREATE OR REPLACE FUNCTION public.get_device_config(device_mac text)
RETURNS json AS $$
DECLARE
    v_device_id uuid;
    v_school_id uuid;
    v_schedule_data json;
    v_timezone_offset integer := 300; -- Default to GMT+5 (300 minutes)
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
    -- Find active profile or fallback
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
                bt.bell_time::text, -- Convert time to text for JSON
                bt.day_of_week,
                -- Also provide 'days_of_week' alias if device expects plural
                bt.day_of_week as days_of_week, 
                af.storage_path as audio_url,
                af.duration,
                COALESCE(af.track_number, 1) as track_number -- Ensure it's never null
            FROM public.bell_times bt
            LEFT JOIN public.audio_files af ON bt.audio_file_id = af.id
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
