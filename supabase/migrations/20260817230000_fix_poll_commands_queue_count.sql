-- Migration: Fix poll_commands queue count and schools timezone_offset
-- Date: 2026-08-17

-- 1. Alter schools table to add timezone_offset
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS timezone_offset integer DEFAULT 300;

-- 2. Update get_device_config to fetch timezone_offset from schools
CREATE OR REPLACE FUNCTION public.get_device_config(device_mac text)
RETURNS json AS $$
DECLARE
    v_device_id uuid;
    v_school_id uuid;
    v_volume integer;
    v_board_type text;
    v_schedule_data json;
    v_all_audio_data json;
    v_profile_name text;
    v_timezone_offset integer := 300;
    v_quiet_hours json;
    v_pa_enabled boolean := true;
    v_pa_url text := '';
    v_pa_delay integer := 3;
BEGIN
    SELECT id, school_id, volume, board_type INTO v_device_id, v_school_id, v_volume, v_board_type
    FROM public.bell_devices
    WHERE mac_address = device_mac;

    IF v_device_id IS NULL THEN
        RETURN json_build_object('error', 'Device not found');
    END IF;

    UPDATE public.bell_devices
    SET last_heartbeat = now(), status = 'online'
    WHERE id = v_device_id;

    -- Fetch school timezone_offset
    SELECT COALESCE(s.timezone_offset, 300) INTO v_timezone_offset
    FROM public.schools s
    WHERE s.id = v_school_id;

    -- Fetch school quiet hours JSON
    SELECT json_build_object(
      'en', COALESCE(s.quiet_hours_enabled, false),
      'df', to_char(COALESCE(s.quiet_hours_disable_from, '21:00'::time), 'HH24:MI:SS'),
      'ea', to_char(COALESCE(s.quiet_hours_enable_at, '07:00'::time), 'HH24:MI:SS')
    )
    INTO v_quiet_hours
    FROM public.schools s
    WHERE s.id = v_school_id;

    -- Fetch school pre-announcement configuration
    SELECT 
      COALESCE(s.pre_announcement_enabled, true),
      COALESCE(pas.file_url, PasFallback.file_url, ''),
      COALESCE(s.pre_announcement_delay_seconds, 3)
    INTO 
      v_pa_enabled,
      v_pa_url,
      v_pa_delay
    FROM public.schools s
    LEFT JOIN public.pre_announcement_sounds pas ON s.default_pre_announcement_id = pas.id
    LEFT JOIN LATERAL (
        SELECT file_url FROM public.pre_announcement_sounds WHERE is_active = true ORDER BY created_at ASC LIMIT 1
    ) PasFallback ON true
    WHERE s.id = v_school_id;

    -- Fallback: If pre-announcement is enabled but no school-specific sound selected or URL empty, fetch default sound from library
    IF (v_pa_url IS NULL OR v_pa_url = '') THEN
        SELECT COALESCE(file_url, '') INTO v_pa_url
        FROM public.pre_announcement_sounds
        WHERE is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- Fetch all audio files for the school for offline caching
    SELECT json_agg(aud) INTO v_all_audio_data FROM (
        SELECT
            af.id::text as id,
            af.id::text as audio_id,
            COALESCE(REPLACE(public.urlencode(af.storage_path), '%2F', '/'), '') as audio_url,
            COALESCE(af.duration, 0) as duration,
            COALESCE(af.track_number, 1) as track_number
        FROM public.audio_files af
        WHERE af.school_id = v_school_id
        ORDER BY af.created_at ASC
    ) aud;

    DECLARE
        v_active_profile_id uuid;
    BEGIN
        -- Find active profile matching board_type
        SELECT id, name INTO v_active_profile_id, v_profile_name
        FROM public.bell_profiles
        WHERE school_id = v_school_id 
          AND COALESCE(board_type, 'ESP32-S3 N16R8') = COALESCE(v_board_type, 'ESP32-S3 N16R8')
          AND is_active = true
        LIMIT 1;

        -- Fallback to first profile of same board type if none is active
        IF v_active_profile_id IS NULL THEN
            SELECT id, name INTO v_active_profile_id, v_profile_name
            FROM public.bell_profiles
            WHERE school_id = v_school_id
              AND COALESCE(board_type, 'ESP32-S3 N16R8') = COALESCE(v_board_type, 'ESP32-S3 N16R8')
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;

        IF COALESCE(v_board_type, 'ESP32-S3 N16R8') = 'ESP32-C3 Mini' THEN
            -- Mini variant: simple relay switching schedule only (time, days, label, delay_seconds/duration)
            SELECT json_agg(sched) INTO v_schedule_data FROM (
                SELECT
                    to_char(t.bell_time, 'HH24:MI:SS') as t,
                    json_agg(DISTINCT t.d ORDER BY t.d) as d,
                    COALESCE(MAX(t.delay_seconds), 5) as ds,
                    COALESCE(MAX(t.label), '') as lb
                FROM (
                    SELECT
                        bt.bell_time,
                        bt.label,
                        bt.delay_seconds,
                        unnest(bt.day_of_week) AS d
                    FROM public.bell_times bt
                    WHERE bt.profile_id = v_active_profile_id
                ) t
                GROUP BY
                    t.bell_time,
                    t.label
                ORDER BY t.bell_time
            ) sched;
        ELSE
            -- Full S3 variant: complex schedule with audio tracks, TTS, chimes
            SELECT json_agg(sched) INTO v_schedule_data FROM (
                SELECT
                    to_char(t.bell_time, 'HH24:MI:SS') as t,
                    json_agg(DISTINCT t.d ORDER BY t.d) as d,
                    COALESCE(MAX(af1.track_number), 12) as tr,
                    COALESCE(MAX(af2.track_number), 0) as tr2,
                    COALESCE(MAX(t.delay_seconds), 0) as ds,
                    CASE
                        WHEN t.precombined_at IS NOT NULL AND v_pa_enabled THEN 'mp3'
                        ELSE COALESCE(t.play_type, 'mp3')
                    END as ty,
                    CASE
                        WHEN t.precombined_at IS NOT NULL AND v_pa_enabled THEN ''
                        WHEN t.play_type = 'tts' THEN COALESCE(t.tts_message, '')
                        ELSE ''
                    END as tt,
                    COALESCE(bool_or(t.include_weather), false) as iw,
                    COALESCE(MAX(t.label), '') as lb,
                    CASE
                        WHEN t.precombined_at IS NOT NULL AND v_pa_enabled THEN
                            'combined/s_' || t.id::text || '.mp3'
                        WHEN t.play_type = 'mp3' AND MAX(af1.storage_path) IS NOT NULL THEN
                            COALESCE(REPLACE(public.urlencode(MAX(af1.storage_path)), '%2F', '/'), '')
                        ELSE ''
                    END as audio_url,
                    CASE
                        WHEN t.precombined_at IS NOT NULL AND v_pa_enabled THEN t.id::text
                        WHEN t.play_type = 'mp3' THEN t.audio_file_id::text
                        ELSE t.id::text
                    END as audio_id,
                    COALESCE(t.precombined_at IS NOT NULL AND v_pa_enabled, false) as pc
                FROM (
                    SELECT
                        bt.id,
                        bt.bell_time,
                        bt.audio_file_id,
                        bt.audio_file_id_2,
                        bt.delay_seconds,
                        bt.play_type,
                        bt.tts_message,
                        bt.label,
                        bt.precombined_at,
                        COALESCE(bt.include_weather, false) as include_weather,
                        unnest(bt.day_of_week) AS d
                    FROM public.bell_times bt
                    WHERE bt.profile_id = v_active_profile_id
                ) t
                LEFT JOIN public.audio_files af1 ON t.audio_file_id = af1.id
                LEFT JOIN public.audio_files af2 ON t.audio_file_id_2 = af2.id
                GROUP BY
                    t.id,
                    t.bell_time,
                    t.audio_file_id,
                    t.audio_file_id_2,
                    t.play_type,
                    t.tts_message,
                    t.label,
                    t.include_weather,
                    t.precombined_at
                ORDER BY t.bell_time
            ) sched;
        END IF;
    END;

    RETURN json_build_object(
        'status', 'ok',
        'school_id', v_school_id,
        'timezone_offset', v_timezone_offset,
        'profile_name', COALESCE(v_profile_name, 'Unknown'),
        'volume', COALESCE(v_volume, 21),
        'qh', COALESCE(v_quiet_hours, json_build_object('en', false, 'df', '21:00:00', 'ea', '07:00:00')),
        'pa_en', v_pa_enabled,
        'pa_url', v_pa_url,
        'pa_delay', COALESCE(v_pa_delay, 3),
        'pre_announcement_enabled', v_pa_enabled,
        'pre_announcement_url', v_pa_url,
        'pre_announcement_delay_seconds', COALESCE(v_pa_delay, 3),
        'schedules', coalesce(v_schedule_data, '[]'::json),
        'all_audio_files', coalesce(v_all_audio_data, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Update poll_commands to return pending_count
CREATE OR REPLACE FUNCTION public.poll_commands(device_mac text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_device_id uuid;
    v_cmd record;
    v_pending_count integer;
BEGIN
    SELECT id INTO v_device_id FROM public.bell_devices WHERE UPPER(mac_address) = UPPER(device_mac) LIMIT 1;
    IF v_device_id IS NULL THEN
        RETURN '{"has_command": false, "pending_count": 0}'::json;
    END IF;

    -- Get total pending count before popping
    SELECT COUNT(*) INTO v_pending_count 
    FROM public.command_queue 
    WHERE device_id = v_device_id AND LOWER(status) = 'pending';

    -- Select the oldest pending command (case-insensitive status check)
    SELECT id, command, payload INTO v_cmd 
    FROM public.command_queue 
    WHERE device_id = v_device_id AND LOWER(status) = 'pending' 
    ORDER BY created_at ASC LIMIT 1;

    IF v_cmd.id IS NOT NULL THEN
        -- Update status to 'executed'
        UPDATE public.command_queue 
        SET status = 'executed', executed_at = now() 
        WHERE id = v_cmd.id;

        RETURN json_build_object(
            'has_command', true,
            'id', v_cmd.id,
            'command', v_cmd.command,
            'payload', v_cmd.payload,
            'pending_count', v_pending_count - 1
        );
    END IF;

    RETURN json_build_object('has_command', false, 'pending_count', 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.poll_commands(text) TO anon, authenticated, service_role;
