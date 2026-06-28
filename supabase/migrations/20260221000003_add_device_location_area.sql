ALTER TABLE public.bell_devices
ADD COLUMN IF NOT EXISTS location_area text;

DROP FUNCTION IF EXISTS public.update_device_location(uuid, text, text);

CREATE FUNCTION public.update_device_location(
  p_device_id uuid,
  p_location_city text,
  p_location_country text,
  p_location_area text DEFAULT NULL
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
    location_area = p_location_area,
    location_updated_at = now()
  WHERE id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text, text) TO service_role;
