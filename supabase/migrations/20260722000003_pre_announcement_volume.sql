-- Add pre_announcement_volume column to schools table
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS pre_announcement_volume integer DEFAULT 3 CHECK (pre_announcement_volume BETWEEN 1 AND 5);

-- Update get_device_config function to include chime_vol parameter
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
    v_pa_vol integer := 3;
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
      COALESCE(pas.file_url, ''),
      COALESCE(s.pre_announcement_delay_seconds, 3),
      COALESCE(s.pre_announcement_volume, 3)
    INTO 
      v_pa_enabled,
      v_pa_url,
      v_pa_delay,
      v_pa_vol
    FROM public.schools s
    LEFT JOIN public.pre_announcement_sounds pas ON s.default_pre_announcement_id = pas.id
    WHERE s.id = v_school_id;

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

        SELECT json_agg(sched) INTO v_schedule_data FROM (
            SELECT
                to_char(t.bell_time, 'HH24:MI:SS') as t,
                json_agg(DISTINCT t.d ORDER BY t.d) as d,
                COALESCE(MAX(af1.track_number), 12) as tr,
                COALESCE(MAX(af2.track_number), 0) as tr2,
                COALESCE(MAX(t.delay_seconds), 0) as ds,
                t.play_type as ty,
                COALESCE(MAX(t.tts_message), '') as tt,
                COALESCE(bool_or(t.include_weather), false) as iw,
                CASE 
                    WHEN v_pa_enabled AND LENGTH(v_pa_url) > 0 AND MAX(af1.storage_path) IS NOT NULL THEN
                        'https://hjlwzkwiweocnfztshmy.supabase.co/functions/v1/combine-audio?chime_url=' || 
                        public.urlencode(v_pa_url) || 
                        '&delay_sec=' || v_pa_delay::text || 
                        '&chime_vol=' || v_pa_vol::text || 
                        '&audio_url=' || public.urlencode(
                            CASE 
                                WHEN MAX(af1.storage_path) LIKE 'http%' THEN MAX(af1.storage_path)
                                ELSE 'https://hjlwzkwiweocnfztshmy.supabase.co/storage/v1/object/public/audio-files/' || MAX(af1.storage_path)
                            END
                        )
                    ELSE MAX(af1.storage_path)
                END as audio_url,
                MAX(af1.id::text) as audio_id
            FROM (
                SELECT
                    bt.bell_time,
                    bt.audio_file_id,
                    bt.audio_file_id_2,
                    bt.delay_seconds,
                    bt.play_type,
                    bt.tts_message,
                    COALESCE(bt.include_weather, false) as include_weather,
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
                t.tts_message,
                t.include_weather
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
        'pa_en', COALESCE(v_pa_enabled, true),
        'pa_url', COALESCE(v_pa_url, ''),
        'pa_delay', COALESCE(v_pa_delay, 3),
        'pa_vol', COALESCE(v_pa_vol, 3),
        'pre_announcement_enabled', COALESCE(v_pa_enabled, true),
        'pre_announcement_url', COALESCE(v_pa_url, ''),
        'pre_announcement_delay_seconds', COALESCE(v_pa_delay, 3),
        'pre_announcement_volume', COALESCE(v_pa_vol, 3),
        'schedules', coalesce(v_schedule_data, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_device_config(text) TO anon, authenticated, service_role;
