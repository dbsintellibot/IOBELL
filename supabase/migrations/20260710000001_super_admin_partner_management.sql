-- Alter partners table status check constraint to include 'pending_approval'
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_status_check;
ALTER TABLE public.partners ADD CONSTRAINT partners_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'pending_approval'));
ALTER TABLE public.partners ALTER COLUMN status SET DEFAULT 'pending_approval';

-- Create create_partner function for Super Admin
CREATE OR REPLACE FUNCTION public.create_partner(
    email_input TEXT,
    password_input TEXT,
    company_name_input TEXT,
    region_input TEXT,
    tier_id_input UUID
) RETURNS JSONB
SECURITY DEFINER
AS $$
DECLARE
    new_user_id UUID;
    hashed_password TEXT;
    new_partner_id UUID;
BEGIN
    -- Authorization Check: Ensure the caller is a Super Admin
    IF NOT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can create partners';
    END IF;

    -- Validation: Check if user already exists
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = email_input) THEN
        RAISE EXCEPTION 'User with this email already exists';
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
        new_user_id,
        now(),
        now(),
        now()
    );

    -- Update public.users
    UPDATE public.users
    SET 
        role = 'partner',
        email = email_input
    WHERE id = new_user_id;

    -- Create partner profile
    INSERT INTO public.partners (
        user_id,
        company_name,
        region,
        tier_id,
        status
    ) VALUES (
        new_user_id,
        company_name_input,
        region_input,
        tier_id_input,
        'pending_approval'
    )
    RETURNING id INTO new_partner_id;

    RETURN jsonb_build_object(
        'user_id', new_user_id, 
        'partner_id', new_partner_id,
        'email', email_input
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION create_partner(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
