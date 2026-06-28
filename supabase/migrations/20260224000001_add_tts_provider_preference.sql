-- Add TTS provider preference column for users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS tts_provider text;

-- Set default provider to device built-in (google-free) for existing users
UPDATE public.users
SET tts_provider = 'google-free'
WHERE tts_provider IS NULL;

-- Ensure new users default to device built-in TTS
ALTER TABLE public.users
ALTER COLUMN tts_provider SET DEFAULT 'google-free';

