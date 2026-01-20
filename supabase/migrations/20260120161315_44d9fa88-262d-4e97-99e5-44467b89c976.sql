-- CRITICAL: Remove unencrypted token columns to prevent credential theft
-- The encrypted versions (_encrypted suffix) are already in use by edge functions
ALTER TABLE public.platform_connections 
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS api_key,
  DROP COLUMN IF EXISTS refresh_token;

-- Add DELETE policy for platform_metrics to allow users to manage their data
CREATE POLICY "Users can delete metrics for their clients"
ON public.platform_metrics
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = platform_metrics.connection_id
    AND c.user_id = auth.uid()
  )
);