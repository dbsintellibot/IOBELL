CREATE OR REPLACE FUNCTION setup_admin_user(email_input text, school_name text)
RETURNS void AS $$
DECLARE
  target_user_id uuid;
  target_school_id uuid;
BEGIN
  -- Get user ID
  SELECT id INTO target_user_id FROM auth.users WHERE email = email_input;
  
  -- Get school ID (assuming Lincoln High School exists from seed)
  SELECT id INTO target_school_id FROM public.schools WHERE name = school_name LIMIT 1;
  
  IF target_user_id IS NOT NULL AND target_school_id IS NOT NULL THEN
    -- Update public.users
    UPDATE public.users 
    SET role = 'admin', school_id = target_school_id
    WHERE id = target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION setup_admin_user(text, text) TO anon, authenticated, service_role;
