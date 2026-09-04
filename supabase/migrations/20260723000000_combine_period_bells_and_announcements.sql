-- Migration: Combined Period Bells & Announcements + Time Clash Engine + Storage Audio Precombining
-- Target Project: hjlwzkwiweocnfztshmy

-- 1. Create check_schedule_time_clash RPC for real-time validation
CREATE OR REPLACE FUNCTION public.check_schedule_time_clash(
    p_school_id uuid,
    p_profile_id uuid,
    p_day_of_week integer,
    p_bell_time time,
    p_total_duration_sec integer DEFAULT 30,
    p_exclude_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_new_start_sec integer;
    v_new_end_sec integer;
    v_existing record;
    v_exist_start_sec integer;
    v_exist_end_sec integer;
    v_diff integer;
    v_db_day integer;
BEGIN
    -- Map UI day (0=Sun..6=Sat) to DB day (7=Sun, 1=Mon..6=Sat)
    v_db_day := CASE WHEN p_day_of_week = 0 THEN 7 ELSE p_day_of_week END;

    -- Calculate new event start & end in seconds from midnight
    v_new_start_sec := EXTRACT(HOUR FROM p_bell_time) * 3600 + EXTRACT(MINUTE FROM p_bell_time) * 60 + EXTRACT(SECOND FROM p_bell_time);
    v_new_end_sec := v_new_start_sec + COALESCE(p_total_duration_sec, 30);

    FOR v_existing IN
        SELECT
            bt.id,
            bt.bell_time,
            COALESCE(bt.label, CASE WHEN bt.play_type = 'tts' THEN 'Scheduled Announcement' ELSE 'Period Bell' END) as event_label,
            bt.play_type,
            COALESCE(bt.delay_seconds, 0) as delay_sec,
            af.duration as audio_duration
        FROM public.bell_times bt
        LEFT JOIN public.audio_files af ON bt.audio_file_id = af.id
        WHERE bt.profile_id = p_profile_id
          AND (p_exclude_id IS NULL OR bt.id != p_exclude_id)
          AND (v_db_day = ANY(bt.day_of_week))
    LOOP
        v_exist_start_sec := EXTRACT(HOUR FROM v_existing.bell_time) * 3600 + EXTRACT(MINUTE FROM v_existing.bell_time) * 60 + EXTRACT(SECOND FROM v_existing.bell_time);
        -- Estimate duration: PreChime(5s) + Delay + AudioDuration(default 20s if null)
        v_exist_end_sec := v_exist_start_sec + 5 + COALESCE(v_existing.delay_sec, 0) + COALESCE(v_existing.audio_duration, 20);

        -- Hard Overlap Check
        IF (v_new_start_sec < v_exist_end_sec AND v_new_end_sec > v_exist_start_sec) THEN
            RETURN json_build_object(
                'has_clash', true,
                'clash_type', 'hard_clash',
                'message', '❌ TIME CLASH ERROR: Overlaps with [' || v_existing.event_label || '] scheduled at ' || to_char(v_existing.bell_time, 'HH12:MI:SS AM'),
                'conflicting_time', to_char(v_existing.bell_time, 'HH12:MI:SS AM'),
                'conflicting_label', v_existing.event_label
            );
        END IF;

        -- Tight Buffer Gap Warning (< 60s gap)
        IF v_new_start_sec >= v_exist_end_sec THEN
            v_diff := v_new_start_sec - v_exist_end_sec;
            IF v_diff >= 0 AND v_diff < 60 THEN
                RETURN json_build_object(
                    'has_clash', true,
                    'clash_type', 'buffer_warning',
                    'message', '⚠️ TIGHT SCHEDULE WARNING: Scheduled only ' || v_diff || ' seconds after [' || v_existing.event_label || ']. Audio may queue sequentially.',
                    'conflicting_time', to_char(v_existing.bell_time, 'HH12:MI:SS AM'),
                    'conflicting_label', v_existing.event_label
                );
            END IF;
        END IF;
    END LOOP;

    RETURN json_build_object(
        'has_clash', false,
        'clash_type', 'none',
        'message', 'Valid time slot'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_schedule_time_clash(uuid, uuid, integer, time, integer, uuid) TO anon, authenticated, service_role;

-- 2. Ensure get_device_config RPC returns pre-combined storage MP3 paths for seamless ESP32 playback
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

        -- Consolidated timeline aggregation for Period Bells & Announcements
        SELECT json_agg(sched) INTO v_schedule_data FROM (
            SELECT
                to_char(t.bell_time, 'HH24:MI:SS') as t,
                json_agg(DISTINCT t.d ORDER BY t.d) as d,
                COALESCE(MAX(af1.track_number), 12) as tr,
                COALESCE(MAX(af2.track_number), 0) as tr2,
                COALESCE(MAX(t.delay_seconds), 0) as ds,
                -- Return 'mp3' so main_s3.cpp uses native stream playback without calling direct StreamElements playTTS
                'mp3' as ty,
                -- Clear tt to prevent playTTS branch in main_s3.cpp
                '' as tt,
                COALESCE(bool_or(t.include_weather), false) as iw,
                COALESCE(MAX(t.label), '') as lb,
                -- Point to pre-combined MP3 file in Supabase Storage audio-files bucket under combined/s_<id>.mp3
                CASE
                    WHEN v_pa_enabled THEN
                        'combined/s_' || t.id::text || '.mp3'
                    ELSE
                        COALESCE(REPLACE(public.urlencode(MAX(af1.storage_path)), '%2F', '/'), '')
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
