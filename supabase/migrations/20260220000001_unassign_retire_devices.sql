-- Add retirement fields to device_inventory
ALTER TABLE public.device_inventory
ADD COLUMN IF NOT EXISTS retired_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS retired_reason text;

-- Unassign device back to unassigned inventory
CREATE OR REPLACE FUNCTION public.unassign_device(p_device_id uuid)
RETURNS json AS $$
DECLARE
    v_device public.bell_devices%ROWTYPE;
    v_inventory public.device_inventory%ROWTYPE;
BEGIN
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Only super admins can unassign devices';
    END IF;

    SELECT * INTO v_device
    FROM public.bell_devices
    WHERE id = p_device_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Device not found or already unassigned';
    END IF;

    SELECT * INTO v_inventory
    FROM public.device_inventory
    WHERE mac_address = v_device.mac_address
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found for device with MAC %', v_device.mac_address;
    END IF;

    IF v_inventory.retired_at IS NOT NULL THEN
        RAISE EXCEPTION 'Device has been retired and cannot be unassigned';
    END IF;

    UPDATE public.device_inventory
    SET claimed_at = NULL,
        claimed_by_school_id = NULL
    WHERE id = v_inventory.id;

    DELETE FROM public.bell_devices
    WHERE id = v_device.id;

    RETURN json_build_object(
        'success', true,
        'device_id', v_device.id,
        'mac_address', v_device.mac_address,
        'previous_school_id', v_device.school_id,
        'inventory_id', v_inventory.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.unassign_device(uuid) TO authenticated, service_role;

-- Retire device so it can never be claimed again
CREATE OR REPLACE FUNCTION public.retire_device(p_device_id uuid, p_reason text)
RETURNS json AS $$
DECLARE
    v_device public.bell_devices%ROWTYPE;
    v_inventory public.device_inventory%ROWTYPE;
    v_now timestamptz := now();
BEGIN
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'Only super admins can retire devices';
    END IF;

    SELECT * INTO v_device
    FROM public.bell_devices
    WHERE id = p_device_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Device not found';
    END IF;

    SELECT * INTO v_inventory
    FROM public.device_inventory
    WHERE mac_address = v_device.mac_address
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found for device with MAC %', v_device.mac_address;
    END IF;

    IF v_inventory.retired_at IS NOT NULL THEN
        RETURN json_build_object(
            'success', true,
            'message', 'Device already retired',
            'device_id', v_device.id,
            'inventory_id', v_inventory.id,
            'retired_at', v_inventory.retired_at,
            'retired_reason', v_inventory.retired_reason
        );
    END IF;

    UPDATE public.device_inventory
    SET retired_at = v_now,
        retired_reason = COALESCE(p_reason, retired_reason),
        claimed_at = NULL,
        claimed_by_school_id = NULL
    WHERE id = v_inventory.id;

    DELETE FROM public.bell_devices
    WHERE id = v_device.id;

    RETURN json_build_object(
        'success', true,
        'device_id', v_device.id,
        'mac_address', v_device.mac_address,
        'previous_school_id', v_device.school_id,
        'inventory_id', v_inventory.id,
        'retired_at', v_now,
        'retired_reason', p_reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.retire_device(uuid, text) TO authenticated, service_role;

-- Prevent claiming retired devices
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
    WHERE serial_number = p_serial_number
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
    RETURNING id INTO v_new_device_id;

    RETURN json_build_object('success', true, 'device_id', v_new_device_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

