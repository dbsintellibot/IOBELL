ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS theme_mode text DEFAULT 'dark';

