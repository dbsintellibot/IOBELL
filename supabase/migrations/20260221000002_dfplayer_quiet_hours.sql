-- DFPlayer Test Quiet Hours configuration

CREATE TABLE IF NOT EXISTS public.dfplayer_test_quiet_hours (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    disable_from time NOT NULL,
    enable_at time NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.dfplayer_test_quiet_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin full access dfplayer_test_quiet_hours" ON public.dfplayer_test_quiet_hours;
CREATE POLICY "Super admin full access dfplayer_test_quiet_hours" ON public.dfplayer_test_quiet_hours
    FOR ALL
    USING (is_super_admin());

CREATE OR REPLACE FUNCTION public.dfplayer_tests_disabled_now()
RETURNS boolean AS $$
DECLARE
    v_disable_from time;
    v_enable_at time;
    v_enabled boolean;
    v_now_local time;
BEGIN
    SELECT disable_from, enable_at, enabled
    INTO v_disable_from, v_enable_at, v_enabled
    FROM public.dfplayer_test_quiet_hours
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND OR NOT v_enabled THEN
        RETURN false;
    END IF;

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

CREATE OR REPLACE FUNCTION public.enforce_dfplayer_quiet_hours()
RETURNS trigger AS $$
BEGIN
    IF NEW.command = 'TEST_AUDIO' AND public.dfplayer_tests_disabled_now() THEN
        RAISE EXCEPTION 'DFPlayer test commands are disabled during quiet hours';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_dfplayer_quiet_hours ON public.command_queue;
CREATE TRIGGER trg_enforce_dfplayer_quiet_hours
    BEFORE INSERT ON public.command_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_dfplayer_quiet_hours();

