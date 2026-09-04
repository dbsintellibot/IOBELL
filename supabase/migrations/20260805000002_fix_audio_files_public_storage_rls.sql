-- Migration: Fix audio-files bucket RLS policies for public audio streaming
-- Target Project: hjlwzkwiweocnfztshmy

-- 1. Ensure audio-files bucket is public and accepts all standard audio MIME types
UPDATE storage.buckets
SET public = true,
    file_size_limit = 15728640, -- 15MB
    allowed_mime_types = ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/webm', 'audio/m4a', 'audio/x-m4a', 'application/octet-stream']
WHERE id = 'audio-files';

-- 2. Drop legacy restrictive select policy
DROP POLICY IF EXISTS "Users can select audio files" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Access for Audio Files Storage" ON storage.objects;

-- 3. Create Public Read Access policy for audio-files bucket (matches pre-announcements policy)
CREATE POLICY "Public Read Access for Audio Files Storage"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-files');
