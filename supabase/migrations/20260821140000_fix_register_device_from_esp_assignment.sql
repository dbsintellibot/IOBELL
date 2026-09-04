-- Migration: Fix register_device_from_esp to ensure assigned devices remain active and resolve UUID school IDs
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
BEGIN
    -- 1. Try to resolve school_code if provided (supports both school_code text and school UUID)
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
    SELECT id, school_id INTO v_device_id, v_current_school_id
    FROM public.bell_devices
    WHERE mac_address = p_mac_address;

    IF v_device_id IS NOT NULL THEN
        -- Device exists: Update status, heartbeat, name, firmware version, and board type
        UPDATE public.bell_devices
        SET 
            status = 'online',
            last_heartbeat = now(),
            name = COALESCE(p_device_name, name),
            firmware_version = COALESCE(p_firmware_version, firmware_version),
            board_type = COALESCE(p_board_type, board_type)
        WHERE id = v_device_id;
        
        -- If device is unassigned in DB (school_id is null) AND a valid school was resolved from code, assign it
        IF v_current_school_id IS NULL AND v_school_id IS NOT NULL THEN
            UPDATE public.bell_devices
            SET school_id = v_school_id
            WHERE id = v_device_id;
            v_current_school_id := v_school_id;
            v_message := 'OK';
        ELSIF v_current_school_id IS NOT NULL THEN
            -- Device is ALREADY assigned to a school in DB:
            -- Always ensure message is 'OK' so firmware never resets to unassigned
            v_message := 'OK';
            SELECT school_code INTO v_school_code
            FROM public.schools
            WHERE id = v_current_school_id;
        END IF;
        
    ELSE
        -- Device does not exist: Create it
        INSERT INTO public.bell_devices (mac_address, name, status, school_id, last_heartbeat, firmware_version, board_type)
        VALUES (p_mac_address, p_device_name, 'online', v_school_id, now(), p_firmware_version, p_board_type)
        RETURNING id INTO v_device_id;
        
        v_current_school_id := v_school_id;
        IF v_school_id IS NOT NULL THEN
            v_message := 'OK';
        END IF;
    END IF;

    -- 3. Construct response
    -- Return an array of objects to match the firmware's expectation: doc[0]
    SELECT json_build_array(
        json_build_object(
            'id', v_device_id,
            'status', 'online',
            'school_id', v_current_school_id,
            'school_code', v_school_code,
            'message', v_message
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;
