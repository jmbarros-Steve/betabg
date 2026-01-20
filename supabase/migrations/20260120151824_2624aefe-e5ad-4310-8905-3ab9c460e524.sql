
-- Add a policy to allow reading demo data
-- First, let's add a policy for demo/public metrics viewing

-- Drop existing select policy and create a more permissive one for demo
DROP POLICY IF EXISTS "Users can view their clients metrics" ON platform_metrics;

CREATE POLICY "Users can view their clients metrics or demo data"
ON platform_metrics
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = platform_metrics.connection_id
      AND (c.user_id = auth.uid() OR c.user_id = '00000000-0000-0000-0000-000000000000')
  )
);

-- Also update platform_connections policy for demo data
DROP POLICY IF EXISTS "Users can view their clients connections" ON platform_connections;

CREATE POLICY "Users can view their clients connections or demo"
ON platform_connections
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM clients
    WHERE clients.id = platform_connections.client_id
      AND (clients.user_id = auth.uid() OR clients.user_id = '00000000-0000-0000-0000-000000000000')
  )
);

-- Update clients policy to allow viewing demo client
DROP POLICY IF EXISTS "Users can view their own clients" ON clients;

CREATE POLICY "Users can view their own clients or demo"
ON clients
FOR SELECT
USING (auth.uid() = user_id OR user_id = '00000000-0000-0000-0000-000000000000');
