CREATE OR REPLACE FUNCTION confirm_user_email(email_input text)
RETURNS void AS $$
BEGIN
  UPDATE auth.users 
  SET email_confirmed_at = now() 
  WHERE email = email_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, public;

GRANT EXECUTE ON FUNCTION confirm_user_email(text) TO anon, authenticated, service_role;
