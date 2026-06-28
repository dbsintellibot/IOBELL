-- Add tts_enabled column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS tts_enabled boolean DEFAULT false;

-- RPC to toggle TTS permission (Super Admin only)
CREATE OR REPLACE FUNCTION toggle_user_tts(target_user_id uuid, enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    caller_role text;
BEGIN
    -- Check if caller is super_admin
    SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();
    
    IF caller_role IS DISTINCT FROM 'super_admin' THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can manage TTS permissions';
    END IF;

    -- Update the target user
    UPDATE public.users
    SET tts_enabled = enabled
    WHERE id = target_user_id;
END;
$$;
