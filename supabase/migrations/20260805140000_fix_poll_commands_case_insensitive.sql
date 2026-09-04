-- Migration: Fix poll_commands case-insensitive status matching
CREATE OR REPLACE FUNCTION public.poll_commands(device_mac text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_device_id uuid;
    v_cmd record;
BEGIN
    SELECT id INTO v_device_id FROM public.bell_devices WHERE UPPER(mac_address) = UPPER(device_mac) LIMIT 1;
    IF v_device_id IS NULL THEN
        RETURN '{"has_command": false}'::json;
    END IF;

    -- Select the oldest pending command (case-insensitive status check)
    SELECT id, command, payload INTO v_cmd 
    FROM public.command_queue 
    WHERE device_id = v_device_id AND LOWER(status) = 'pending' 
    ORDER BY created_at ASC LIMIT 1;

    IF v_cmd.id IS NOT NULL THEN
        -- Update status to 'executed'
        UPDATE public.command_queue 
        SET status = 'executed', executed_at = now() 
        WHERE id = v_cmd.id;

        RETURN json_build_object(
            'has_command', true,
            'id', v_cmd.id,
            'command', v_cmd.command,
            'payload', v_cmd.payload
        );
    END IF;

    RETURN '{"has_command": false}'::json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.poll_commands(text) TO anon, authenticated, service_role;
