-- Migration: Product Activation & 1-Year Free Subscription with Renewal Controls
-- Date: 2026-08-24
-- Description: Adds activation_status, subscription_end_date, activation_requests, and RPCs (activate_device, suspend_device)

-- 1. Extend device_inventory table
ALTER TABLE public.device_inventory 
ADD COLUMN IF NOT EXISTS activation_status text DEFAULT 'unactivated',
ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS activated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS subscription_end_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS payment_reference text,
ADD COLUMN IF NOT EXISTS activation_notes text,
ADD COLUMN IF NOT EXISTS assigned_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

-- Add check constraint for activation_status on device_inventory if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'device_inventory_activation_status_check'
    ) THEN
        ALTER TABLE public.device_inventory 
        ADD CONSTRAINT device_inventory_activation_status_check 
        CHECK (activation_status IN ('unactivated', 'pending_activation', 'active', 'suspended', 'expired'));
    END IF;
END $$;

-- 2. Extend bell_devices table
ALTER TABLE public.bell_devices 
ADD COLUMN IF NOT EXISTS activation_status text DEFAULT 'unactivated',
ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS activated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS subscription_end_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS payment_reference text,
ADD COLUMN IF NOT EXISTS activation_notes text;

-- Add check constraint for activation_status on bell_devices if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bell_devices_activation_status_check'
    ) THEN
        ALTER TABLE public.bell_devices 
        ADD CONSTRAINT bell_devices_activation_status_check 
        CHECK (activation_status IN ('unactivated', 'pending_activation', 'active', 'suspended', 'expired'));
    END IF;
END $$;

-- 3. Backfill existing claimed devices so current active schools are not disrupted (Active + 1 Year Free)
UPDATE public.bell_devices
SET activation_status = 'active',
    is_paid = true,
    activated_at = COALESCE(activated_at, created_at, now()),
    subscription_end_date = COALESCE(subscription_end_date, now() + interval '1 year')
WHERE school_id IS NOT NULL AND (activation_status IS NULL OR activation_status = 'unactivated');

UPDATE public.device_inventory
SET activation_status = 'active',
    is_paid = true,
    activated_at = COALESCE(activated_at, claimed_at, now()),
    subscription_end_date = COALESCE(subscription_end_date, now() + interval '1 year')
WHERE claimed_at IS NOT NULL AND (activation_status IS NULL OR activation_status = 'unactivated');

-- 4. Create activation_requests table for customer payment slips / activation tickets
CREATE TABLE IF NOT EXISTS public.activation_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id uuid REFERENCES public.bell_devices(id) ON DELETE CASCADE,
    school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    payment_reference text,
    notes text,
    receipt_url text,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamp with time zone DEFAULT now(),
    reviewed_at timestamp with time zone
);

ALTER TABLE public.activation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School users can view and create their own activation requests" ON public.activation_requests;
CREATE POLICY "School users can view and create their own activation requests" ON public.activation_requests
    FOR ALL
    USING (
        school_id IN (SELECT school_id FROM public.users WHERE id = auth.uid())
        OR is_super_admin()
    )
    WITH CHECK (
        school_id IN (SELECT school_id FROM public.users WHERE id = auth.uid())
        OR is_super_admin()
    );

-- 5. Update claim_device function to transition to 'pending_activation'
CREATE OR REPLACE FUNCTION public.claim_device(p_serial_number text, p_device_name text)
RETURNS json AS $$
DECLARE
    v_school_id uuid;
    v_inventory_record public.device_inventory%ROWTYPE;
    v_new_device_id uuid;
    v_target_status text;
