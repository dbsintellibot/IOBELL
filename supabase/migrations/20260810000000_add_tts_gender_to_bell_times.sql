-- Migration: Add tts_gender to bell_times
-- Description: Adds tts_gender column to public.bell_times table and updates restore_school_data RPC.

ALTER TABLE public.bell_times 
ADD COLUMN IF NOT EXISTS tts_gender text;

-- Add constraint to enforce valid gender values ('male' or 'female')
ALTER TABLE public.bell_times
DROP CONSTRAINT IF EXISTS check_tts_gender;

ALTER TABLE public.bell_times
ADD CONSTRAINT check_tts_gender CHECK (tts_gender IN ('male', 'female'));

-- Update restore_school_data RPC to support all columns including tts_gender, audio_file_id_2, delay_seconds, label, and include_weather
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
        DELETE FROM public.bell_profiles WHERE school_id = p_target_school_id;
        DELETE FROM public.audio_files WHERE school_id = p_target_school_id;
        DELETE FROM public.bell_devices WHERE school_id = p_target_school_id;
    END IF;

    -- 2. Restore School Settings
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
        
        DECLARE
            v_filename text := substring(r_audio.storage_path from '[^/]+$');
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
            
            v_audio_map := jsonb_set(v_audio_map, ARRAY[v_old_id::text], to_jsonb(v_new_id));
            v_audio_restored := v_audio_restored + 1;
        END;
    END LOOP;

    -- 4. Restore Bell Profiles and map IDs
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

    -- 5. Restore Devices (check MAC addresses, link restored profile_id via v_profile_map)
    FOR r_device IN SELECT * FROM jsonb_to_recordset(p_devices) AS x(
        id uuid, mac_address text, name text, status text, location text, location_area text, volume integer, 
        board_type text, input_power_type text, profile_id uuid, pre_announcement_enabled boolean, 
        pre_announcement_id uuid, pre_announcement_delay_seconds integer, pre_announcement_volume integer
    )
    LOOP
        -- Map device profile_id if it exists in backup
        DECLARE
            v_mapped_dev_profile_id uuid := NULL;
        BEGIN
            IF r_device.profile_id IS NOT NULL THEN
                v_mapped_dev_profile_id := (v_profile_map->>(r_device.profile_id::text))::uuid;
            END IF;

            -- Check MAC conflict
            SELECT id, school_id INTO v_new_id, v_existing_school_id FROM public.bell_devices WHERE mac_address = r_device.mac_address;
            
            IF v_new_id IS NOT NULL THEN
                IF v_existing_school_id != p_target_school_id THEN
                    RAISE EXCEPTION 'Conflict: Device % with MAC % is registered to another school. Please unassign it manually first.', r_device.name, r_device.mac_address;
                ELSE
                    UPDATE public.bell_devices
                    SET
                        name = r_device.name,
                        location = r_device.location,
                        location_area = r_device.location_area,
                        volume = r_device.volume,
                        board_type = r_device.board_type,
                        input_power_type = r_device.input_power_type,
                        profile_id = v_mapped_dev_profile_id,
                        pre_announcement_enabled = r_device.pre_announcement_enabled,
                        pre_announcement_id = r_device.pre_announcement_id,
                        pre_announcement_delay_seconds = r_device.pre_announcement_delay_seconds,
                        pre_announcement_volume = r_device.pre_announcement_volume
                    WHERE id = v_new_id;
                    
                    v_device_map := jsonb_set(v_device_map, ARRAY[r_device.id::text], to_jsonb(v_new_id));
                END IF;
            ELSE
                v_new_id := gen_random_uuid();
                INSERT INTO public.bell_devices (
                    id, mac_address, name, status, school_id, location, location_area, volume, 
                    board_type, input_power_type, profile_id, pre_announcement_enabled, pre_announcement_id, 
                    pre_announcement_delay_seconds, pre_announcement_volume, created_at
                )
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
                    v_mapped_dev_profile_id,
                    r_device.pre_announcement_enabled,
                    r_device.pre_announcement_id,
                    r_device.pre_announcement_delay_seconds,
                    r_device.pre_announcement_volume,
                    now()
                );
                
                v_device_map := jsonb_set(v_device_map, ARRAY[r_device.id::text], to_jsonb(v_new_id));
                v_devices_restored := v_devices_restored + 1;
            END IF;
        END;
    END LOOP;

    -- 6. Restore Bell Times (supporting tts_gender and all scheduling columns)
    FOR r_bell_time IN SELECT * FROM jsonb_to_recordset(p_bell_times) AS x(
        profile_id uuid, 
        bell_time time, 
        day_of_week integer[], 
        audio_file_id uuid, 
        audio_file_id_2 uuid,
        play_type text, 
        tts_message text, 
        delay_seconds integer,
        label text,
        include_weather boolean,
        tts_gender text
    )
    LOOP
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
                    play_type, 
                    tts_message, 
                    delay_seconds, 
                    label,
                    include_weather,
                    tts_gender,
                    created_at
                )
                VALUES (
                    v_mapped_profile_id,
                    r_bell_time.bell_time,
                    r_bell_time.day_of_week,
                    v_mapped_audio_id,
                    v_mapped_audio_id_2,
                    r_bell_time.play_type,
                    r_bell_time.tts_message,
                    r_bell_time.delay_seconds,
                    r_bell_time.label,
                    COALESCE(r_bell_time.include_weather, false),
                    r_bell_time.tts_gender,
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
