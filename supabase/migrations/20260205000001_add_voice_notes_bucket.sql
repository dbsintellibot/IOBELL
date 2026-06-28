-- Create storage bucket for voice notes and TTS audio
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Public can view/stream voice notes (ESP32 needs this)
DROP POLICY IF EXISTS "Public can view voice notes" ON storage.objects;
CREATE POLICY "Public can view voice notes"
ON storage.objects FOR SELECT
USING (bucket_id = 'voice-notes');

-- Policy: School Admins can upload voice notes
-- Path convention: {school_id}/filename.mp3
DROP POLICY IF EXISTS "School Admins can upload voice notes" ON storage.objects;
CREATE POLICY "School Admins can upload voice notes"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'voice-notes' 
    AND (storage.foldername(name))[1] = get_my_school_id()::text
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Policy: School Admins can delete voice notes
DROP POLICY IF EXISTS "School Admins can delete voice notes" ON storage.objects;
CREATE POLICY "School Admins can delete voice notes"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'voice-notes' 
    AND (storage.foldername(name))[1] = get_my_school_id()::text
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
