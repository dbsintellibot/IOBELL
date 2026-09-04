-- Migration: 20260707000003_add_delete_user_secure.sql
-- Description: Create users_with_school view and secure user deletion RPC

-- 1. Create a view of users with their associated school name, invoking RLS of base tables
CREATE OR REPLACE VIEW public.users_with_school 
WITH (security_invoker = on) AS
SELECT 
  u.id,
  u.email,
  u.full_name,
  u.role,
  u.school_id,
  u.created_at,
  u.updated_at,
  u.tts_enabled,
  u.ota_enabled,
  u.tts_provider,
  s.name AS school_name
FROM public.users u
LEFT JOIN public.schools s ON u.school_id = s.id;

GRANT SELECT ON public.users_with_school TO authenticated;

-- 2. Create a secure, security-definer RPC function to delete users
CREATE OR REPLACE FUNCTION delete_user_secure(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Authorization Check: Ensure the caller is a Super Admin
    IF NOT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can delete users';
    END IF;

    -- Prevent self-deletion
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: You cannot delete your own account';
    END IF;

    -- Delete from auth.users (cascades to public.users)
    DELETE FROM auth.users WHERE id = target_user_id;
    
    -- Fallback explicit delete from public.users
    DELETE FROM public.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_user_secure(uuid) TO authenticated;