BEGIN
    SELECT school_id INTO v_school_id FROM public.users WHERE id = auth.uid();

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to a school';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')) THEN
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

    IF v_inventory_record.claimed_at IS NOT NULL AND v_inventory_record.claimed_by_school_id IS NOT NULL AND v_inventory_record.claimed_by_school_id <> v_school_id THEN
        RAISE EXCEPTION 'Device already claimed by another institution';
    END IF;

    -- If already activated, preserve active status; otherwise set to 'pending_activation'
    IF v_inventory_record.activation_status = 'active' THEN
        v_target_status := 'active';
    ELSE
        v_target_status := 'pending_activation';
    END IF;

    UPDATE public.device_inventory
    SET claimed_at = COALESCE(claimed_at, now()),
        claimed_by_school_id = v_school_id,
        activation_status = v_target_status
    WHERE id = v_inventory_record.id;

    INSERT INTO public.bell_devices (
        mac_address, 
        name, 
        school_id, 
        status, 
        activation_status, 
        is_paid, 
        subscription_end_date
    )
    VALUES (
        v_inventory_record.mac_address, 
        p_device_name, 
        v_school_id, 
        'offline', 
        v_target_status, 
        (v_target_status = 'active'),
        v_inventory_record.subscription_end_date
    )
    ON CONFLICT (mac_address) DO UPDATE
    SET school_id = EXCLUDED.school_id,
        name = EXCLUDED.name,
        activation_status = CASE 
            WHEN public.bell_devices.activation_status = 'active' THEN 'active'
            ELSE v_target_status
        END,
        subscription_end_date = COALESCE(public.bell_devices.subscription_end_date, EXCLUDED.subscription_end_date)
    RETURNING id INTO v_new_device_id;

    RETURN json_build_object(
        'success', true, 
        'device_id', v_new_device_id,
        'activation_status', v_target_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.claim_device(text, text) TO authenticated, service_role;

-- 6. Super Admin Activate Device RPC
CREATE OR REPLACE FUNCTION public.activate_device(
    p_device_id uuid, 
    p_duration_months int DEFAULT 12, 
    p_payment_ref text DEFAULT NULL, 
    p_notes text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_mac text;
    v_school_id uuid;
    v_end_date timestamp with time zone;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Only super admins can activate devices';
    END IF;

    SELECT mac_address, school_id INTO v_mac, v_school_id
    FROM public.bell_devices
    WHERE id = p_device_id;

    IF v_mac IS NULL THEN
        RAISE EXCEPTION 'Device not found';
    END IF;

    -- Calculate subscription end date (default 12 months = 1 Year Free)
    v_end_date := now() + (COALESCE(p_duration_months, 12) || ' months')::interval;

    -- Update bell_devices
    UPDATE public.bell_devices
    SET activation_status = 'active',
        is_paid = true,
        activated_at = now(),
        subscription_end_date = v_end_date,
        payment_reference = COALESCE(p_payment_ref, payment_reference),
        activation_notes = COALESCE(p_notes, activation_notes)
    WHERE id = p_device_id;

    -- Update device_inventory
    UPDATE public.device_inventory
    SET activation_status = 'active',
        is_paid = true,
        activated_at = now(),
        subscription_end_date = v_end_date,
        payment_reference = COALESCE(p_payment_ref, payment_reference),
        activation_notes = COALESCE(p_notes, activation_notes)
    WHERE UPPER(mac_address) = UPPER(v_mac);

    -- Update school payment status & subscription end date
    IF v_school_id IS NOT NULL THEN
        UPDATE public.schools
        SET payment_status = 'paid',
            subscription_end_date = v_end_date
        WHERE id = v_school_id;
    END IF;

    -- Approve any pending activation requests
    UPDATE public.activation_requests
    SET status = 'approved',
        reviewed_at = now()
    WHERE device_id = p_device_id AND status = 'pending';

    -- Notify hardware via command queue
    INSERT INTO public.command_queue (device_id, command, payload)
    VALUES (p_device_id, 'SYNC_SCHEDULES', json_build_object('reason', 'device_activated', 'expires_at', v_end_date));

    RETURN json_build_object(
        'success', true,
        'activation_status', 'active',
        'subscription_end_date', v_end_date
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.activate_device(uuid, int, text, text) TO authenticated, service_role;

-- 7. Super Admin Suspend Device RPC
CREATE OR REPLACE FUNCTION public.suspend_device(
    p_device_id uuid, 
    p_reason text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_mac text;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Only super admins can suspend devices';
    END IF;

    SELECT mac_address INTO v_mac
    FROM public.bell_devices
    WHERE id = p_device_id;

    IF v_mac IS NULL THEN
        RAISE EXCEPTION 'Device not found';
    END IF;

    UPDATE public.bell_devices
    SET activation_status = 'suspended',
        activation_notes = COALESCE(p_reason, activation_notes)
    WHERE id = p_device_id;

    UPDATE public.device_inventory
    SET activation_status = 'suspended',
        activation_notes = COALESCE(p_reason, activation_notes)
    WHERE UPPER(mac_address) = UPPER(v_mac);

    -- Force device to clear active schedules
    INSERT INTO public.command_queue (device_id, command, payload)
    VALUES (p_device_id, 'SYNC_SCHEDULES', json_build_object('reason', 'device_suspended'));

    RETURN json_build_object('success', true, 'activation_status', 'suspended');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.suspend_device(uuid, text) TO authenticated, service_role;

-- 8. Customer Submit Activation Request RPC
CREATE OR REPLACE FUNCTION public.submit_activation_request(
    p_device_id uuid,
    p_payment_ref text,
    p_notes text DEFAULT NULL,
    p_receipt_url text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_school_id uuid;
    v_request_id uuid;
BEGIN
    SELECT school_id INTO v_school_id FROM public.users WHERE id = auth.uid();

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to a school';
    END IF;

    INSERT INTO public.activation_requests (
        device_id,
        school_id,
        user_id,
        payment_reference,
        notes,
        receipt_url,
        status
    )
    VALUES (
        p_device_id,
        v_school_id,
        auth.uid(),
        p_payment_ref,
        p_notes,
        p_receipt_url,
        'pending'
    )
    RETURNING id INTO v_request_id;

    RETURN json_build_object('success', true, 'request_id', v_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.submit_activation_request(uuid, text, text, text) TO authenticated, service_role;

-- 9. Update get_device_config with Activation & Subscription Expiry Gating
CREATE OR REPLACE FUNCTION public.get_device_config(device_mac text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    
    -- Activation & Subscription variables
    v_act_status text := 'unactivated';
    v_sub_end_date timestamp with time zone;
    v_is_expired boolean := false;
    v_is_active boolean := false;
    
    -- Device pre-announcement overrides
    v_dev_pa_enabled boolean;
    v_dev_pa_id uuid;
    v_dev_pa_delay integer;
    
    -- School pre-announcement defaults
    v_school_pa_enabled boolean;
    v_school_pa_id uuid;
    v_school_pa_delay integer;
    v_resolved_pa_id uuid;
BEGIN
    SELECT 
        id, 
        school_id, 
        volume, 
        board_type,
        COALESCE(activation_status, 'pending_activation'),
        subscription_end_date
    INTO 
        v_device_id, 
        v_school_id, 
        v_volume, 
        v_board_type,
        v_act_status,
        v_sub_end_date
    FROM public.bell_devices
    WHERE UPPER(mac_address) = UPPER(device_mac);

    IF v_device_id IS NULL THEN
        RETURN json_build_object('error', 'Device not found');
    END IF;

    UPDATE public.bell_devices
    SET last_heartbeat = now(), status = 'online'
    WHERE id = v_device_id;

    -- Evaluate Subscription Expiry
    IF v_sub_end_date IS NOT NULL AND v_sub_end_date < now() THEN
        v_is_expired := true;
        v_act_status := 'expired';
    END IF;

    -- Evaluate Active Condition
    v_is_active := (v_act_status = 'active' AND NOT v_is_expired);

    -- If Device is NOT active or NOT assigned to school, return locked payload without schedules
    IF NOT v_is_active OR v_school_id IS NULL THEN
        RETURN json_build_object(
            'status', 'ok',
            'is_activated', false,
            'activation_status', v_act_status,
            'is_expired', v_is_expired,
            'subscription_end_date', v_sub_end_date,
            'school_id', v_school_id,
            'profile_name', 'Activation Required',
            'volume', COALESCE(v_volume, 21),
            'schedules', '[]'::json,
            'all_audio_files', '[]'::json
        );
    END IF;

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

    -- Fetch device-specific overrides
    SELECT 
      pre_announcement_enabled,
      pre_announcement_id,
      pre_announcement_delay_seconds
    INTO 
      v_dev_pa_enabled,
      v_dev_pa_id,
      v_dev_pa_delay
    FROM public.bell_devices
    WHERE id = v_device_id;

    -- Fetch school pre-announcement defaults
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

    -- COALESCE overrides with defaults
    v_pa_enabled := COALESCE(v_dev_pa_enabled, v_school_pa_enabled, true);
    v_pa_delay := COALESCE(v_dev_pa_delay, v_school_pa_delay, 3);
    v_resolved_pa_id := COALESCE(v_dev_pa_id, v_school_pa_id);

    -- Fetch chime sound URL based on resolved sound ID
    IF v_resolved_pa_id IS NOT NULL THEN
        SELECT COALESCE(file_url, '') INTO v_pa_url
        FROM public.pre_announcement_sounds
        WHERE id = v_resolved_pa_id;
    END IF;

    -- Fallback: If pre-announcement is enabled but URL is empty, fetch default active sound
    IF (v_pa_url IS NULL OR v_pa_url = '') THEN
        SELECT COALESCE(file_url, '') INTO v_pa_url
        FROM public.pre_announcement_sounds
        WHERE is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- Fetch strictly real Audio Manager files for the school
    SELECT json_agg(aud) INTO v_all_audio_data FROM (
        SELECT
            af.id::text as id,
            af.id::text as audio_id,
            COALESCE(REPLACE(public.urlencode(af.storage_path), '%2F', '/'), '') as audio_url,
            COALESCE(af.duration, 0) as duration,
            COALESCE(af.track_number, 1) as track_number
        FROM public.audio_files af
        WHERE af.school_id = v_school_id
          AND (af.storage_path IS NULL OR af.storage_path NOT LIKE 'combined/%')
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
                        WHEN t.precombined_at IS NOT NULL AND (v_pa_enabled OR NOT t.precombine_chime_included) THEN
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
                    COALESCE(t.precombined_at IS NOT NULL AND t.precombine_chime_included AND v_pa_enabled, false) as pc
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
                        bt.precombine_chime_included,
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
                    t.precombined_at,
                    t.precombine_chime_included
                ORDER BY t.bell_time
            ) sched;
        END IF;
    END;

    RETURN json_build_object(
        'status', 'ok',
        'is_activated', true,
        'activation_status', 'active',
        'subscription_end_date', v_sub_end_date,
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_device_config(text) TO anon, authenticated, service_role;

-- 10. Update register_device_from_esp to return activation status
CREATE OR REPLACE FUNCTION public.register_device_from_esp(
    p_mac_address text,
    p_school_code text,
    p_device_name text DEFAULT NULL,
    p_firmware_version text DEFAULT NULL,
    p_board_type text DEFAULT 'ESP32-S3 N16R8'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_school_id uuid;
    v_device_id uuid;
    v_current_school_id uuid;
    v_school_code text;
    v_message text := 'OK';
    v_result json;
    v_act_status text := 'unactivated';
    v_sub_end_date timestamp with time zone;
    v_is_active boolean := false;
BEGIN
    -- 1. Try to resolve school_code if provided
    IF p_school_code IS NOT NULL AND TRIM(p_school_code) != '' THEN
        SELECT id, school_code INTO v_school_id, v_school_code
        FROM public.schools
        WHERE school_code = TRIM(p_school_code)
           OR (TRIM(p_school_code) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND id = TRIM(p_school_code)::uuid)
        LIMIT 1;

        IF v_school_id IS NULL THEN
            v_message := 'Invalid School Code';
        ELSE
            v_message := 'OK';
        END IF;
    END IF;

    -- 2. Check if device exists
    SELECT id, school_id, COALESCE(activation_status, 'unactivated'), subscription_end_date
    INTO v_device_id, v_current_school_id, v_act_status, v_sub_end_date
    FROM public.bell_devices
    WHERE UPPER(mac_address) = UPPER(p_mac_address);

    IF v_device_id IS NOT NULL THEN
        UPDATE public.bell_devices
        SET 
            status = 'online',
            last_heartbeat = now(),
            name = COALESCE(p_device_name, name),
            firmware_version = COALESCE(p_firmware_version, firmware_version),
            board_type = COALESCE(p_board_type, board_type)
        WHERE id = v_device_id;
        
        IF v_current_school_id IS NULL AND v_school_id IS NOT NULL THEN
            UPDATE public.bell_devices
            SET school_id = v_school_id,
                activation_status = CASE WHEN activation_status = 'active' THEN 'active' ELSE 'pending_activation' END
            WHERE id = v_device_id;
            v_current_school_id := v_school_id;
            v_message := 'OK';
        ELSIF v_current_school_id IS NOT NULL THEN
            v_message := 'OK';
            SELECT school_code INTO v_school_code
            FROM public.schools
            WHERE id = v_current_school_id;
        END IF;
        
    ELSE
        -- Device does not exist: Create it as unactivated / pending_activation
        v_act_status := CASE WHEN v_school_id IS NOT NULL THEN 'pending_activation' ELSE 'unactivated' END;
        INSERT INTO public.bell_devices (
            mac_address, 
            name, 
            status, 
            school_id, 
            last_heartbeat, 
            firmware_version, 
            board_type,
            activation_status,
            is_paid
        )
        VALUES (
            p_mac_address, 
            p_device_name, 
            'online', 
            v_school_id, 
            now(), 
            p_firmware_version, 
            p_board_type,
            v_act_status,
            false
        )
        RETURNING id INTO v_device_id;
        
        v_current_school_id := v_school_id;
        IF v_school_id IS NOT NULL THEN
            v_message := 'OK';
        END IF;
    END IF;

    -- Evaluate Active condition
    IF v_sub_end_date IS NOT NULL AND v_sub_end_date < now() THEN
        v_act_status := 'expired';
    END IF;
    v_is_active := (v_act_status = 'active');

    -- 3. Construct response
    SELECT json_build_array(
        json_build_object(
            'id', v_device_id,
            'status', 'online',
            'school_id', v_current_school_id,
            'school_code', v_school_code,
            'message', v_message,
            'activation_status', v_act_status,
            'is_activated', v_is_active,
            'subscription_end_date', v_sub_end_date
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;
