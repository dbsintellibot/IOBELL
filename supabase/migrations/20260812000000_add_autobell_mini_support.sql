-- Migration: 20260812000000_add_autobell_mini_support.sql
-- Description: Add board_type to device_inventory, allow active profiles per school & board type, update claim and config functions for Mini support.

-- 1. Add board_type column to device_inventory and bell_profiles
ALTER TABLE public.device_inventory 
ADD COLUMN IF NOT EXISTS board_type text DEFAULT 'ESP32-S3 N16R8';

ALTER TABLE public.bell_profiles 
ADD COLUMN IF NOT EXISTS board_type text DEFAULT 'ESP32-S3 N16R8';

-- 2. Update ensure_single_active_profile trigger function
CREATE OR REPLACE FUNCTION public.ensure_single_active_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    -- Set all other profiles for this school and SAME board_type to inactive
    UPDATE public.bell_profiles
    SET is_active = false
    WHERE school_id = NEW.school_id 
    AND COALESCE(board_type, 'ESP32-S3 N16R8') = COALESCE(NEW.board_type, 'ESP32-S3 N16R8')
    AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Update claim_device function to propagate board_type
CREATE OR REPLACE FUNCTION public.claim_device(p_serial_number text, p_device_name text)
RETURNS json AS $$
DECLARE
    v_school_id uuid;
    v_inventory_record public.device_inventory%ROWTYPE;
    v_new_device_id uuid;
