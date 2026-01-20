-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Only admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Add client_user_id to clients table to link clients to their user accounts
ALTER TABLE public.clients 
ADD COLUMN client_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_clients_client_user_id ON public.clients(client_user_id);

-- RLS policy for clients to view their own data
CREATE POLICY "Clients can view their own client record"
ON public.clients
FOR SELECT
USING (auth.uid() = client_user_id);

-- RLS policy for clients to view their own platform connections
CREATE POLICY "Clients can view their own connections"
ON public.platform_connections
FOR SELECT
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE client_user_id = auth.uid()
  )
);

-- RLS policy for clients to insert their own connections
CREATE POLICY "Clients can insert their own connections"
ON public.platform_connections
FOR INSERT
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE client_user_id = auth.uid()
  )
);

-- RLS policy for clients to view their own metrics
CREATE POLICY "Clients can view their own metrics"
ON public.platform_metrics
FOR SELECT
USING (
  connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid()
  )
);