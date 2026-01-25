-- Add is_active column to bell_profiles
ALTER TABLE public.bell_profiles 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false;

-- Create function to ensure single active profile per school
CREATE OR REPLACE FUNCTION public.ensure_single_active_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    -- Set all other profiles for this school to inactive
    UPDATE public.bell_profiles
    SET is_active = false
    WHERE school_id = NEW.school_id 
    AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_single_active_profile ON public.bell_profiles;

CREATE TRIGGER trigger_single_active_profile
BEFORE INSERT OR UPDATE OF is_active ON public.bell_profiles
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION public.ensure_single_active_profile();

-- Create RPC for device to get active schedule
CREATE OR REPLACE FUNCTION public.get_active_schedule(p_school_id uuid)
RETURNS TABLE (
    bell_time time,
    day_of_week integer[],
    audio_url text,
    duration integer
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bt.bell_time,
        bt.day_of_week,
        CASE 
            WHEN af.storage_path IS NOT NULL THEN 
                -- Assuming a standard public URL format or needing a signed URL. 
                -- For now returning the storage path or a constructed URL.
                -- Adjust base URL as needed.
                af.storage_path
            ELSE NULL
        END as audio_url,
        af.duration
    FROM public.bell_times bt
    JOIN public.bell_profiles bp ON bt.profile_id = bp.id
    LEFT JOIN public.audio_files af ON bt.audio_file_id = af.id
    WHERE bp.school_id = p_school_id
    AND bp.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
