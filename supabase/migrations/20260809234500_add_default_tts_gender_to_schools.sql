-- Add default_tts_gender column to public.schools table
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS default_tts_gender text DEFAULT 'female';

-- Update existing records to ensure they have the default 'female' value if null
UPDATE public.schools 
SET default_tts_gender = 'female'
WHERE default_tts_gender IS NULL;
