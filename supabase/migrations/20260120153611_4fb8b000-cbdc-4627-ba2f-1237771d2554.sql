-- Drop the current policy that has the demo bypass
DROP POLICY IF EXISTS "Users can view their own clients or demo" ON public.clients;

-- Create a new secure policy without the demo bypass
CREATE POLICY "Users can view their own clients"
ON public.clients
FOR SELECT
USING (auth.uid() = user_id);

-- Also fix the platform_connections policy that has the same issue
DROP POLICY IF EXISTS "Users can view their clients connections or demo" ON public.platform_connections;

CREATE POLICY "Users can view their clients connections"
ON public.platform_connections
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = platform_connections.client_id
  AND clients.user_id = auth.uid()
));

-- Also fix platform_metrics policy
DROP POLICY IF EXISTS "Users can view their clients metrics or demo data" ON public.platform_metrics;

CREATE POLICY "Users can view their clients metrics"
ON public.platform_metrics
FOR SELECT
USING (EXISTS (
  SELECT 1
  FROM platform_connections pc
  JOIN clients c ON c.id = pc.client_id
  WHERE pc.id = platform_metrics.connection_id
  AND c.user_id = auth.uid()
));