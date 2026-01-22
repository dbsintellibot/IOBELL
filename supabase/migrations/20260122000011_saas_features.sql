-- Migration: 20260122000011_saas_features.sql
-- Description: Implement SaaS features: Super Admin, Device Inventory, Subscription fields

-- 1. Update Users Table Role Check
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'admin', 'operator'));

-- 2. Update Schools Table
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS subscription_end_date timestamp with time zone;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS max_devices integer DEFAULT 10;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'due';

-- 3. Create Device Inventory Table
CREATE TABLE IF NOT EXISTS public.device_inventory (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    serial_number text UNIQUE NOT NULL,
    mac_address text UNIQUE NOT NULL,
    batch_id text,
    claimed_at timestamp with time zone,
    claimed_by_school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.device_inventory ENABLE ROW LEVEL SECURITY;

-- 4. Helper Function for Super Admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 5. RLS Policies for Device Inventory
-- Super Admin can do everything
CREATE POLICY "Super admin full access to device_inventory" ON public.device_inventory
    FOR ALL
    USING (is_super_admin());

-- 6. Claim Device Function (Security Definer)
CREATE OR REPLACE FUNCTION claim_device(p_serial_number text, p_device_name text)
RETURNS json AS $$
DECLARE
    v_school_id uuid;
    v_inventory_record public.device_inventory%ROWTYPE;
    v_new_device_id uuid;
BEGIN
    -- Get current user's school_id
    SELECT school_id INTO v_school_id FROM public.users WHERE id = auth.uid();
    
    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to a school';
    END IF;

    -- Check if user is admin
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Only school admins can claim devices';
    END IF;

    -- Find and lock the inventory record
    SELECT * INTO v_inventory_record 
    FROM public.device_inventory 
    WHERE serial_number = p_serial_number 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid Serial Number';
    END IF;

    IF v_inventory_record.claimed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Device already claimed';
    END IF;

    -- Mark as claimed
    UPDATE public.device_inventory 
    SET claimed_at = now(), claimed_by_school_id = v_school_id
    WHERE id = v_inventory_record.id;

    -- Create bell_device
    INSERT INTO public.bell_devices (mac_address, name, school_id, status)
    VALUES (v_inventory_record.mac_address, p_device_name, v_school_id, 'offline')
    RETURNING id INTO v_new_device_id;

    RETURN json_build_object('success', true, 'device_id', v_new_device_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Update RLS Policies for other tables to allow Super Admin access
-- Note: Policies are additive (OR logic), so adding these allows Super Admin access alongside existing policies.

CREATE POLICY "Super admin full access users" ON public.users FOR ALL USING (is_super_admin());
CREATE POLICY "Super admin full access schools" ON public.schools FOR ALL USING (is_super_admin());
CREATE POLICY "Super admin full access bell_devices" ON public.bell_devices FOR ALL USING (is_super_admin());
CREATE POLICY "Super admin full access audio_files" ON public.audio_files FOR ALL USING (is_super_admin());
CREATE POLICY "Super admin full access bell_profiles" ON public.bell_profiles FOR ALL USING (is_super_admin());
CREATE POLICY "Super admin full access bell_times" ON public.bell_times FOR ALL USING (is_super_admin());
CREATE POLICY "Super admin full access device_logs" ON public.device_logs FOR ALL USING (is_super_admin());
CREATE POLICY "Super admin full access command_queue" ON public.command_queue FOR ALL USING (is_super_admin());

-- 8. Function to setup super admin (to be used securely)
CREATE OR REPLACE FUNCTION setup_super_admin(p_email text)
RETURNS void AS $$
DECLARE
    v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    IF v_user_id IS NOT NULL THEN
        UPDATE public.users SET role = 'super_admin' WHERE id = v_user_id;
    ELSE
        RAISE NOTICE 'User not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
