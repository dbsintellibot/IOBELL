-- Drop existing function to allow return type change
DROP FUNCTION IF EXISTS public.register_device_from_esp(text, text, text);

-- Create register_device_from_esp function for ESP32 firmware
CREATE OR REPLACE FUNCTION public.register_device_from_esp(
    p_mac_address text,
    p_school_code text,
    p_device_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id uuid;
    v_device_id uuid;
    v_current_school_id uuid;
    v_school_code text;
    v_message text := 'OK';
    v_result json;
BEGIN
    -- 1. Try to resolve school_code if provided
    IF p_school_code IS NOT NULL AND p_school_code != '' THEN
        SELECT id, school_code INTO v_school_id, v_school_code
        FROM schools
        WHERE school_code = p_school_code
        LIMIT 1;

        IF v_school_id IS NULL THEN
            v_message := 'Invalid School Code';
        END IF;
    END IF;

    -- 2. Check if device exists
    SELECT id, school_id INTO v_device_id, v_current_school_id
    FROM bell_devices
    WHERE mac_address = p_mac_address;

    IF v_device_id IS NOT NULL THEN
        -- Device exists: Update status and name
        UPDATE bell_devices
        SET 
            status = 'online',
            last_heartbeat = now(),
            name = COALESCE(p_device_name, name)
        WHERE id = v_device_id;
        
        -- If device is unassigned (school_id is null) AND we have a valid school code, assign it
        IF v_current_school_id IS NULL AND v_school_id IS NOT NULL THEN
            UPDATE bell_devices
            SET school_id = v_school_id
            WHERE id = v_device_id;
            v_current_school_id := v_school_id;
        ELSIF v_current_school_id IS NOT NULL THEN
            -- If already assigned, ignore the provided school code (security measure: cannot reassign via ESP without reset)
            -- But we should probably fetch the school code for the return value
            SELECT school_code INTO v_school_code
            FROM schools
            WHERE id = v_current_school_id;
        END IF;
        
    ELSE
        -- Device does not exist: Create it
        INSERT INTO bell_devices (mac_address, name, status, school_id, last_heartbeat)
        VALUES (p_mac_address, p_device_name, 'online', v_school_id, now())
        RETURNING id INTO v_device_id;
        
        v_current_school_id := v_school_id;
    END IF;

    -- 3. Construct response
    -- We need to return an array of objects to match the firmware's expectation: doc[0]
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

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.register_device_from_esp(text, text, text) TO anon, authenticated, service_role;
