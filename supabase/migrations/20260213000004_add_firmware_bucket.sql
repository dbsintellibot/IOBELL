-- Create bucket 'firmware' for OTA updates
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firmware', 
  'firmware', 
  true, -- public bucket so ESP32 can download without auth
  15728640, -- 15MB limit (ESP32 firmware is usually < 2MB, but 4MB+ partitions exist)
  ARRAY['application/octet-stream', 'application/macbinary'] -- .bin files
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Policies

-- Policy: Super Admins can upload firmware
CREATE POLICY "Super Admins can upload firmware"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'firmware' AND
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- Policy: Super Admins can update firmware
CREATE POLICY "Super Admins can update firmware"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'firmware' AND
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- Policy: Super Admins can delete firmware
CREATE POLICY "Super Admins can delete firmware"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'firmware' AND
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- Policy: Everyone (including ESP32) can read firmware
-- Since bucket is public, this is implicit for anonymous, but explicit for auth users
CREATE POLICY "Everyone can read firmware"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'firmware');
