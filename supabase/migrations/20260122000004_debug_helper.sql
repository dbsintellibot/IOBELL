CREATE OR REPLACE FUNCTION check_user_exists(email_input text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE email = email_input);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, public;

GRANT EXECUTE ON FUNCTION check_user_exists(text) TO anon, authenticated, service_role;
