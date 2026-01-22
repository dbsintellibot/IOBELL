-- Seed Data for AutoBell

DO $$
DECLARE
  v_school_id uuid := '11111111-1111-1111-1111-111111111111';
  v_admin_id uuid := '22222222-2222-2222-2222-222222222222';
  v_operator_id uuid := '33333333-3333-3333-3333-333333333333';
  v_device_id uuid := '44444444-4444-4444-4444-444444444444';
  v_profile_id uuid := '55555555-5555-5555-5555-555555555555';
BEGIN

  -- 1. Create School
  INSERT INTO public.schools (id, name, address)
  VALUES (v_school_id, 'Lincoln High School', '123 School Ln, Springfield')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create Users (in auth.users)
  -- Password is 'password123'
  
  -- Admin User
  INSERT INTO auth.users (
    id, 
    instance_id, 
    aud, 
    role, 
    email, 
    encrypted_password, 
    email_confirmed_at, 
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    v_admin_id, 
    '00000000-0000-0000-0000-000000000000', 
    'authenticated', 
    'authenticated', 
    'admin@lincoln.edu', 
    crypt('password123', gen_salt('bf')), 
    now(), 
    '{"full_name": "Principal Skinner"}',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Operator User
  INSERT INTO auth.users (
    id, 
    instance_id, 
    aud, 
    role, 
    email, 
    encrypted_password, 
    email_confirmed_at, 
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    v_operator_id, 
    '00000000-0000-0000-0000-000000000000', 
    'authenticated', 
    'authenticated', 
    'operator@lincoln.edu', 
    crypt('password123', gen_salt('bf')), 
    now(), 
    '{"full_name": "Groundskeeper Willie"}',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- 3. Link Users to School in public.users
  -- Ensure Admin record exists and is correct
  INSERT INTO public.users (id, full_name, role, school_id)
  VALUES (v_admin_id, 'Principal Skinner', 'admin', v_school_id)
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    school_id = v_school_id;

  -- Ensure Operator record exists and is correct
  INSERT INTO public.users (id, full_name, role, school_id)
  VALUES (v_operator_id, 'Groundskeeper Willie', 'operator', v_school_id)
  ON CONFLICT (id) DO UPDATE SET
    role = 'operator',
    school_id = v_school_id;

  -- 4. Create Device
  INSERT INTO public.bell_devices (id, school_id, mac_address, name, status)
  VALUES (v_device_id, v_school_id, 'AA:BB:CC:DD:EE:FF', 'Main Hall Bell', 'offline')
  ON CONFLICT (id) DO NOTHING;

  -- 5. Create Profile
  INSERT INTO public.bell_profiles (id, school_id, name)
  VALUES (v_profile_id, v_school_id, 'Regular Schedule')
  ON CONFLICT (id) DO NOTHING;

  -- 6. Create Bell Times
  DELETE FROM public.bell_times WHERE profile_id = v_profile_id;
  
  INSERT INTO public.bell_times (profile_id, bell_time, day_of_week)
  VALUES 
  (v_profile_id, '08:00:00', ARRAY[1,2,3,4,5]),
  (v_profile_id, '09:00:00', ARRAY[1,2,3,4,5]),
  (v_profile_id, '12:00:00', ARRAY[1,2,3,4,5]),
  (v_profile_id, '15:00:00', ARRAY[1,2,3,4,5]);

END $$;
