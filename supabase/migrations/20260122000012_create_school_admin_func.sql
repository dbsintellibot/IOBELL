-- Ensure pgcrypto is enabled in extensions schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;

-- 1. Add email column to public.users if not exists
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;

-- 2. Backfill email (requires privilege to read auth.users)
DO $$
BEGIN
    UPDATE public.users u 
    SET email = a.email 
    FROM auth.users a 
    WHERE u.id = a.id 
    AND u.email IS NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not backfill emails: %', SQLERRM;
END $$;

-- 3. Update handle_new_user to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, full_name, role, email)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    'operator', -- Default role
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create create_school_admin function
CREATE OR REPLACE FUNCTION create_school_admin(
    email_input TEXT,
    password_input TEXT,
    school_name_input TEXT
) RETURNS JSONB
SECURITY DEFINER
AS $$
DECLARE
    new_user_id UUID;
    target_school_id UUID;
    hashed_password TEXT;
BEGIN
    -- Authorization Check: Ensure the caller is a Super Admin
    IF NOT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can create users';
    END IF;

    -- Validation: Check if user already exists
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = email_input) THEN
        RAISE EXCEPTION 'User with this email already exists';
    END IF;

    -- School Handling: Get existing school or create new one
    SELECT id INTO target_school_id FROM public.schools WHERE name = school_name_input LIMIT 1;
    
    IF target_school_id IS NULL THEN
        INSERT INTO public.schools (name, subscription_status) 
        VALUES (school_name_input, 'active') 
        RETURNING id INTO target_school_id;
    END IF;

    -- Password Hashing (using pgcrypto from extensions schema)
    hashed_password := extensions.crypt(password_input, extensions.gen_salt('bf', 10));

    new_user_id := extensions.gen_random_uuid();

    -- Create User in auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        invited_at,
        confirmation_token,
        confirmation_sent_at,
        recovery_token,
        recovery_sent_at,
        email_change_token_new,
        email_change,
        email_change_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        phone,
        phone_confirmed_at,
        phone_change,
        phone_change_token,
         phone_change_sent_at,
         email_change_token_current,
         email_change_confirm_status,
         banned_until,
         reauthentication_token,
         reauthentication_sent_at,
         is_sso_user,
         deleted_at,
         is_anonymous
     ) VALUES (
         '00000000-0000-0000-0000-000000000000',
         new_user_id,
         'authenticated',
         'authenticated',
         email_input,
         hashed_password,
         now(), -- email_confirmed_at
         NULL, -- invited_at
         '', -- confirmation_token
         NULL, -- confirmation_sent_at
         '', -- recovery_token
         NULL, -- recovery_sent_at
         '', -- email_change_token_new
         '', -- email_change
         NULL, -- email_change_sent_at
         NULL, -- last_sign_in_at
         '{"provider": "email", "providers": ["email"]}',
         jsonb_build_object('sub', new_user_id, 'email', email_input, 'email_verified', true, 'phone_verified', false),
         now(), -- created_at
         now(), -- updated_at
         NULL, -- phone
         NULL, -- phone_confirmed_at
         '', -- phone_change
         '', -- phone_change_token
         NULL, -- phone_change_sent_at
         '', -- email_change_token_current
         0, -- email_change_confirm_status
         NULL, -- banned_until
         '', -- reauthentication_token
         NULL, -- reauthentication_sent_at
         FALSE, -- is_sso_user
         NULL, -- deleted_at
         FALSE -- is_anonymous
     );

    -- Create Identity in auth.identities (Required for login)
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        extensions.gen_random_uuid(),
        new_user_id,
        jsonb_build_object('sub', new_user_id, 'email', email_input, 'email_verified', true, 'phone_verified', false),
        'email',
        new_user_id, -- provider_id for email is typically the user_id in supabase
        now(),
        now(),
        now()
    );

    -- Update public.users
    UPDATE public.users
    SET 
        role = 'admin', 
        school_id = target_school_id
    WHERE id = new_user_id;

    RETURN jsonb_build_object(
        'user_id', new_user_id, 
        'school_id', target_school_id,
        'email', email_input
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION create_school_admin(TEXT, TEXT, TEXT) TO authenticated;
