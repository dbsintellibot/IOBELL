ALTER TABLE public.bell_devices
ADD COLUMN IF NOT EXISTS location_city text,
ADD COLUMN IF NOT EXISTS location_country text,
ADD COLUMN IF NOT EXISTS location_updated_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.update_device_location(
  p_device_id uuid,
  p_location_city text,
  p_location_country text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bell_devices
  SET
    location_city = p_location_city,
    location_country = p_location_country,
    location_updated_at = now()
  WHERE id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text) TO service_role;

