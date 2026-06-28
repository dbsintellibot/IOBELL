CREATE OR REPLACE FUNCTION register_new_school(
    school_name_input text,
    campus_name_input text,
    address_input text,
    email_input text,
    password_input text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    new_user_id uuid;
    new_school_id uuid;
    hashed_password text;
BEGIN
    -- 1. Validation: Check if user already exists
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = email_input) THEN
        RETURN json_build_object('success', false, 'message', 'User with this email already exists');
    END IF;

    -- 2. Create School
    INSERT INTO public.schools (name, campus_name, address, subscription_status)
    VALUES (school_name_input, campus_name_input, address_input, 'active')
    RETURNING id INTO new_school_id;

    -- 3. Password Hashing
    hashed_password := crypt(password_input, gen_salt('bf', 10));
    new_user_id := gen_random_uuid();

    -- 4. Create User in auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        is_sso_user,
        is_anonymous
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        email_input,
        hashed_password,
        now(),
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object('sub', new_user_id, 'email', email_input, 'email_verified', true, 'phone_verified', false),
        now(),
        now(),
        FALSE,
        FALSE
    );

    -- 5. Create Identity (Required for login)
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        new_user_id,
        new_user_id,
        jsonb_build_object('sub', new_user_id, 'email', email_input, 'email_verified', true, 'phone_verified', false),
        'email',
        now(),
        now(),
        now()
    );

    -- 6. Update/Create Public User
    -- Assuming a trigger exists that creates the user on auth.users insert.
    -- We wait for the trigger or manually insert/update.
    -- To be safe, we try update first.
    
    UPDATE public.users 
    SET role = 'admin', school_id = new_school_id 
    WHERE id = new_user_id;
    
    -- If update didn't affect any rows (trigger failed or didn't run yet), insert manually.
    IF NOT FOUND THEN
        INSERT INTO public.users (id, role, school_id)
        VALUES (new_user_id, 'admin', new_school_id);
    END IF;

    RETURN json_build_object('success', true, 'school_id', new_school_id, 'user_id', new_user_id);

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION register_new_school(text, text, text, text, text) TO anon, authenticated, service_role;
