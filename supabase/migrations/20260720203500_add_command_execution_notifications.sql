-- Migration: 20260720203500_add_command_execution_notifications.sql
-- Description: Enhance command insertion logging (with 'in queue' status) and add automatic trigger to log command execution completion ('success' / ran successfully) to device_logs.

-- 1. Update log_command_insert to explicitly set level = 'in queue' and clear status description
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
            v_log_message := '[In Queue] TTS Broadcast queued by ' || v_user_email || ': "' || COALESCE(NEW.payload->>'text', '') || '"';
        WHEN 'PLAY_URL' THEN
            v_log_message := '[In Queue] Audio URL Playback queued by ' || v_user_email;
        WHEN 'VOICE_NOTE' THEN
            v_log_message := '[In Queue] Voice Note queued by ' || v_user_email;
        WHEN 'STREAM_START' THEN
            v_log_message := '[In Queue] Stream Start queued by ' || v_user_email;
        WHEN 'STREAM_STOP' THEN
            v_log_message := '[In Queue] Stream Stop queued by ' || v_user_email;
        WHEN 'SET_VOLUME' THEN
            v_log_message := '[In Queue] Set Volume (' || COALESCE(NEW.payload->>'volume', 'unknown') || ') queued by ' || v_user_email;
        WHEN 'EMERGENCY_STOP' THEN
            v_log_message := '[In Queue] Emergency Stop queued by ' || v_user_email;
        WHEN 'RING' THEN
            v_log_message := '[In Queue] Manual Ring queued by ' || v_user_email;
        ELSE
            v_log_message := '[In Queue] ' || NEW.command || ' command queued by ' || v_user_email;
    END CASE;

    -- Insert into device_logs
    INSERT INTO public.device_logs (device_id, message, level, created_at)
    VALUES (
        NEW.device_id,
        v_log_message,
        'in queue',
        now()
    );

    RETURN NEW;
END;
$$;

-- 2. Create function to log when command transitions to 'executed' status (ran successfully)
CREATE OR REPLACE FUNCTION public.log_command_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_device_name text;
    v_log_message text;
BEGIN
    IF OLD.status <> NEW.status AND NEW.status = 'executed' THEN
        -- Resolve device name if possible
        SELECT name INTO v_device_name FROM public.bell_devices WHERE id = NEW.device_id;
        IF v_device_name IS NULL THEN
            v_device_name := 'Device';
        END IF;

        CASE NEW.command
            WHEN 'TTS' THEN
                v_log_message := '[Ran Successfully] TTS Broadcast executed on ' || v_device_name || ': "' || COALESCE(NEW.payload->>'text', '') || '"';
            WHEN 'PLAY_URL' THEN
                v_log_message := '[Ran Successfully] Audio URL Playback executed on ' || v_device_name;
            WHEN 'VOICE_NOTE' THEN
                v_log_message := '[Ran Successfully] Voice Note executed on ' || v_device_name;
            WHEN 'STREAM_START' THEN
                v_log_message := '[Ran Successfully] Stream started on ' || v_device_name;
            WHEN 'STREAM_STOP' THEN
                v_log_message := '[Ran Successfully] Stream stopped on ' || v_device_name;
            WHEN 'SET_VOLUME' THEN
                v_log_message := '[Ran Successfully] Volume set to ' || COALESCE(NEW.payload->>'volume', 'unknown') || ' on ' || v_device_name;
            WHEN 'EMERGENCY_STOP' THEN
                v_log_message := '[Ran Successfully] Emergency Stop executed on ' || v_device_name;
            WHEN 'RING' THEN
                v_log_message := '[Ran Successfully] Manual Ring executed on ' || v_device_name;
            ELSE
                v_log_message := '[Ran Successfully] ' || NEW.command || ' executed on ' || v_device_name;
        END CASE;

        INSERT INTO public.device_logs (device_id, message, level, created_at)
        VALUES (
            NEW.device_id,
            v_log_message,
            'success',
            now()
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Create the trigger on command_queue for status updates
DROP TRIGGER IF EXISTS trg_log_command_status_change ON public.command_queue;
CREATE TRIGGER trg_log_command_status_change
    AFTER UPDATE OF status ON public.command_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.log_command_status_change();
