-- Add volume column to bell_devices
ALTER TABLE public.bell_devices ADD COLUMN IF NOT EXISTS volume integer DEFAULT 21;

-- Update RLS if necessary (usually not needed for adding a column if generic SELECT * policies exist)
-- But let's make sure users can update it.
-- Existing policy "Users can update devices in their school" should cover it.
