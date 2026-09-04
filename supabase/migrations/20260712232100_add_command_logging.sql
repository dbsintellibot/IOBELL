-- Migration: 20260712232100_add_command_logging.sql
-- Description: Add a trigger to log command insertions to device_logs, tracking the user, message/payload, and date/time.

-- 1. Create or replace function to log command queue insertions
CREATE OR REPLACE FUNCTION public.log_command_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_email text;
    v_log_message text;
BEGIN
    -- Resolve inserting user's email if possible
    IF auth.uid() IS NOT NULL THEN
        SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
    END IF;

    -- Fallback for email
    IF v_user_email IS NULL THEN
        v_user_email := 'System/Device';
    END IF;

    -- Format log message based on command type
    CASE NEW.command
        WHEN 'TTS' THEN
            v_log_message := 'TTS Broadcast by ' || v_user_email || ': "' || COALESCE(NEW.payload->>'text', '') || '"';
        WHEN 'PLAY_URL' THEN
            v_log_message := 'Audio URL Playback by ' || v_user_email || ' (URL: ' || COALESCE(NEW.payload->>'url', '') || ')';
        WHEN 'VOICE_NOTE' THEN
            v_log_message := 'Voice Note Broadcast by ' || v_user_email || ' (URL: ' || COALESCE(NEW.payload->>'url', '') || ')';
        WHEN 'STREAM_START' THEN
            v_log_message := 'Stream Started by ' || v_user_email || ' (URL: ' || COALESCE(NEW.payload->>'url', '') || ')';
        WHEN 'STREAM_STOP' THEN
            v_log_message := 'Stream Stopped by ' || v_user_email;
        WHEN 'SET_VOLUME' THEN
            v_log_message := 'Volume Set to ' || COALESCE(NEW.payload->>'volume', 'unknown') || ' by ' || v_user_email;
        ELSE
            v_log_message := NEW.command || ' command triggered by ' || v_user_email;
    END CASE;

    -- Insert into device_logs
    INSERT INTO public.device_logs (device_id, message, level, created_at)
    VALUES (
        NEW.device_id,
        v_log_message,
        'info',
        now()
    );

    RETURN NEW;
END;
$$;

-- 2. Create the trigger on command_queue
DROP TRIGGER IF EXISTS trg_log_command_insert ON public.command_queue;
CREATE TRIGGER trg_log_command_insert
    AFTER INSERT ON public.command_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.log_command_insert();
