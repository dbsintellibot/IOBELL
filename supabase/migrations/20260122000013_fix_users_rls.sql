-- Fix RLS recursion on public.users by using SECURITY DEFINER functions

-- 1. Helper function to get current user's role safely (bypassing RLS)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 2. Ensure get_my_school_id is also safe and defined
CREATE OR REPLACE FUNCTION get_my_school_id()
RETURNS uuid
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT school_id FROM public.users WHERE id = auth.uid();
$$;

-- 3. Drop existing problematic policies on public.users
DROP POLICY IF EXISTS "Admins can view users in their school" ON public.users;
DROP POLICY IF EXISTS "Admins can update users in their school" ON public.users;

-- 4. Re-create policies using the safe functions to avoid recursion
CREATE POLICY "Admins can view users in their school"
ON public.users
FOR SELECT
TO authenticated
USING (
  (get_my_role() = 'admin' OR is_super_admin()) AND 
  (school_id = get_my_school_id() OR is_super_admin())
);
-- Note: is_super_admin() is already included in "Super admin full access users" policy, 
-- but adding it here doesn't hurt. 
-- Actually, let's keep it simple and match the intent: Admins seeing their school's users.
-- Super admins usually have their own policy "Super admin full access users" which covers everything.
-- So we just need to fix the admin policy.

DROP POLICY IF EXISTS "Admins can view users in their school" ON public.users;
CREATE POLICY "Admins can view users in their school"
ON public.users
FOR SELECT
TO authenticated
USING (
  get_my_role() = 'admin' AND school_id = get_my_school_id()
);

DROP POLICY IF EXISTS "Admins can update users in their school" ON public.users;
CREATE POLICY "Admins can update users in their school"
ON public.users
FOR UPDATE
TO authenticated
USING (
  get_my_role() = 'admin' AND school_id = get_my_school_id()
);
