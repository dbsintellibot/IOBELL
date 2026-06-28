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
    
    v_devices_restored integer := 0;
    v_audio_restored integer := 0;
    v_profiles_restored integer := 0;
    v_times_restored integer := 0;
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
        theme_color = COALESCE(p_school_row->>'theme_color', theme_color),
        theme_mode = COALESCE(p_school_row->>'theme_mode', theme_mode),
        quiet_hours_enabled = COALESCE((p_school_row->>'quiet_hours_enabled')::boolean, quiet_hours_enabled),
        quiet_hours_disable_from = COALESCE(p_school_row->>'quiet_hours_disable_from', quiet_hours_disable_from),
        quiet_hours_enable_at = COALESCE(p_school_row->>'quiet_hours_enable_at', quiet_hours_enable_at),
        updated_at = now()
    WHERE id = p_target_school_id;

    -- 3. Restore Audio Files Metadata
    FOR r_audio IN SELECT * FROM jsonb_to_recordset(p_audio_files) AS x(id uuid, name text, storage_path text, duration integer, track_number integer, track_number_2 integer)
    LOOP
        v_new_id := gen_random_uuid();
        v_old_id := r_audio.id;
        
        -- Generate mapping path containing the new target_school_id folder structure
        -- Old: "old-school-uuid/file.mp3" -> New: "new-school-uuid/file.mp3"
        DECLARE
            v_filename text := split_part(r_audio.storage_path, '/', 2);
            v_new_path text := p_target_school_id::text || '/' || v_filename;
        BEGIN
            INSERT INTO public.audio_files (id, name, storage_path, duration, school_id, track_number, track_number_2, created_at)
            VALUES (
                v_new_id,
                r_audio.name,
                v_new_path,
                r_audio.duration,
                p_target_school_id,
                r_audio.track_number,
                r_audio.track_number_2,
                now()
            );
            
            -- Save mapping: old_uuid => new_uuid
            v_audio_map := jsonb_set(v_audio_map, ARRAY[v_old_id::text], to_jsonb(v_new_id));
            v_audio_restored := v_audio_restored + 1;
        END;
    END LOOP;

    -- 4. Restore Devices (skip or overwrite matching MAC addresses)
    FOR r_device IN SELECT * FROM jsonb_to_recordset(p_devices) AS x(id uuid, mac_address text, name text, status text, location text, location_area text, volume integer, board_type text, input_power_type text)
    LOOP
        -- Check MAC conflict
        SELECT id INTO v_new_id FROM public.bell_devices WHERE mac_address = r_device.mac_address;
        
        IF v_new_id IS NOT NULL THEN
            -- Exists: Update device location details if in same school
            UPDATE public.bell_devices
            SET
                name = r_device.name,
                location = r_device.location,
                location_area = r_device.location_area,
                volume = r_device.volume,
                board_type = r_device.board_type,
                input_power_type = r_device.input_power_type,
                school_id = p_target_school_id
            WHERE id = v_new_id;
            
            v_device_map := jsonb_set(v_device_map, ARRAY[r_device.id::text], to_jsonb(v_new_id));
        ELSE
            -- New Device: Insert
            v_new_id := gen_random_uuid();
            INSERT INTO public.bell_devices (id, mac_address, name, status, school_id, location, location_area, volume, board_type, input_power_type, created_at)
            VALUES (
                v_new_id,
                r_device.mac_address,
                r_device.name,
                'offline',
                p_target_school_id,
                r_device.location,
                r_device.location_area,
                r_device.volume,
                r_device.board_type,
                r_device.input_power_type,
                now()
            );
            
            v_device_map := jsonb_set(v_device_map, ARRAY[r_device.id::text], to_jsonb(v_new_id));
            v_devices_restored := v_devices_restored + 1;
        END IF;
    END LOOP;

    -- 5. Restore Bell Profiles
    FOR r_profile IN SELECT * FROM jsonb_to_recordset(p_profiles) AS x(id uuid, name text, is_active boolean)
    LOOP
        v_new_id := gen_random_uuid();
        INSERT INTO public.bell_profiles (id, name, school_id, is_active, created_at)
        VALUES (v_new_id, r_profile.name, p_target_school_id, COALESCE(r_profile.is_active, false), now());
        
        v_profile_map := jsonb_set(v_profile_map, ARRAY[r_profile.id::text], to_jsonb(v_new_id));
        v_profiles_restored := v_profiles_restored + 1;
    END LOOP;

    -- 6. Restore Bell Times (remapping profiles and audio files)
    FOR r_bell_time IN SELECT * FROM jsonb_to_recordset(p_bell_times) AS x(profile_id uuid, bell_time time, day_of_week integer[], audio_file_id uuid, play_type text, tts_message text, delay_seconds integer)
    LOOP
        -- Find mapped profile ID
        DECLARE
            v_mapped_profile_id uuid := (v_profile_map->>(r_bell_time.profile_id::text))::uuid;
            v_mapped_audio_id uuid := (v_audio_map->>(r_bell_time.audio_file_id::text))::uuid;
        BEGIN
            IF v_mapped_profile_id IS NOT NULL THEN
                INSERT INTO public.bell_times (profile_id, bell_time, day_of_week, audio_file_id, play_type, tts_message, delay_seconds, created_at)
                VALUES (
                    v_mapped_profile_id,
                    r_bell_time.bell_time,
                    r_bell_time.day_of_week,
                    v_mapped_audio_id, -- Can be NULL for TTS
                    r_bell_time.play_type,
                    r_bell_time.tts_message,
                    r_bell_time.delay_seconds,
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
