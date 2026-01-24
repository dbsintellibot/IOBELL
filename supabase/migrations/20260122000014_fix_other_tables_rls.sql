-- Fix RLS policies for other tables to use safe functions and avoid recursion

-- 1. bell_profiles
DROP POLICY IF EXISTS "Users can view profiles in their school" ON bell_profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON bell_profiles;

CREATE POLICY "Users can view profiles in their school"
ON bell_profiles FOR SELECT
TO authenticated
USING (
  school_id = get_my_school_id() OR is_super_admin()
);

CREATE POLICY "Admins can manage profiles"
ON bell_profiles FOR ALL
TO authenticated
USING (
  (school_id = get_my_school_id() AND get_my_role() = 'admin') OR is_super_admin()
);

-- 2. audio_files
DROP POLICY IF EXISTS "Users can view audio files in their school" ON audio_files;
DROP POLICY IF EXISTS "Admins can manage audio files" ON audio_files;

CREATE POLICY "Users can view audio files in their school"
ON audio_files FOR SELECT
TO authenticated
USING (
  school_id = get_my_school_id() OR is_super_admin()
);

CREATE POLICY "Admins can manage audio files"
ON audio_files FOR ALL
TO authenticated
USING (
  (school_id = get_my_school_id() AND get_my_role() = 'admin') OR is_super_admin()
);

-- 3. bell_times
-- bell_times relies on bell_profiles, so we just need to ensure the subquery is efficient/safe.
-- The existing policy checks profile_id IN (SELECT id FROM bell_profiles WHERE school_id = get_my_school_id())
-- This is safe because get_my_school_id() is SECURITY DEFINER.
-- But the "Admins can manage times" policy likely uses the unsafe EXISTS(users) pattern.

DROP POLICY IF EXISTS "Admins can manage times" ON bell_times;

CREATE POLICY "Admins can manage times"
ON bell_times FOR ALL
TO authenticated
USING (
  (profile_id IN (
    SELECT id FROM bell_profiles 
    WHERE school_id = get_my_school_id()
  ) AND get_my_role() = 'admin') 
  OR is_super_admin()
);

-- 4. bell_schedules (legacy/device-direct) - Optional cleanup or fix if used
-- For now, we focus on the requested features (profiles/audio).
