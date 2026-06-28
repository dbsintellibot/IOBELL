-- Create storage bucket for school branding
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-branding', 'school-branding', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Public can view school branding
DROP POLICY IF EXISTS "Public can view school branding" ON storage.objects;
CREATE POLICY "Public can view school branding"
ON storage.objects FOR SELECT
USING (bucket_id = 'school-branding');

-- Policy: School Admins can upload their own school logo
-- Path convention: {school_id}/logo.png (or any filename)
DROP POLICY IF EXISTS "School Admins can upload branding" ON storage.objects;
CREATE POLICY "School Admins can upload branding"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'school-branding' 
    AND (storage.foldername(name))[1] = get_my_school_id()::text
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Policy: School Admins can update their own school logo
DROP POLICY IF EXISTS "School Admins can update branding" ON storage.objects;
CREATE POLICY "School Admins can update branding"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'school-branding' 
    AND (storage.foldername(name))[1] = get_my_school_id()::text
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Policy: School Admins can delete their own school logo
DROP POLICY IF EXISTS "School Admins can delete branding" ON storage.objects;
CREATE POLICY "School Admins can delete branding"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'school-branding' 
    AND (storage.foldername(name))[1] = get_my_school_id()::text
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
