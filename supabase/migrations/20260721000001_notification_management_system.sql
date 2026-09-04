-- Migration: 20260721000001_notification_management_system.sql
-- Description: Super Admin Controlled Customizable Notification Management System

-- 1. Create global_notification_settings (Super Admin Master Controls)
CREATE TABLE IF NOT EXISTS public.global_notification_settings (
    id INT PRIMARY KEY DEFAULT 1 CONSTRAINT single_row CHECK (id = 1),
    toast_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    bell_dropdown_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    webhooks_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    force_emergency_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    force_offline_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    dedup_window_seconds INT NOT NULL DEFAULT 5,
    quiet_hours_mute_routine BOOLEAN NOT NULL DEFAULT TRUE,
    global_webhook_url TEXT DEFAULT NULL,
    global_webhook_events TEXT[] DEFAULT ARRAY['EMERGENCY_STOP', 'DEVICE_OFFLINE'],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed single row for global settings
INSERT INTO public.global_notification_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 2. Create user_notification_preferences (Per-user/school customization)
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    toast_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    bell_dropdown_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_summary_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    notify_tts BOOLEAN NOT NULL DEFAULT TRUE,
    notify_voice_note BOOLEAN NOT NULL DEFAULT TRUE,
    notify_stream BOOLEAN NOT NULL DEFAULT TRUE,
    notify_ring BOOLEAN NOT NULL DEFAULT TRUE,
    notify_volume BOOLEAN NOT NULL DEFAULT TRUE,
    notify_offline BOOLEAN NOT NULL DEFAULT TRUE,
    school_webhook_url TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notif_pref_user_id ON public.user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notif_pref_school_id ON public.user_notification_preferences(school_id);

-- 3. Create outbound_webhooks (Log and audit table)
CREATE TABLE IF NOT EXISTS public.outbound_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    target_url TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    response_code INT DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_status ON public.outbound_webhooks(status);

-- 4. Enable RLS
ALTER TABLE public.global_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;

-- 4.1 RLS Policies for global_notification_settings
DROP POLICY IF EXISTS "Anyone logged in can read global notification settings" ON public.global_notification_settings;
CREATE POLICY "Anyone logged in can read global notification settings"
    ON public.global_notification_settings FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Super admins can update global notification settings" ON public.global_notification_settings;
CREATE POLICY "Super admins can update global notification settings"
    ON public.global_notification_settings FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid() AND users.role = 'super_admin'
        )
    );

-- 4.2 RLS Policies for user_notification_preferences
DROP POLICY IF EXISTS "Users can read own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can read own notification preferences"
    ON public.user_notification_preferences FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'super_admin'
        )
    );

DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can insert own notification preferences"
    ON public.user_notification_preferences FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can update own notification preferences"
    ON public.user_notification_preferences FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'super_admin'
    ));

-- 4.3 RLS Policies for outbound_webhooks
DROP POLICY IF EXISTS "Super admins can access all outbound webhooks" ON public.outbound_webhooks;
CREATE POLICY "Super admins can access all outbound webhooks"
    ON public.outbound_webhooks FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'super_admin'
        )
    );

-- 5. RPC Function: get_effective_notification_settings
CREATE OR REPLACE FUNCTION public.get_effective_notification_settings(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_user UUID;
    v_global RECORD;
    v_user RECORD;
    v_effective JSONB;
BEGIN
    v_target_user := COALESCE(p_user_id, auth.uid());

    -- Fetch global settings
    SELECT * INTO v_global FROM public.global_notification_settings WHERE id = 1;
    IF v_global IS NULL THEN
        -- Fallback default
        SELECT TRUE AS toast_enabled, TRUE AS bell_dropdown_enabled, TRUE AS email_enabled,
               TRUE AS webhooks_enabled, TRUE AS push_enabled, TRUE AS force_emergency_notifications,
               TRUE AS force_offline_notifications, 5 AS dedup_window_seconds, TRUE AS quiet_hours_mute_routine
        INTO v_global;
    END IF;

    -- Fetch user preferences
    IF v_target_user IS NOT NULL THEN
        SELECT * INTO v_user FROM public.user_notification_preferences WHERE user_id = v_target_user;
    END IF;

    -- Calculate effective settings (Super Admin Master Settings Overrides User Settings)
    v_effective := jsonb_build_object(
        'toast_enabled', (v_global.toast_enabled AND COALESCE(v_user.toast_enabled, TRUE)),
        'sound_enabled', (v_global.toast_enabled AND COALESCE(v_user.sound_enabled, TRUE)),
        'bell_dropdown_enabled', (v_global.bell_dropdown_enabled AND COALESCE(v_user.bell_dropdown_enabled, TRUE)),
        'email_enabled', (v_global.email_enabled AND COALESCE(v_user.email_summary_enabled, FALSE)),
        'webhooks_enabled', v_global.webhooks_enabled,
        'push_enabled', v_global.push_enabled,
        'force_emergency_notifications', v_global.force_emergency_notifications,
        'force_offline_notifications', v_global.force_offline_notifications,
        'notify_tts', COALESCE(v_user.notify_tts, TRUE),
        'notify_voice_note', COALESCE(v_user.notify_voice_note, TRUE),
        'notify_stream', COALESCE(v_user.notify_stream, TRUE),
        'notify_ring', COALESCE(v_user.notify_ring, TRUE),
        'notify_volume', COALESCE(v_user.notify_volume, TRUE),
        'notify_offline', (v_global.force_offline_notifications OR COALESCE(v_user.notify_offline, TRUE)),
        'notify_emergency', TRUE, -- Emergency stop is ALWAYS mandatory
        'school_webhook_url', v_user.school_webhook_url,
        'global_webhook_url', v_global.global_webhook_url,
        'dedup_window_seconds', v_global.dedup_window_seconds
    );

    RETURN v_effective;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_effective_notification_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_notification_settings(UUID) TO service_role;

-- 6. RPC Function: send_system_broadcast_notification
CREATE OR REPLACE FUNCTION public.send_system_broadcast_notification(
    p_title TEXT,
    p_message TEXT,
    p_level TEXT DEFAULT 'info'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_log_id UUID;
BEGIN
    -- Check caller is super_admin
    SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admins can dispatch system broadcast notifications.';
    END IF;

    -- Insert into device_logs with null device_id to represent system broadcast
    INSERT INTO public.device_logs (
        device_id,
        level,
        message,
        created_at
    )
    VALUES (
        NULL,
        p_level,
        '[System Broadcast] ' || p_title || ': ' || p_message,
        NOW()
    )
    RETURNING id INTO v_log_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'log_id', v_log_id,
        'message', 'System broadcast notification dispatched successfully.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_system_broadcast_notification(TEXT, TEXT, TEXT) TO authenticated;