BEGIN
    SELECT school_id INTO v_school_id FROM public.users WHERE id = auth.uid();

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to a school';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Only school admins can claim devices';
    END IF;

    SELECT * INTO v_inventory_record
    FROM public.device_inventory
    WHERE UPPER(serial_number) = UPPER(p_serial_number)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid Serial Number';
    END IF;

    IF v_inventory_record.retired_at IS NOT NULL THEN
        RAISE EXCEPTION 'Device has been retired and cannot be claimed';
    END IF;

    IF v_inventory_record.claimed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Device already claimed';
    END IF;

    UPDATE public.device_inventory
    SET claimed_at = now(),
        claimed_by_school_id = v_school_id
    WHERE id = v_inventory_record.id;

    -- Upsert bell_devices while copying board_type
    INSERT INTO public.bell_devices (mac_address, name, school_id, status, board_type)
    VALUES (
        v_inventory_record.mac_address, 
        p_device_name, 
        v_school_id, 
        'offline', 
        COALESCE(v_inventory_record.board_type, 'ESP32-S3 N16R8')
    )
    ON CONFLICT (mac_address) DO UPDATE
    SET school_id = EXCLUDED.school_id,
        name = EXCLUDED.name,
        board_type = EXCLUDED.board_type
    RETURNING id INTO v_new_device_id;

    RETURN json_build_object('success', true, 'device_id', v_new_device_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Update bulk_register_inventory function to accept board_type
CREATE OR REPLACE FUNCTION public.bulk_register_inventory(p_devices jsonb)
RETURNS json AS $$
DECLARE
    v_device jsonb;
    v_serial text;
    v_mac text;
    v_board text;
    v_clean_mac text;
    v_formatted_mac text;
    v_inserted int := 0;
    v_skipped int := 0;
    v_invalid int := 0;
    v_inserted_id uuid;
BEGIN
    -- Access Control: Enforce is_super_admin()
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Only super admins can register device inventory';
    END IF;

    -- Verify input is a JSON array
    IF jsonb_typeof(p_devices) <> 'array' THEN
        RAISE EXCEPTION 'Input must be a JSON array of devices';
    END IF;

    FOR v_device IN SELECT jsonb_array_elements(p_devices) LOOP
        v_serial := trim(v_device->>'serial_number');
        v_mac := trim(v_device->>'mac_address');
        v_board := COALESCE(trim(v_device->>'board_type'), 'ESP32-S3 N16R8');

        -- Validation: check if empty or missing fields
        IF v_serial IS NULL OR v_serial = '' OR v_mac IS NULL OR v_mac = '' THEN
            v_invalid := v_invalid + 1;
            CONTINUE;
        END IF;

        -- Normalize MAC: extract alphanumeric characters and convert to uppercase
        v_clean_mac := upper(regexp_replace(v_mac, '[^0-9A-Fa-f]', '', 'g'));

        -- Ensure it has exactly 12 hex characters
        IF length(v_clean_mac) <> 12 THEN
            v_invalid := v_invalid + 1;
            CONTINUE;
        END IF;

        -- Format as XX:XX:XX:XX:XX:XX
        v_formatted_mac := substring(v_clean_mac from 1 for 2) || ':' ||
                           substring(v_clean_mac from 3 for 2) || ':' ||
                           substring(v_clean_mac from 5 for 2) || ':' ||
                           substring(v_clean_mac from 7 for 2) || ':' ||
                           substring(v_clean_mac from 9 for 2) || ':' ||
                           substring(v_clean_mac from 11 for 2);

        v_inserted_id := NULL;
        BEGIN
            INSERT INTO public.device_inventory (serial_number, mac_address, board_type)
            VALUES (v_serial, v_formatted_mac, v_board)
            ON CONFLICT (mac_address) DO NOTHING
            RETURNING id INTO v_inserted_id;

            IF v_inserted_id IS NOT NULL THEN
                v_inserted := v_inserted + 1;
            ELSE
                -- Skipped because of conflict on mac_address
                v_skipped := v_skipped + 1;
            END IF;
        EXCEPTION WHEN unique_violation THEN
            -- Skipped because of conflict on serial_number
            v_skipped := v_skipped + 1;
        END;
    END LOOP;

    RETURN json_build_object(
        'inserted', v_inserted,
        'skipped', v_skipped,
        'invalid', v_invalid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Update get_device_config RPC
CREATE OR REPLACE FUNCTION public.get_device_config(device_mac text)
RETURNS json AS $$
DECLARE
    v_device_id uuid;
    v_school_id uuid;
    v_volume integer;
    v_board_type text;
    v_schedule_data json;
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
            -- Mini variant: simple relay switching schedule only (time, days, label)
            SELECT json_agg(sched) INTO v_schedule_data FROM (
                SELECT
                    to_char(t.bell_time, 'HH24:MI:SS') as t,
                    json_agg(DISTINCT t.d ORDER BY t.d) as d,
                    COALESCE(MAX(t.label), '') as lb
                FROM (
                    SELECT
                        bt.bell_time,
                        bt.label,
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
        'schedules', coalesce(v_schedule_data, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Add s3_quantity and mini_quantity columns to deals
ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS s3_quantity integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS mini_quantity integer DEFAULT 0;

-- 7. Update convert_lead_to_deal RPC function to accept quantities
CREATE OR REPLACE FUNCTION public.convert_lead_to_deal(
    p_lead_id UUID, 
    p_amount NUMERIC,
    p_s3_quantity integer,
    p_mini_quantity integer
)
RETURNS JSONB
SECURITY DEFINER
AS $$
DECLARE
    v_partner_id UUID;
    v_lead_partner_id UUID;
    v_lead_status TEXT;
    v_deal_id UUID;
    v_is_super_admin BOOLEAN;
BEGIN
    -- Check if user is super admin
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'super_admin'
    ) INTO v_is_super_admin;

    -- Get the lead's owner and status
    SELECT partner_id, status INTO v_lead_partner_id, v_lead_status
    FROM public.leads
    WHERE id = p_lead_id;

    IF v_lead_partner_id IS NULL THEN
        RAISE EXCEPTION 'Lead not found';
    END IF;

    -- Get caller's partner ID
    v_partner_id := public.get_my_partner_id();

    -- Authorization check: caller must be the lead's partner or a super admin
    IF NOT (v_is_super_admin OR (v_partner_id = v_lead_partner_id)) THEN
        RAISE EXCEPTION 'Access Denied: You do not own this lead';
    END IF;

    -- State validation: can only convert leads that are active
    IF v_lead_status IN ('lost', 'converted_to_deal') THEN
        RAISE EXCEPTION 'Cannot convert lead: current status is %', v_lead_status;
    END IF;

    -- Insert Deal
    INSERT INTO public.deals (lead_id, partner_id, amount, status, s3_quantity, mini_quantity)
    VALUES (p_lead_id, v_lead_partner_id, p_amount, 'negotiation', p_s3_quantity, p_mini_quantity)
    RETURNING id INTO v_deal_id;

    -- Update Lead Status
    UPDATE public.leads
    SET status = 'converted_to_deal', updated_at = now()
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
        'deal_id', v_deal_id,
        'lead_id', p_lead_id,
        'status', 'success'
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.convert_lead_to_deal(p_lead_id UUID, p_amount NUMERIC)
RETURNS JSONB
SECURITY DEFINER
AS $$
BEGIN
    RETURN public.convert_lead_to_deal(p_lead_id, p_amount, 0, 0);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.convert_lead_to_deal(UUID, NUMERIC, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_deal(UUID, NUMERIC) TO authenticated;
