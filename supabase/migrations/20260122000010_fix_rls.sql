-- Migration: 20260122000010_fix_rls.sql
-- Description: Security Audit & Storage Setup - Enforce RLS and Storage Policies

-- 1. Ensure RLS is enabled on all tables
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bell_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bell_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bell_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.device_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.command_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schools ENABLE ROW LEVEL SECURITY;

-- 2. Storage Configuration
-- Ensure audio-files bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-files', 
  'audio-files', 
  true, -- public bucket
  10485760, -- 10MB
  ARRAY['audio/mpeg', 'audio/mp3']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Storage Policies (Refined)
-- Drop existing policies to ensure clean slate for these specific ones
DROP POLICY IF EXISTS "Users can upload audio files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update audio files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete audio files" ON storage.objects;
DROP POLICY IF EXISTS "Users can select audio files" ON storage.objects;

-- Re-create policies enforcing school_id folder structure
-- Upload
CREATE POLICY "Users can upload audio files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT school_id FROM public.users WHERE id = auth.uid()
  )
);

-- Update
CREATE POLICY "Users can update audio files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT school_id FROM public.users WHERE id = auth.uid()
  )
);

-- Delete
CREATE POLICY "Users can delete audio files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT school_id FROM public.users WHERE id = auth.uid()
  )
);

-- Select (for listing files in the dashboard)
CREATE POLICY "Users can select audio files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT school_id FROM public.users WHERE id = auth.uid()
  )
);
