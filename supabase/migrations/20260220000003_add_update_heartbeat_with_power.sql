CREATE OR REPLACE FUNCTION public.update_heartbeat_with_power(
  p_device_id uuid,
  p_status text,
  p_input_voltage_mv integer
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
    status = p_status,
    input_voltage_mv = p_input_voltage_mv
  WHERE id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_heartbeat_with_power(uuid, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.update_heartbeat_with_power(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_heartbeat_with_power(uuid, text, integer) TO service_role;
