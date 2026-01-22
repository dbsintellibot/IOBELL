CREATE OR REPLACE FUNCTION delete_user_by_email(email_input text)
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users WHERE email = email_input;
  -- Also delete from public.users if cascade didn't work (it should cascade though)
  DELETE FROM public.users WHERE id IN (SELECT id FROM auth.users WHERE email = email_input); 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, public;

GRANT EXECUTE ON FUNCTION delete_user_by_email(text) TO anon, authenticated, service_role;
