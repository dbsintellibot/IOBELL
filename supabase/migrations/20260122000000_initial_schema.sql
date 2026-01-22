-- Re-apply schema: Drop existing tables to ensure clean state
DROP TABLE IF EXISTS public.device_logs CASCADE;
DROP TABLE IF EXISTS public.bell_times CASCADE;
DROP TABLE IF EXISTS public.bell_profiles CASCADE;
DROP TABLE IF EXISTS public.audio_files CASCADE;
DROP TABLE IF EXISTS public.bell_devices CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.schools CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create schools table
CREATE TABLE IF NOT EXISTS public.schools (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    address text,
    subscription_status text DEFAULT 'active',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. Create users table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name text,
    role text CHECK (role IN ('admin', 'operator')) DEFAULT 'operator',
    school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 3. Create bell_devices table
CREATE TABLE IF NOT EXISTS public.bell_devices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    mac_address text UNIQUE NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'offline',
    last_heartbeat timestamp with time zone,
    school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 4. Create audio_files table
CREATE TABLE IF NOT EXISTS public.audio_files (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    storage_path text NOT NULL,
    duration integer, -- duration in seconds
    school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- 5. Create bell_profiles table
CREATE TABLE IF NOT EXISTS public.bell_profiles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL, -- e.g., "Normal Day", "Exam Day"
    school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 6. Create bell_times table
CREATE TABLE IF NOT EXISTS public.bell_times (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id uuid REFERENCES public.bell_profiles(id) ON DELETE CASCADE NOT NULL,
    bell_time time NOT NULL,
    day_of_week integer[] NOT NULL, -- Array of integers (e.g., 0=Sun, 1=Mon, ..., 6=Sat)
    audio_file_id uuid REFERENCES public.audio_files(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- 7. Create device_logs table
CREATE TABLE IF NOT EXISTS public.device_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id uuid REFERENCES public.bell_devices(id) ON DELETE CASCADE NOT NULL,
    message text NOT NULL,
    level text DEFAULT 'info',
    created_at timestamp with time zone DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_logs ENABLE ROW LEVEL SECURITY;

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_users_school_id ON public.users(school_id);
CREATE INDEX IF NOT EXISTS idx_bell_devices_school_id ON public.bell_devices(school_id);
CREATE INDEX IF NOT EXISTS idx_bell_profiles_school_id ON public.bell_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_bell_times_profile_id ON public.bell_times(profile_id);
CREATE INDEX IF NOT EXISTS idx_audio_files_school_id ON public.audio_files(school_id);
CREATE INDEX IF NOT EXISTS idx_device_logs_device_id ON public.device_logs(device_id);

-- Helper function to get current user's school_id
CREATE OR REPLACE FUNCTION get_my_school_id()
RETURNS uuid AS $$
  SELECT school_id FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- --- RLS Policies ---

-- 1. Schools
-- Users can view their own school
CREATE POLICY "Users can view their own school" ON public.schools
    FOR SELECT
    USING (id = get_my_school_id());

-- 2. Users
-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT
    USING (auth.uid() = id);

-- School Admins can view all users in their school
CREATE POLICY "Admins can view users in their school" ON public.users
    FOR SELECT
    USING (
        school_id = get_my_school_id() 
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

-- School Admins can update users in their school
CREATE POLICY "Admins can update users in their school" ON public.users
    FOR UPDATE
    USING (
        school_id = get_my_school_id()
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

-- 3. Bell Devices
-- Users can view devices in their school
CREATE POLICY "Users can view devices in their school" ON public.bell_devices
    FOR SELECT
    USING (school_id = get_my_school_id());

-- Admins can manage devices
CREATE POLICY "Admins can manage devices" ON public.bell_devices
    FOR ALL
    USING (
        school_id = get_my_school_id()
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

-- Devices can read their own configuration
-- Assumption: Devices authenticate via a token containing 'mac_address' claim
CREATE POLICY "Devices can read own config" ON public.bell_devices
    FOR SELECT
    USING (mac_address = (auth.jwt() ->> 'mac_address'));

-- 4. Bell Profiles
-- Users can view profiles in their school
CREATE POLICY "Users can view profiles in their school" ON public.bell_profiles
    FOR SELECT
    USING (school_id = get_my_school_id());

-- Admins can manage profiles
CREATE POLICY "Admins can manage profiles" ON public.bell_profiles
    FOR ALL
    USING (
        school_id = get_my_school_id()
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

-- 5. Bell Times
-- Users can view times in their school
CREATE POLICY "Users can view times in their school" ON public.bell_times
    FOR SELECT
    USING (
        profile_id IN (
            SELECT id FROM public.bell_profiles WHERE school_id = get_my_school_id()
        )
    );

-- Admins can manage times
CREATE POLICY "Admins can manage times" ON public.bell_times
    FOR ALL
    USING (
        profile_id IN (
            SELECT id FROM public.bell_profiles WHERE school_id = get_my_school_id()
        )
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

-- 6. Audio Files
-- Users can view audio files in their school
CREATE POLICY "Users can view audio files in their school" ON public.audio_files
    FOR SELECT
    USING (school_id = get_my_school_id());

-- Admins can manage audio files
CREATE POLICY "Admins can manage audio files" ON public.audio_files
    FOR ALL
    USING (
        school_id = get_my_school_id()
        AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

-- 7. Device Logs
-- Users can view logs for their school
CREATE POLICY "Users can view logs in their school" ON public.device_logs
    FOR SELECT
    USING (
        device_id IN (
            SELECT id FROM public.bell_devices WHERE school_id = get_my_school_id()
        )
    );

-- Devices can write their own logs
CREATE POLICY "Devices can insert logs" ON public.device_logs
    FOR INSERT
    WITH CHECK (
        device_id IN (
            SELECT id FROM public.bell_devices 
            WHERE mac_address = (auth.jwt() ->> 'mac_address')
        )
    );
