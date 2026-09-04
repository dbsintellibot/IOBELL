-- Migration: Make school_id nullable in bell_devices to allow unassigned devices to register
-- Created at: 2026-07-12T20:15:00

-- 1. Alter bell_devices table to allow school_id to be NULL
ALTER TABLE public.bell_devices ALTER COLUMN school_id DROP NOT NULL;

-- 2. Insert the new device into the inventory
INSERT INTO public.device_inventory (serial_number, mac_address)
VALUES ('SN-ACA704126C98', 'AC:A7:04:12:6C:98')
ON CONFLICT (mac_address) DO NOTHING;
