-- Create public bucket for email images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-images',
  'email-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload email images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'email-images');

-- Allow public read access
CREATE POLICY "Public read access for email images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'email-images');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own email images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'email-images' AND (storage.foldername(name))[1] = auth.uid()::text);
