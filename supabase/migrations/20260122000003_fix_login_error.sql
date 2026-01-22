-- Fix permissions and triggers
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- Ensure pgcrypto is available in extensions schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Drop trigger just in case it's causing issues (even if it's AFTER INSERT)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Update the function to be safer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, full_name, role)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    'operator'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Re-create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also ensure get_my_school_id has search_path
CREATE OR REPLACE FUNCTION get_my_school_id()
RETURNS uuid AS $$
  SELECT school_id FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions;
