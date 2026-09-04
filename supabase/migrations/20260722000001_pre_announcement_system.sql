-- Migration: Pre-Announcement Audio & Delay System
-- Description: Creates pre_announcement_sounds table, updates schools table, adds manage_pre_announcement_sound RPC, configures storage, and updates get_device_config.

-- 1. Create Pre-Announcement Sounds Library Table (Global, Managed by Super Admin)
CREATE TABLE IF NOT EXISTS public.pre_announcement_sounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_path TEXT NOT NULL,
    duration_ms INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add Pre-Announcement Configuration Columns to Schools Table
ALTER TABLE public.schools
ADD COLUMN IF NOT EXISTS pre_announcement_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS default_pre_announcement_id UUID REFERENCES public.pre_announcement_sounds(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pre_announcement_delay_seconds INT DEFAULT 3;

-- Add check constraint for delay duration (2 to 5 seconds)
ALTER TABLE public.schools
DROP CONSTRAINT IF EXISTS check_pre_announcement_delay_range;

ALTER TABLE public.schools
ADD CONSTRAINT check_pre_announcement_delay_range 
CHECK (pre_announcement_delay_seconds BETWEEN 2 AND 5);

-- 3. Enable RLS on pre_announcement_sounds
ALTER TABLE public.pre_announcement_sounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to active pre-announcement sounds" ON public.pre_announcement_sounds;
CREATE POLICY "Allow public read access to active pre-announcement sounds"
ON public.pre_announcement_sounds FOR SELECT
USING (is_active = true OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow super admin full access to pre-announcement sounds" ON public.pre_announcement_sounds;
CREATE POLICY "Allow super admin full access to pre-announcement sounds"
ON public.pre_announcement_sounds FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
);

-- 4. Storage Bucket for Pre-Announcements
INSERT INTO storage.buckets (id, name, public)
VALUES ('pre-announcements', 'pre-announcements', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Read Access for Pre-Announcements Storage" ON storage.objects;
CREATE POLICY "Public Read Access for Pre-Announcements Storage"
ON storage.objects FOR SELECT
USING (bucket_id = 'pre-announcements');

DROP POLICY IF EXISTS "Super Admin Manage Pre-Announcements Storage" ON storage.objects;
CREATE POLICY "Super Admin Manage Pre-Announcements Storage"
ON storage.objects FOR ALL
USING (
    bucket_id = 'pre-announcements'
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
);

-- 5. RPC: manage_pre_announcement_sound
CREATE OR REPLACE FUNCTION public.manage_pre_announcement_sound(
    p_action TEXT, -- 'ADD', 'UPDATE', 'DELETE'
    p_id UUID DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_file_url TEXT DEFAULT NULL,
    p_file_path TEXT DEFAULT NULL,
    p_duration_ms INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role TEXT;
    v_count INT;
    v_result JSONB;
BEGIN
    -- Check caller permissions
    SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
    IF v_user_role IS NULL OR v_user_role != 'super_admin' THEN
        RAISE EXCEPTION 'Access Denied: Super Admin permissions required.';
    END IF;

    IF p_action = 'ADD' THEN
        -- Enforce library limit (max 10 active sounds)
        SELECT COUNT(*) INTO v_count FROM public.pre_announcement_sounds WHERE is_active = true;
        IF v_count >= 10 THEN
            RAISE EXCEPTION 'Library full: Maximum of 10 pre-announcement sounds allowed.';
        END IF;

        INSERT INTO public.pre_announcement_sounds (title, file_url, file_path, duration_ms)
        VALUES (p_title, p_file_url, p_file_path, p_duration_ms)
        RETURNING to_jsonb(pre_announcement_sounds.*) INTO v_result;

    ELSIF p_action = 'UPDATE' THEN
        UPDATE public.pre_announcement_sounds
        SET title = COALESCE(p_title, title),
            file_url = COALESCE(p_file_url, file_url),
            file_path = COALESCE(p_file_path, file_path),
            duration_ms = COALESCE(p_duration_ms, duration_ms),
            updated_at = NOW()
        WHERE id = p_id
        RETURNING to_jsonb(pre_announcement_sounds.*) INTO v_result;

    ELSIF p_action = 'DELETE' THEN
        DELETE FROM public.pre_announcement_sounds WHERE id = p_id;
        v_result := jsonb_build_object('success', true, 'deleted_id', p_id);
    ELSE
        RAISE EXCEPTION 'Invalid action. Supported actions: ADD, UPDATE, DELETE';
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_pre_announcement_sound TO authenticated, service_role;

-- 6. Update get_device_config RPC to return pre-announcement config
CREATE OR REPLACE FUNCTION public.get_device_config(device_mac text)
RETURNS json AS $$
DECLARE
    v_device_id uuid;
    v_school_id uuid;
    v_schedule_data json;
    v_profile_name text;
    v_timezone_offset integer := 300;
    v_quiet_hours json;
    v_volume integer;
    v_pa_enabled boolean := true;
    v_pa_url text := '';
    v_pa_delay integer := 3;
BEGIN
    SELECT id, school_id, volume INTO v_device_id, v_school_id, v_volume
    FROM public.bell_devices
    WHERE mac_address = device_mac;

    IF v_device_id IS NULL THEN
        RETURN json_build_object('error', 'Device not found');
    END IF;

    UPDATE public.bell_devices
    SET last_heartbeat = now(), status = 'online'
    WHERE id = v_device_id;

    -- Fetch school quiet hours JSON
    SELECT json_build_object(
      'en', COALESCE(s.quiet_hours_enabled, false),
      'df', to_char(COALESCE(s.quiet_hours_disable_from, '21:00'::time), 'HH24:MI:SS'),
      'ea', to_char(COALESCE(s.quiet_hours_enable_at, '07:00'::time), 'HH24:MI:SS')
    )
    INTO v_quiet_hours
    FROM public.schools s
    WHERE s.id = v_school_id;

    -- Fetch school pre-announcement configuration
    SELECT 
      COALESCE(s.pre_announcement_enabled, true),
      COALESCE(pas.file_url, ''),
      COALESCE(s.pre_announcement_delay_seconds, 3)
    INTO 
      v_pa_enabled,
      v_pa_url,
      v_pa_delay
    FROM public.schools s
    LEFT JOIN public.pre_announcement_sounds pas ON s.default_pre_announcement_id = pas.id
    WHERE s.id = v_school_id;

    DECLARE
        v_active_profile_id uuid;
    BEGIN
        SELECT id, name INTO v_active_profile_id, v_profile_name
        FROM public.bell_profiles
        WHERE school_id = v_school_id AND is_active = true
        LIMIT 1;

        IF v_active_profile_id IS NULL THEN
            SELECT id, name INTO v_active_profile_id, v_profile_name
            FROM public.bell_profiles
            WHERE school_id = v_school_id
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;

        SELECT json_agg(sched) INTO v_schedule_data FROM (
            SELECT
                to_char(t.bell_time, 'HH24:MI:SS') as t,
                json_agg(DISTINCT t.d ORDER BY t.d) as d,
                COALESCE(MAX(af1.track_number), 12) as tr,
                COALESCE(MAX(af2.track_number), 0) as tr2,
                COALESCE(MAX(t.delay_seconds), 0) as ds,
                t.play_type as ty,
                COALESCE(MAX(t.tts_message), '') as tt,
                COALESCE(bool_or(t.include_weather), false) as iw,
                MAX(af1.storage_path) as audio_url,
                MAX(af1.id::text) as audio_id
            FROM (
                SELECT
                    bt.bell_time,
                    bt.audio_file_id,
                    bt.audio_file_id_2,
                    bt.delay_seconds,
                    bt.play_type,
                    bt.tts_message,
                    COALESCE(bt.include_weather, false) as include_weather,
                    unnest(bt.day_of_week) AS d
                FROM public.bell_times bt
                WHERE bt.profile_id = v_active_profile_id
            ) t
            LEFT JOIN public.audio_files af1 ON t.audio_file_id = af1.id
            LEFT JOIN public.audio_files af2 ON t.audio_file_id_2 = af2.id
            GROUP BY
                t.bell_time,
                t.audio_file_id,
                t.audio_file_id_2,
                t.play_type,
                t.tts_message,
                t.include_weather
            ORDER BY t.bell_time
        ) sched;
    END;

    RETURN json_build_object(
        'status', 'ok',
        'school_id', v_school_id,
        'timezone_offset', v_timezone_offset,
        'profile_name', COALESCE(v_profile_name, 'Unknown'),
        'volume', COALESCE(v_volume, 21),
        'qh', COALESCE(v_quiet_hours, json_build_object('en', false, 'df', '21:00:00', 'ea', '07:00:00')),
        'pa_en', COALESCE(v_pa_enabled, true),
        'pa_url', COALESCE(v_pa_url, ''),
        'pa_delay', COALESCE(v_pa_delay, 3),
        'pre_announcement_enabled', COALESCE(v_pa_enabled, true),
        'pre_announcement_url', COALESCE(v_pa_url, ''),
        'pre_announcement_delay_seconds', COALESCE(v_pa_delay, 3),
        'schedules', coalesce(v_schedule_data, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_device_config(text) TO anon, authenticated, service_role;
