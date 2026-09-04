-- Migration: 20260707000001_bulk_device_inventory.sql
-- Description: Bulk device registration RPC & User re-creation trigger fixes

-- 1. Redefine handle_new_user to avoid conflict errors if user already exists in public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, full_name, role, email)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    'operator', -- Default role
    new.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 2. Bulk Register Inventory RPC
CREATE OR REPLACE FUNCTION public.bulk_register_inventory(p_devices jsonb)
RETURNS json AS $$
DECLARE
    v_device jsonb;
    v_serial text;
    v_mac text;
    v_clean_mac text;
    v_formatted_mac text;
    v_inserted int := 0;
    v_skipped int := 0;
    v_invalid int := 0;
    v_inserted_id uuid;
BEGIN
    -- Access Control: Enforce is_super_admin()
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Only super admins can register device inventory';
    END IF;

    -- Verify input is a JSON array
    IF jsonb_typeof(p_devices) <> 'array' THEN
        RAISE EXCEPTION 'Input must be a JSON array of devices';
    END IF;

    FOR v_device IN SELECT jsonb_array_elements(p_devices) LOOP
        v_serial := trim(v_device->>'serial_number');
        v_mac := trim(v_device->>'mac_address');

        -- Validation: check if empty or missing fields
        IF v_serial IS NULL OR v_serial = '' OR v_mac IS NULL OR v_mac = '' THEN
            v_invalid := v_invalid + 1;
            CONTINUE;
        END IF;

        -- Normalize MAC: extract alphanumeric characters and convert to uppercase
        v_clean_mac := upper(regexp_replace(v_mac, '[^0-9A-Fa-f]', '', 'g'));

        -- Ensure it has exactly 12 hex characters
        IF length(v_clean_mac) <> 12 THEN
            v_invalid := v_invalid + 1;
            CONTINUE;
        END IF;

        -- Format as XX:XX:XX:XX:XX:XX
        v_formatted_mac := substring(v_clean_mac from 1 for 2) || ':' ||
                           substring(v_clean_mac from 3 for 2) || ':' ||
                           substring(v_clean_mac from 5 for 2) || ':' ||
                           substring(v_clean_mac from 7 for 2) || ':' ||
                           substring(v_clean_mac from 9 for 2) || ':' ||
                           substring(v_clean_mac from 11 for 2);

        v_inserted_id := NULL;
        BEGIN
            INSERT INTO public.device_inventory (serial_number, mac_address)
            VALUES (v_serial, v_formatted_mac)
            ON CONFLICT (mac_address) DO NOTHING
            RETURNING id INTO v_inserted_id;

            IF v_inserted_id IS NOT NULL THEN
                v_inserted := v_inserted + 1;
            ELSE
                -- Skipped because of conflict on mac_address
                v_skipped := v_skipped + 1;
            END IF;
        EXCEPTION WHEN unique_violation THEN
            -- Skipped because of conflict on serial_number
            v_skipped := v_skipped + 1;
        END;
    END LOOP;

    RETURN json_build_object(
        'inserted', v_inserted,
        'skipped', v_skipped,
        'invalid', v_invalid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.bulk_register_inventory(jsonb) TO authenticated, service_role;

-- 3. User Invitation / Re-creation Trigger RPC
CREATE OR REPLACE FUNCTION public.recreate_auth_user_record(p_user_id uuid, p_email text)
RETURNS json AS $$
DECLARE
    v_user public.users%ROWTYPE;
    v_hashed_password text;
BEGIN
    -- Access Control: Enforce is_super_admin()
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Only super admins can recreate auth user records';
    END IF;

    -- Verify public user exists
    SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User record not found in public.users';
    END IF;

    -- Verify auth user record is missing
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
        RETURN json_build_object(
            'success', false,
            'message', 'User already exists in auth.users'
        );
    END IF;

    -- Generate a randomized bcrypt password hash using crypt & gen_salt from extensions schema
    v_hashed_password := extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 10));

    -- Insert corresponding entry into auth.users
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
        p_user_id,
        'authenticated',
        'authenticated',
        p_email,
        v_hashed_password,
        now(),
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object(
            'sub', p_user_id,
            'email', p_email,
            'email_verified', true,
            'phone_verified', false,
            'full_name', COALESCE(v_user.full_name, 'New User')
        ),
        now(),
        now(),
        FALSE,
        FALSE
    );

    -- Insert corresponding entry into auth.identities
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
        p_user_id,
        p_user_id,
        jsonb_build_object(
            'sub', p_user_id,
            'email', p_email,
            'email_verified', true,
            'phone_verified', false,
            'full_name', COALESCE(v_user.full_name, 'New User')
        ),
        'email',
        p_user_id::text,
        now(),
        now(),
        now()
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Auth user record recreated successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recreate_auth_user_record(uuid, text) TO authenticated, service_role;
