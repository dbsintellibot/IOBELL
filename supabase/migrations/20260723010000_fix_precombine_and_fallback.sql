-- Migration: Fix precombine tracking + smart fallback in get_device_config
-- Target Project: hjlwzkwiweocnfztshmy
-- Description: Adds precombined_at column to bell_times for tracking successful pre-combining,
--              and updates get_device_config to fall back to native TTS when combined file is missing.

-- 1. Add precombined_at tracking column to bell_times
ALTER TABLE public.bell_times
  ADD COLUMN IF NOT EXISTS precombined_at timestamptz;

-- 2. Update get_device_config with smart fallback logic
CREATE OR REPLACE FUNCTION public.get_device_config(device_mac text)
RETURNS json AS $$
DECLARE
    v_device_id uuid;
    v_school_id uuid;
    v_schedule_data json;
    v_profile_name text;
    v_timezone_offset integer := 300;
    v_quiet_hours json;
    v_volume integer;
    v_pa_enabled boolean := true;
    v_pa_url text := '';
    v_pa_delay integer := 3;
BEGIN
    SELECT id, school_id, volume INTO v_device_id, v_school_id, v_volume
    FROM public.bell_devices
    WHERE mac_address = device_mac;

    IF v_device_id IS NULL THEN
        RETURN json_build_object('error', 'Device not found');
    END IF;

    UPDATE public.bell_devices
    SET last_heartbeat = now(), status = 'online'
    WHERE id = v_device_id;

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

    DECLARE
        v_active_profile_id uuid;
    BEGIN
        SELECT id, name INTO v_active_profile_id, v_profile_name
        FROM public.bell_profiles
        WHERE school_id = v_school_id AND is_active = true
        LIMIT 1;

        IF v_active_profile_id IS NULL THEN
            SELECT id, name INTO v_active_profile_id, v_profile_name
            FROM public.bell_profiles
            WHERE school_id = v_school_id
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;

        -- Smart schedule aggregation with fallback logic:
        -- If precombined_at IS NOT NULL → combined file exists → return type='mp3' with combined path
        -- If precombined_at IS NULL and play_type='tts' → return type='tts' with original message (firmware handles TTS natively)
        -- If precombined_at IS NULL and play_type='mp3' → return type='mp3' with original storage path
        SELECT json_agg(sched) INTO v_schedule_data FROM (
            SELECT
                to_char(t.bell_time, 'HH24:MI:SS') as t,
                json_agg(DISTINCT t.d ORDER BY t.d) as d,
                COALESCE(MAX(af1.track_number), 12) as tr,
                COALESCE(MAX(af2.track_number), 0) as tr2,
                COALESCE(MAX(t.delay_seconds), 0) as ds,
                -- Smart type: use 'mp3' if pre-combined, otherwise preserve original play_type
                CASE
                    WHEN t.precombined_at IS NOT NULL AND v_pa_enabled THEN 'mp3'
                    ELSE COALESCE(t.play_type, 'mp3')
                END as ty,
                -- Smart TTS text: clear if pre-combined (audio is baked in), otherwise pass original
                CASE
                    WHEN t.precombined_at IS NOT NULL AND v_pa_enabled THEN ''
                    WHEN t.play_type = 'tts' THEN COALESCE(t.tts_message, '')
                    ELSE ''
                END as tt,
                COALESCE(bool_or(t.include_weather), false) as iw,
                COALESCE(MAX(t.label), '') as lb,
                -- Smart audio URL: use combined file if pre-combined, otherwise use original storage path
                CASE
                    WHEN t.precombined_at IS NOT NULL AND v_pa_enabled THEN
                        'combined/s_' || t.id::text || '.mp3'
                    WHEN t.play_type = 'mp3' AND MAX(af1.storage_path) IS NOT NULL THEN
                        COALESCE(REPLACE(public.urlencode(MAX(af1.storage_path)), '%2F', '/'), '')
                    ELSE ''
                END as audio_url,
                t.id::text as audio_id
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
    END;

    RETURN json_build_object(
        'status', 'ok',
        'school_id', v_school_id,
        'timezone_offset', v_timezone_offset,
        'profile_name', COALESCE(v_profile_name, 'Unknown'),
        'volume', COALESCE(v_volume, 21),
        'qh', COALESCE(v_quiet_hours, json_build_object('en', false, 'df', '21:00:00', 'ea', '07:00:00')),
        'pa_en', false,
        'pa_url', '',
        'pa_delay', COALESCE(v_pa_delay, 3),
        'pre_announcement_enabled', false,
        'pre_announcement_url', '',
        'pre_announcement_delay_seconds', COALESCE(v_pa_delay, 3),
        'schedules', coalesce(v_schedule_data, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_device_config(text) TO anon, authenticated, service_role;
