-- Add ota_enabled column to users table and toggle RPC
-- Date: 2026-02-13

-- 1. Add ota_enabled column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS ota_enabled boolean DEFAULT false;

-- 2. RPC to toggle OTA permission (Super Admin only)
CREATE OR REPLACE FUNCTION toggle_user_ota(target_user_id uuid, enabled boolean)
RETURNS void
AS $$
DECLARE
    caller_role text;
BEGIN
    -- Check if caller is super_admin
    SELECT role INTO caller_role FROM public.users WHERE id = auth.uid();
    
    IF caller_role IS DISTINCT FROM 'super_admin' THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can manage OTA permissions';
    END IF;

    -- Update the target user
    UPDATE public.users
    SET ota_enabled = enabled
    WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION toggle_user_ota(uuid, boolean) TO authenticated;
