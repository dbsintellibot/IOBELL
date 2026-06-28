-- School Quiet Hours (per school)

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_disable_from time DEFAULT '21:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_enable_at time DEFAULT '07:00';

-- Restrict school updates to school admins (and super admins)
DROP POLICY IF EXISTS "Admins can update their own school" ON public.schools;
CREATE POLICY "Admins can update their own school" ON public.schools
  FOR UPDATE
  TO public
  USING (
    (id = get_my_school_id() AND get_my_role() = 'admin')
    OR is_super_admin()
  );

-- Remove legacy DFPlayer test-only quiet hours (replaced by per-school quiet hours)
DROP TRIGGER IF EXISTS trg_enforce_dfplayer_quiet_hours ON public.command_queue;
DROP FUNCTION IF EXISTS public.enforce_dfplayer_quiet_hours();
DROP FUNCTION IF EXISTS public.dfplayer_tests_disabled_now();
DROP TABLE IF EXISTS public.dfplayer_test_quiet_hours;

CREATE OR REPLACE FUNCTION public.is_school_quiet_hours_now(p_school_id uuid)
RETURNS boolean AS $$
DECLARE
  v_disable_from time;
  v_enable_at time;
  v_enabled boolean;
  v_now_local time;
BEGIN
  SELECT quiet_hours_disable_from, quiet_hours_enable_at, quiet_hours_enabled
  INTO v_disable_from, v_enable_at, v_enabled
  FROM public.schools
  WHERE id = p_school_id;

  IF NOT FOUND OR NOT v_enabled THEN
    RETURN false;
  END IF;

  IF v_disable_from IS NULL OR v_enable_at IS NULL THEN
    RETURN false;
  END IF;

  -- Keep same behavior as existing device config timezone offset (GMT+5)
  v_now_local := (now() AT TIME ZONE 'UTC' + make_interval(mins => 300))::time;

  IF v_disable_from = v_enable_at THEN
    RETURN false;
  END IF;

  IF v_disable_from < v_enable_at THEN
    RETURN v_now_local >= v_disable_from AND v_now_local < v_enable_at;
  ELSE
    RETURN v_now_local >= v_disable_from OR v_now_local < v_enable_at;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.enforce_school_quiet_hours()
RETURNS trigger AS $$
DECLARE
  v_school_id uuid;
  v_override boolean := false;
BEGIN
  SELECT school_id
  INTO v_school_id
  FROM public.bell_devices
  WHERE id = NEW.device_id;

  IF v_school_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payload ? 'quiet_hours_override' THEN
    v_override := COALESCE((NEW.payload ->> 'quiet_hours_override')::boolean, false);
  END IF;

  IF v_override THEN
    RETURN NEW;
  END IF;

  IF NEW.command IN (
    'RING',
    'PLAY_URL',
    'TTS',
    'VOICE_NOTE',
    'TEST_AUDIO',
    'TEST_BUZZER',
    'TEST_DFPLAYER',
    'TEST_TTS'
  ) AND public.is_school_quiet_hours_now(v_school_id) THEN
    RAISE EXCEPTION 'Quiet hours are active for this school';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_school_quiet_hours ON public.command_queue;
CREATE TRIGGER trg_enforce_school_quiet_hours
  BEFORE INSERT ON public.command_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_school_quiet_hours();

