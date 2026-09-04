-- Migration: Fix TTS Language Defaults & RPC Caching
-- Target Project: hjlwzkwiweocnfztshmy

-- 1. Alter bell_times tts_language default to NULL
ALTER TABLE public.bell_times ALTER COLUMN tts_language DROP DEFAULT;

-- 2. Convert existing tts_language values of 'en' to NULL so they inherit school defaults
UPDATE public.bell_times
SET tts_language = NULL
WHERE tts_language = 'en';

-- 3. Set HBS Campus default TTS language to 'ur' (Urdu)
UPDATE public.schools
SET default_tts_language = 'ur'
WHERE id = '7a17637a-b5f1-44a2-b9d9-f254393c7074';

-- 4. Re-create get_device_config function to correctly map audio_id and audio_url for MP3/offline play
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

    -- Device-level overrides
    v_device_profile_id uuid;
    v_dev_pa_enabled boolean;
    v_dev_pa_id uuid;
    v_dev_pa_delay integer;
    v_dev_pa_vol integer;

    -- Final calculated pre-announcement values
    v_pa_enabled boolean := true;
    v_pa_url text := '';
    v_pa_delay integer := 3;
BEGIN
    -- Step 1: Fetch device details
    SELECT 
        id, school_id, volume, profile_id,
        pre_announcement_enabled, pre_announcement_id, pre_announcement_delay_seconds, pre_announcement_volume
    INTO 
        v_device_id, v_school_id, v_volume, v_device_profile_id,
        v_dev_pa_enabled, v_dev_pa_id, v_dev_pa_delay, v_dev_pa_vol
    FROM public.bell_devices
    WHERE mac_address = device_mac;

    IF v_device_id IS NULL THEN
        RETURN json_build_object('error', 'Device not found');
    END IF;

    -- Step 2: Update Heartbeat
    UPDATE public.bell_devices
    SET last_heartbeat = now(), status = 'online'
    WHERE id = v_device_id;

    -- Step 3: Fetch school quiet hours JSON
    SELECT json_build_object(
      'en', COALESCE(s.quiet_hours_enabled, false),
      'df', to_char(COALESCE(s.quiet_hours_disable_from, '21:00'::time), 'HH24:MI:SS'),
      'ea', to_char(COALESCE(s.quiet_hours_enable_at, '07:00'::time), 'HH24:MI:SS')
    )
    INTO v_quiet_hours
    FROM public.schools s
    WHERE s.id = v_school_id;

    -- Step 4: Resolve Pre-Announcement Configuration (Device Override -> School Default -> Fallback)
    DECLARE
        v_school_pa_enabled boolean := true;
        v_school_pa_id uuid;
        v_school_pa_delay integer := 3;
    BEGIN
        SELECT 
          COALESCE(s.pre_announcement_enabled, true),
          s.default_pre_announcement_id,
          COALESCE(s.pre_announcement_delay_seconds, 3)
        INTO 
          v_school_pa_enabled,
          v_school_pa_id,
          v_school_pa_delay
        FROM public.schools s
        WHERE s.id = v_school_id;

        -- Enabled state & delay (Device Override or School Default)
        v_pa_enabled := COALESCE(v_dev_pa_enabled, v_school_pa_enabled, true);
        v_pa_delay := COALESCE(v_dev_pa_delay, v_school_pa_delay, 3);

        -- Target chime ID (Device Override or School Default)
        DECLARE
            v_target_sound_id uuid := COALESCE(v_dev_pa_id, v_school_pa_id);
        BEGIN
            IF v_target_sound_id IS NOT NULL THEN
                SELECT COALESCE(file_url, '') INTO v_pa_url
                FROM public.pre_announcement_sounds
                WHERE id = v_target_sound_id;
            END IF;
        END;

        -- Fallback 1: Pre-Announcement Sound #10 (10th active sound in library)
        IF (v_pa_url IS NULL OR v_pa_url = '') THEN
            SELECT COALESCE(file_url, '') INTO v_pa_url
            FROM public.pre_announcement_sounds
            WHERE is_active = true
            ORDER BY created_at ASC
            OFFSET 9 LIMIT 1;
        END IF;

        -- Fallback 2: 1st active sound in library
        IF (v_pa_url IS NULL OR v_pa_url = '') THEN
            SELECT COALESCE(file_url, '') INTO v_pa_url
            FROM public.pre_announcement_sounds
            WHERE is_active = true
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;
    END;

    -- Step 5: Resolve Active Profile (Device Assigned Profile -> School Active Profile -> School First Profile)
    DECLARE
        v_active_profile_id uuid;
    BEGIN
        IF v_device_profile_id IS NOT NULL THEN
            SELECT id, name INTO v_active_profile_id, v_profile_name
            FROM public.bell_profiles
            WHERE id = v_device_profile_id AND school_id = v_school_id;
        END IF;

        -- Fallback to School Active Profile
        IF v_active_profile_id IS NULL THEN
            SELECT id, name INTO v_active_profile_id, v_profile_name
            FROM public.bell_profiles
            WHERE school_id = v_school_id AND is_active = true
            LIMIT 1;
        END IF;

        -- Fallback to First Created Profile in School
        IF v_active_profile_id IS NULL THEN
            SELECT id, name INTO v_active_profile_id, v_profile_name
            FROM public.bell_profiles
            WHERE school_id = v_school_id
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;

        -- Step 6: Build Schedule JSON
        SELECT json_agg(sched) INTO v_schedule_data FROM (
            SELECT
                to_char(t.bell_time, 'HH24:MI:SS') as t,
                json_agg(DISTINCT t.d ORDER BY t.d) as d,
                COALESCE(MAX(af1.track_number), 12) as tr,
                COALESCE(MAX(af2.track_number), 0) as tr2,
                COALESCE(MAX(t.delay_seconds), 0) as ds,
                -- Return 'mp3' only if it's a real TTS announcement (has non-empty message) and is precombined.
                -- Otherwise return original play_type so device handles local MP3 files locally.
                CASE
                    WHEN t.precombined_at IS NOT NULL AND v_pa_enabled AND t.play_type = 'tts' AND t.tts_message IS NOT NULL AND t.tts_message != '' THEN 'mp3'
                    ELSE COALESCE(t.play_type, 'mp3')
                END as ty,
                -- Clear tt to prevent playTTS branch in main_s3.cpp for combined TTS streams
                CASE
                    WHEN t.precombined_at IS NOT NULL AND v_pa_enabled AND t.play_type = 'tts' AND t.tts_message IS NOT NULL AND t.tts_message != '' THEN ''
                    WHEN t.play_type = 'tts' THEN COALESCE(t.tts_message, '')
                    ELSE ''
                END as tt,
                COALESCE(bool_or(t.include_weather), false) as iw,
                COALESCE(MAX(t.label), '') as lb,
                -- Point to combined path ONLY if it's a precombined TTS announcement with actual text.
                -- Otherwise, point to the original file storage path.
                CASE
                    WHEN t.precombined_at IS NOT NULL AND v_pa_enabled AND t.play_type = 'tts' AND t.tts_message IS NOT NULL AND t.tts_message != '' THEN
                        'combined/s_' || t.id::text || '.mp3'
                    WHEN MAX(af1.storage_path) IS NOT NULL THEN
                        COALESCE(REPLACE(public.urlencode(MAX(af1.storage_path)), '%2F', '/'), '')
                    ELSE ''
                END as audio_url,
                -- Return the actual audio_file_id for matching cached files locally,
                -- except when streaming a combined TTS file.
                CASE
                    WHEN t.precombined_at IS NOT NULL AND v_pa_enabled AND t.play_type = 'tts' AND t.tts_message IS NOT NULL AND t.tts_message != '' THEN t.id::text
                    ELSE COALESCE(MAX(af1.id::text), '')
                END as audio_id
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
        'pa_en', v_pa_enabled,
        'pa_url', COALESCE(v_pa_url, ''),
        'pa_delay', COALESCE(v_pa_delay, 3),
        'pre_announcement_enabled', v_pa_enabled,
        'pre_announcement_url', COALESCE(v_pa_url, ''),
        'pre_announcement_delay_seconds', COALESCE(v_pa_delay, 3),
        'schedules', coalesce(v_schedule_data, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_device_config(text) TO anon, authenticated, service_role;
