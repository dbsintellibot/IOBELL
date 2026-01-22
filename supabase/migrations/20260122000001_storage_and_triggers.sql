-- Enable pgcrypto for password hashing in seed (optional but good practice)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Storage Configuration
-- Create bucket 'audio-files'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-files', 
  'audio-files', 
  true, -- public bucket for easier device access
  10485760, -- 10MB limit
  ARRAY['audio/mpeg', 'audio/mp3'] -- Restrict to MP3
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Policies
-- Note: We assume a folder structure of "{school_id}/{filename}"

-- Policy: Authenticated users can upload to their school's folder
CREATE POLICY "Users can upload audio files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT school_id FROM public.users WHERE id = auth.uid()
  )
);

-- Policy: Authenticated users can update/delete their school's files
CREATE POLICY "Users can update audio files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT school_id FROM public.users WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete audio files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT school_id FROM public.users WHERE id = auth.uid()
  )
);

-- Policy: Authenticated users can read their school's files (if bucket wasn't public)
-- Since bucket is public, we technically don't need this for anonymous reads, 
-- but for authenticated users listing files, we might need SELECT permissions on objects.
CREATE POLICY "Users can select audio files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'audio-files' AND
  (storage.foldername(name))[1]::uuid IN (
    SELECT school_id FROM public.users WHERE id = auth.uid()
  )
);


-- 2. Database Triggers & Functions

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, full_name, role)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    'operator' -- Default role
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update device status (Heartbeat)
CREATE OR REPLACE FUNCTION public.update_device_heartbeat(device_mac text)
RETURNS void AS $$
BEGIN
  UPDATE public.bell_devices
  SET 
    last_heartbeat = now(),
    status = 'online'
  WHERE mac_address = device_mac;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to the heartbeat function
GRANT EXECUTE ON FUNCTION public.update_device_heartbeat(text) TO anon, authenticated, service_role;
