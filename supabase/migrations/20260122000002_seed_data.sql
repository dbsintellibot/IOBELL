-- Seed Data for AutoBell
-- Extracted from seed.sql and converted to migration (Plain SQL version)

-- Set search path to include extensions
SET search_path = public, extensions;

-- Enable pgcrypto for password hashing if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create School
INSERT INTO public.schools (id, name, address)
VALUES ('11111111-1111-1111-1111-111111111111', 'Lincoln High School', '123 School Ln, Springfield')
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
  '22222222-2222-2222-2222-222222222222', 
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
  '33333333-3333-3333-3333-333333333333', 
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
VALUES ('22222222-2222-2222-2222-222222222222', 'Principal Skinner', 'admin', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  school_id = '11111111-1111-1111-1111-111111111111';

-- Ensure Operator record exists and is correct
INSERT INTO public.users (id, full_name, role, school_id)
VALUES ('33333333-3333-3333-3333-333333333333', 'Groundskeeper Willie', 'operator', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO UPDATE SET
  role = 'operator',
  school_id = '11111111-1111-1111-1111-111111111111';

-- 4. Create Device
INSERT INTO public.bell_devices (id, school_id, mac_address, name, status)
VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'AA:BB:CC:DD:EE:FF', 'Main Hall Bell', 'offline')
ON CONFLICT (id) DO NOTHING;

-- 5. Create Profile
INSERT INTO public.bell_profiles (id, school_id, name)
VALUES ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Regular Schedule')
ON CONFLICT (id) DO NOTHING;

-- 6. Create Bell Times
DELETE FROM public.bell_times WHERE profile_id = '55555555-5555-5555-5555-555555555555';

INSERT INTO public.bell_times (profile_id, bell_time, day_of_week)
VALUES 
('55555555-5555-5555-5555-555555555555', '08:00:00', ARRAY[1,2,3,4,5]),
('55555555-5555-5555-5555-555555555555', '09:00:00', ARRAY[1,2,3,4,5]),
('55555555-5555-5555-5555-555555555555', '12:00:00', ARRAY[1,2,3,4,5]),
('55555555-5555-5555-5555-555555555555', '15:00:00', ARRAY[1,2,3,4,5]);
