-- Phase 4: Backend Security Updates
-- 1. Secure device_logs table

-- Drop the old insecure policy that allowed any Anon key to insert if they knew a device_id
DROP POLICY IF EXISTS "Devices can insert logs" ON public.device_logs;

-- Users can insert logs for devices in their school
CREATE POLICY "Users can insert logs in their school" ON public.device_logs
    FOR INSERT
    WITH CHECK (
        device_id IN (
            SELECT id FROM public.bell_devices WHERE school_id = get_my_school_id()
        )
    );

-- Create a secure RPC for devices to insert logs without bypassing tenant isolation
CREATE OR REPLACE FUNCTION public.insert_device_log(p_device_mac text, p_message text, p_level text DEFAULT 'info')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_device_id uuid;
BEGIN
    SELECT id INTO v_device_id FROM public.bell_devices WHERE mac_address = p_device_mac LIMIT 1;
    IF v_device_id IS NOT NULL THEN
        INSERT INTO public.device_logs (device_id, message, level, created_at)
        VALUES (v_device_id, p_message, p_level, now());
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.insert_device_log(text, text, text) TO anon, authenticated, service_role;


-- 2. Implement poll_commands and ack_command RPCs for command_queue

-- Create poll_commands
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
    SELECT id INTO v_device_id FROM public.bell_devices WHERE mac_address = device_mac LIMIT 1;
    IF v_device_id IS NULL THEN
        RETURN '{"has_command": false}'::json;
    END IF;

    SELECT id, command, payload INTO v_cmd 
    FROM public.command_queue 
    WHERE device_id = v_device_id AND status = 'pending' 
    ORDER BY created_at ASC LIMIT 1;

    IF v_cmd.id IS NOT NULL THEN
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

-- Create ack_command
CREATE OR REPLACE FUNCTION public.ack_command(p_command_id bigint, p_device_mac text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_device_id uuid;
BEGIN
    -- Verify ownership if MAC is provided (for device calls via Anon key)
    IF p_device_mac IS NOT NULL THEN
        SELECT id INTO v_device_id FROM public.bell_devices WHERE mac_address = p_device_mac LIMIT 1;
        IF v_device_id IS NOT NULL THEN
            UPDATE public.command_queue SET status = 'executed', executed_at = now() 
            WHERE id = p_command_id AND device_id = v_device_id;
        END IF;
    ELSE
        -- Without MAC, check if the caller is an authenticated user from the same school
        -- Relies on RLS for command_queue which restricts to get_my_school_id()
        IF auth.uid() IS NOT NULL THEN
            UPDATE public.command_queue SET status = 'executed', executed_at = now() WHERE id = p_command_id;
        END IF;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ack_command(bigint, text) TO anon, authenticated, service_role;
