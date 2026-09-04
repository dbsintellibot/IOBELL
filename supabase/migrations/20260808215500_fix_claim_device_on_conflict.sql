-- Migration: Fix claim_device to handle ON CONFLICT for existing unassigned mac_address in bell_devices
-- Created at: 2026-08-08T21:55:00

CREATE OR REPLACE FUNCTION public.claim_device(p_serial_number text, p_device_name text)
RETURNS json AS $$
DECLARE
    v_school_id uuid;
    v_inventory_record public.device_inventory%ROWTYPE;
    v_new_device_id uuid;
BEGIN
    SELECT school_id INTO v_school_id FROM public.users WHERE id = auth.uid();

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to a school';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Only school admins can claim devices';
    END IF;

    SELECT * INTO v_inventory_record
    FROM public.device_inventory
    WHERE UPPER(serial_number) = UPPER(p_serial_number)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid Serial Number';
    END IF;

    IF v_inventory_record.retired_at IS NOT NULL THEN
        RAISE EXCEPTION 'Device has been retired and cannot be claimed';
    END IF;

    IF v_inventory_record.claimed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Device already claimed';
    END IF;

    UPDATE public.device_inventory
    SET claimed_at = now(),
        claimed_by_school_id = v_school_id
    WHERE id = v_inventory_record.id;

    INSERT INTO public.bell_devices (mac_address, name, school_id, status)
    VALUES (v_inventory_record.mac_address, p_device_name, v_school_id, 'offline')
    ON CONFLICT (mac_address) DO UPDATE
    SET school_id = EXCLUDED.school_id,
        name = EXCLUDED.name
    RETURNING id INTO v_new_device_id;

    RETURN json_build_object('success', true, 'device_id', v_new_device_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.claim_device(text, text) TO authenticated, service_role;
