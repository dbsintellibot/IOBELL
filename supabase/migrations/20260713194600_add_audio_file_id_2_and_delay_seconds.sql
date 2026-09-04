-- Migration: Add audio_file_id_2 and delay_seconds to bell_times
-- Description: Restores audio_file_id_2 and delay_seconds columns to bell_times table, and updates get_device_config and restore_school_data RPC functions.

-- 1. Add columns to bell_times table
ALTER TABLE public.bell_times
ADD COLUMN IF NOT EXISTS audio_file_id_2 uuid REFERENCES public.audio_files(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS delay_seconds integer DEFAULT 0;

-- 2. Update get_device_config RPC function
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

    SELECT json_build_object(
      'en', COALESCE(s.quiet_hours_enabled, false),
      'df', to_char(COALESCE(s.quiet_hours_disable_from, '21:00'::time), 'HH24:MI:SS'),
      'ea', to_char(COALESCE(s.quiet_hours_enable_at, '07:00'::time), 'HH24:MI:SS')
    )
    INTO v_quiet_hours
    FROM public.schools s
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
                MAX(CASE WHEN t.play_type = 'tts' THEN 'tts' ELSE 'mp3' END) as ty,
                COALESCE(MAX(t.tts_message), '') as tt,
                MAX(af1.storage_path) as audio_url,
                MAX(af1.id::text) as audio_id
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
        'volume', COALESCE(v_volume, 21),
        'qh', COALESCE(v_quiet_hours, json_build_object('en', false, 'df', '21:00:00', 'ea', '07:00:00')),
        'schedules', coalesce(v_schedule_data, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_device_config(text) TO anon, authenticated, service_role;

-- 3. Update restore_school_data RPC function
CREATE OR REPLACE FUNCTION public.restore_school_data(
    p_target_school_id uuid,
    p_school_row jsonb,
    p_devices jsonb,
    p_audio_files jsonb,
    p_profiles jsonb,
    p_bell_times jsonb,
    p_overwrite boolean
)
RETURNS json AS $$
DECLARE
    v_audio_map jsonb := '{}'::jsonb;
    v_profile_map jsonb := '{}'::jsonb;
    v_device_map jsonb := '{}'::jsonb;
    
    r_audio record;
    r_device record;
    r_profile record;
    r_bell_time record;
    
    v_new_id uuid;
    v_old_id uuid;
    v_existing_school_id uuid;
    
    v_devices_restored integer := 0;
    v_audio_restored integer := 0;
    v_profiles_restored integer := 0;
    v_times_restored integer := 0;

    v_has_active boolean := false;
    v_first_profile_id uuid := null;
BEGIN
    -- 1. Overwrite check (Wipe existing records if requested)
    IF p_overwrite THEN
        -- Cascades to bell_times, device_logs, command_queue
        DELETE FROM public.bell_profiles WHERE school_id = p_target_school_id;
        DELETE FROM public.audio_files WHERE school_id = p_target_school_id;
        DELETE FROM public.bell_devices WHERE school_id = p_target_school_id;
    END IF;

    -- 2. Restore School Settings (except name & logo unless requested, merge config)
    UPDATE public.schools
    SET
        theme_mode = COALESCE(p_school_row->>'theme_mode', theme_mode),
        quiet_hours_enabled = COALESCE((p_school_row->>'quiet_hours_enabled')::boolean, quiet_hours_enabled),
        quiet_hours_disable_from = COALESCE((p_school_row->>'quiet_hours_disable_from')::time, quiet_hours_disable_from),
        quiet_hours_enable_at = COALESCE((p_school_row->>'quiet_hours_enable_at')::time, quiet_hours_enable_at),
        updated_at = now()
    WHERE id = p_target_school_id;

    -- 3. Restore Audio Files Metadata
    FOR r_audio IN SELECT * FROM jsonb_to_recordset(p_audio_files) AS x(id uuid, name text, storage_path text, duration integer, track_number integer)
    LOOP
        v_new_id := gen_random_uuid();
        v_old_id := r_audio.id;
        
        -- Generate mapping path containing the new target_school_id folder structure
        DECLARE
            v_filename text := substring(r_audio.storage_path from '[^/]+$');
            v_new_path text := p_target_school_id::text || '/' || v_filename;
        BEGIN
            INSERT INTO public.audio_files (id, name, storage_path, duration, school_id, track_number, created_at)
            VALUES (
                v_new_id,
                r_audio.name,
                v_new_path,
                r_audio.duration,
                p_target_school_id,
                r_audio.track_number,
                now()
            );
            
            -- Save mapping: old_uuid => new_uuid
            v_audio_map := jsonb_set(v_audio_map, ARRAY[v_old_id::text], to_jsonb(v_new_id));
            v_audio_restored := v_audio_restored + 1;
        END;
    END LOOP;

    -- 4. Restore Devices (check MAC addresses against cross-school assignments)
    FOR r_device IN SELECT * FROM jsonb_to_recordset(p_devices) AS x(id uuid, mac_address text, name text, status text)
    LOOP
        -- Check MAC conflict
        SELECT id, school_id INTO v_new_id, v_existing_school_id FROM public.bell_devices WHERE mac_address = r_device.mac_address;
        
        IF v_new_id IS NOT NULL THEN
            IF v_existing_school_id != p_target_school_id THEN
                -- Explicitly prevent "stealing" a device from another school during a restore.
                RAISE EXCEPTION 'Conflict: Device % with MAC % is registered to another school. Please unassign it manually first.', r_device.name, r_device.mac_address;
            ELSE
                -- Exists in the SAME school: Update device name
                UPDATE public.bell_devices
                SET
                    name = r_device.name
                WHERE id = v_new_id;
                
                v_device_map := jsonb_set(v_device_map, ARRAY[r_device.id::text], to_jsonb(v_new_id));
            END IF;
        ELSE
            -- New Device: Insert
            v_new_id := gen_random_uuid();
            INSERT INTO public.bell_devices (id, mac_address, name, status, school_id, created_at)
            VALUES (
                v_new_id,
                r_device.mac_address,
                r_device.name,
                'offline',
                p_target_school_id,
                now()
            );
            
            v_device_map := jsonb_set(v_device_map, ARRAY[r_device.id::text], to_jsonb(v_new_id));
            v_devices_restored := v_devices_restored + 1;
        END IF;
    END LOOP;

    -- 5. Restore Bell Profiles and enforce exactly one active profile fallback
    FOR r_profile IN SELECT * FROM jsonb_to_recordset(p_profiles) AS x(id uuid, name text, is_active boolean, created_at timestamp) ORDER BY created_at ASC
    LOOP
        v_new_id := gen_random_uuid();
        
        IF v_first_profile_id IS NULL THEN
            v_first_profile_id := v_new_id;
        END IF;

        IF COALESCE(r_profile.is_active, false) THEN
            v_has_active := true;
        END IF;

        INSERT INTO public.bell_profiles (id, name, school_id, is_active, created_at)
        VALUES (v_new_id, r_profile.name, p_target_school_id, COALESCE(r_profile.is_active, false), COALESCE(r_profile.created_at, now()));
        
        v_profile_map := jsonb_set(v_profile_map, ARRAY[r_profile.id::text], to_jsonb(v_new_id));
        v_profiles_restored := v_profiles_restored + 1;
    END LOOP;

    -- Fallback to activating the first profile if none are active
    IF NOT v_has_active AND v_first_profile_id IS NOT NULL THEN
        UPDATE public.bell_profiles SET is_active = true WHERE id = v_first_profile_id;
    END IF;

    -- 6. Restore Bell Times (remapping profiles and audio files)
    FOR r_bell_time IN SELECT * FROM jsonb_to_recordset(p_bell_times) AS x(
        profile_id uuid, 
        bell_time time, 
        day_of_week integer[], 
        audio_file_id uuid, 
        audio_file_id_2 uuid,
        delay_seconds integer,
        play_type text, 
        tts_message text,
        label text,
        include_weather boolean
    )
    LOOP
        -- Find mapped profile ID
        DECLARE
            v_mapped_profile_id uuid := (v_profile_map->>(r_bell_time.profile_id::text))::uuid;
            v_mapped_audio_id uuid := (v_audio_map->>(r_bell_time.audio_file_id::text))::uuid;
            v_mapped_audio_id_2 uuid := (v_audio_map->>(r_bell_time.audio_file_id_2::text))::uuid;
        BEGIN
            IF v_mapped_profile_id IS NOT NULL THEN
                INSERT INTO public.bell_times (
                    profile_id, 
                    bell_time, 
                    day_of_week, 
                    audio_file_id, 
                    audio_file_id_2,
                    delay_seconds,
                    play_type, 
                    tts_message, 
                    label,
                    include_weather,
                    created_at
                )
                VALUES (
                    v_mapped_profile_id,
                    r_bell_time.bell_time,
                    r_bell_time.day_of_week,
                    v_mapped_audio_id,
                    v_mapped_audio_id_2,
                    COALESCE(r_bell_time.delay_seconds, 0),
                    r_bell_time.play_type,
                    r_bell_time.tts_message,
                    r_bell_time.label,
                    COALESCE(r_bell_time.include_weather, false),
                    now()
                );
                v_times_restored := v_times_restored + 1;
            END IF;
        END;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'devices_restored', v_devices_restored,
        'audio_files_restored', v_audio_restored,
        'profiles_restored', v_profiles_restored,
        'bell_times_restored', v_times_restored
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.restore_school_data(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) TO authenticated;
