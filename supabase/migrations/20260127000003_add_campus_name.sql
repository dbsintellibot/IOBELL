-- Add campus_name to schools table
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS campus_name text;
