
-- Create update_heartbeat RPC for ESP32 firmware compatibility
-- The firmware calls 'update_heartbeat' with p_device_id and p_status.
-- Previous migration created 'update_device_heartbeat' which took device_mac.

CREATE OR REPLACE FUNCTION public.update_heartbeat(
  p_device_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bell_devices
  SET 
    last_heartbeat = now(),
    status = p_status
  WHERE id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_heartbeat(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_heartbeat(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_heartbeat(uuid, text) TO service_role;
