-- Fix: Add missing UPDATE policy for client-assets storage bucket
-- Without this policy, uploads create 0-byte files because the file content
-- cannot be written after the initial INSERT of object metadata.

CREATE POLICY "Clients can update their own assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'client-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'client-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
