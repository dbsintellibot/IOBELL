-- Migration: Cleanup and Update Device Locations
-- Sanitize inputs in update_device_location and update existing database records.

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

  -- Default values if we know city and country
  IF v_city = 'Karachi' AND v_country = 'Pakistan' THEN
    IF v_area IS NULL THEN
      v_area := 'Sindh';
    END IF;
    IF v_continent IS NULL THEN
      v_continent := 'Asia';
    END IF;
  END IF;

  UPDATE public.bell_devices
  SET
    location_city = v_city,
    location_country = v_country,
    location_area = v_area,
    location_continent = v_continent,
    location_updated_at = now()
  WHERE id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_device_location(uuid, text, text, text, text) TO service_role;

-- Clean up existing records in bell_devices
UPDATE public.bell_devices
SET
  location_city = CASE WHEN lower(trim(location_city)) IN ('null', 'undefined') THEN NULL ELSE trim(location_city) END,
  location_country = CASE WHEN lower(trim(location_country)) IN ('null', 'undefined') THEN NULL ELSE trim(location_country) END,
  location_area = CASE WHEN lower(trim(location_area)) IN ('null', 'undefined') THEN NULL ELSE trim(location_area) END,
  location_continent = CASE WHEN lower(trim(location_continent)) IN ('null', 'undefined') THEN NULL ELSE trim(location_continent) END;

-- Set missing location fields specifically for Karachi, Pakistan
UPDATE public.bell_devices
SET
  location_area = COALESCE(location_area, 'Sindh'),
  location_continent = COALESCE(location_continent, 'Asia')
WHERE location_city = 'Karachi' AND location_country = 'Pakistan';
