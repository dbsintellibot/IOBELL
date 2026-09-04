-- Migration: Fix Firmware Bucket RLS Policies for OTA Uploads
-- Target Project: hjlwzkwiweocnfztshmy

-- Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firmware', 
  'firmware', 
  true, 
  15728640,
  ARRAY['application/octet-stream', 'application/macbinary', 'application/x-binary', 'application/binary']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop old super-admin restricted policies if present
DROP POLICY IF EXISTS "Super Admins can upload firmware" ON storage.objects;
DROP POLICY IF EXISTS "Super Admins can update firmware" ON storage.objects;
DROP POLICY IF EXISTS "Super Admins can delete firmware" ON storage.objects;
DROP POLICY IF EXISTS "Everyone can read firmware" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload firmware" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update firmware" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete firmware" ON storage.objects;
DROP POLICY IF EXISTS "Public read firmware" ON storage.objects;

-- Policy: Allow authenticated users (Super Admins & School Admins) to upload firmware
CREATE POLICY "Authenticated users can upload firmware"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'firmware');

-- Policy: Allow authenticated users to update firmware
CREATE POLICY "Authenticated users can update firmware"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'firmware');

-- Policy: Allow authenticated users to delete firmware
CREATE POLICY "Authenticated users can delete firmware"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'firmware');

-- Policy: Public read access for firmware download by ESP32 devices
CREATE POLICY "Public read firmware"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'firmware');
