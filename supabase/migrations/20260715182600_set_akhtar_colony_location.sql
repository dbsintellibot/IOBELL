-- Migration: Set Akhtar Colony Location
-- Prevent update_device_location from overwriting non-null location data with NULL,
-- and set the location of existing Karachi devices to Akhtar Colony.

CREATE OR REPLACE FUNCTION public.update_device_location(
  p_device_id uuid,
  p_location_city text,
  p_location_country text,
  p_location_area text DEFAULT NULL,
  p_location_continent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city text;
  v_country text;
  v_area text;
  v_continent text;
BEGIN
  -- Sanitize inputs
  v_city := NULLIF(TRIM(p_location_city), '');
  IF lower(v_city) = 'null' OR lower(v_city) = 'undefined' THEN
    v_city := NULL;
  END IF;

  v_country := NULLIF(TRIM(p_location_country), '');
  IF lower(v_country) = 'null' OR lower(v_country) = 'undefined' THEN
    v_country := NULL;
  END IF;

  v_area := NULLIF(TRIM(p_location_area), '');
  IF lower(v_area) = 'null' OR lower(v_area) = 'undefined' THEN
    v_area := NULL;
  END IF;

  v_continent := NULLIF(TRIM(p_location_continent), '');
  IF lower(v_continent) = 'null' OR lower(v_continent) = 'undefined' THEN
    v_continent := NULL;
  END IF;

  -- Default values if we know city and country and area is still empty
  IF v_city = 'Karachi' AND v_country = 'Pakistan' THEN
    IF v_area IS NULL THEN
      v_area := 'Akhtar Colony';
    END IF;
    IF v_continent IS NULL THEN
      v_continent := 'Asia';
    END IF;
  END IF;

  UPDATE public.bell_devices
  SET
    location_city = COALESCE(v_city, location_city),
    location_country = COALESCE(v_country, location_country),
    location_area = COALESCE(v_area, location_area),
    location_continent = COALESCE(v_continent, location_continent),
    location_updated_at = now()
  WHERE id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text, text, text) TO service_role;

-- Update the location of existing Karachi, Pakistan devices to Akhtar Colony
UPDATE public.bell_devices
SET
  location_area = 'Akhtar Colony',
  location_continent = 'Asia'
WHERE location_city = 'Karachi' AND location_country = 'Pakistan';
