-- Migration: Command Queue Compaction and De-duplication
-- Prevents slider dragging and rapid clicks from stacking tens of duplicate pending commands.

-- 1. Trigger function to auto-supersede duplicate state commands on insert
CREATE OR REPLACE FUNCTION public.compact_command_queue_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- For state commands (SET_VOLUME, SYNC_SCHEDULES, CONFIG), supersede older pending commands of same type
    IF NEW.command IN ('SET_VOLUME', 'SYNC_SCHEDULES', 'CONFIG') THEN
        UPDATE public.command_queue
        SET status = 'superseded', executed_at = now()
        WHERE device_id = NEW.device_id
          AND command = NEW.command
          AND LOWER(status) = 'pending';
    END IF;

    -- For stream control, a new STREAM_STOP supersedes any pending stream commands
    IF NEW.command = 'STREAM_STOP' THEN
        UPDATE public.command_queue
        SET status = 'superseded', executed_at = now()
        WHERE device_id = NEW.device_id
          AND command IN ('STREAM_START', 'STREAM_STOP')
          AND LOWER(status) = 'pending';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compact_command_queue ON public.command_queue;
CREATE TRIGGER trg_compact_command_queue
    BEFORE INSERT ON public.command_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.compact_command_queue_on_insert();

-- 2. Update poll_commands to auto-expire old commands and compact pending count
CREATE OR REPLACE FUNCTION public.poll_commands(device_mac text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_device_id uuid;
    v_cmd record;
    v_pending_count integer;
BEGIN
    SELECT id INTO v_device_id 
    FROM public.bell_devices 
    WHERE UPPER(mac_address) = UPPER(device_mac) 
    LIMIT 1;

    IF v_device_id IS NULL THEN
        RETURN '{"has_command": false, "pending_count": 0}'::json;
    END IF;

    -- Expire any pending commands older than 1 hour (e.g. stale manual triggers)
    UPDATE public.command_queue
    SET status = 'expired', executed_at = now()
    WHERE device_id = v_device_id
      AND LOWER(status) = 'pending'
      AND created_at < (now() - INTERVAL '1 hour');

    -- Auto-supersede duplicate SET_VOLUME keeping only the newest
    WITH latest_volume AS (
        SELECT id
        FROM public.command_queue
        WHERE device_id = v_device_id
          AND command = 'SET_VOLUME'
          AND LOWER(status) = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
    )
    UPDATE public.command_queue
    SET status = 'superseded', executed_at = now()
    WHERE device_id = v_device_id
      AND command = 'SET_VOLUME'
      AND LOWER(status) = 'pending'
      AND id NOT IN (SELECT id FROM latest_volume);

    -- Get total active pending count
    SELECT COUNT(*) INTO v_pending_count 
    FROM public.command_queue 
    WHERE device_id = v_device_id 
      AND LOWER(status) = 'pending';

    -- Select the oldest pending command
    SELECT id, command, payload INTO v_cmd 
    FROM public.command_queue 
    WHERE device_id = v_device_id 
      AND LOWER(status) = 'pending' 
    ORDER BY created_at ASC 
    LIMIT 1;

    IF v_cmd.id IS NOT NULL THEN
        -- Mark as executed immediately upon pop
        UPDATE public.command_queue 
        SET status = 'executed', executed_at = now() 
        WHERE id = v_cmd.id;

        RETURN json_build_object(
            'has_command', true,
            'id', v_cmd.id,
            'command', v_cmd.command,
            'payload', v_cmd.payload,
            'pending_count', GREATEST(v_pending_count - 1, 0)
        );
    END IF;

    RETURN json_build_object('has_command', false, 'pending_count', 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.poll_commands(text) TO anon, authenticated, service_role;

-- 3. One-time cleanup of all current backlogs in command_queue
UPDATE public.command_queue
SET status = 'superseded', executed_at = now()
WHERE LOWER(status) = 'pending'
  AND command = 'SET_VOLUME'
  AND id NOT IN (
      SELECT DISTINCT ON (device_id) id
      FROM public.command_queue
      WHERE LOWER(status) = 'pending' AND command = 'SET_VOLUME'
      ORDER BY device_id, created_at DESC
  );

UPDATE public.command_queue
SET status = 'expired', executed_at = now()
WHERE LOWER(status) = 'pending'
  AND created_at < (now() - INTERVAL '1 hour');
