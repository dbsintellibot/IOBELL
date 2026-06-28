-- Add logo_url to schools table
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url text;
