-- Complete Schema (consolidated from 44 migrations)
-- Generated: 2026-02-26 20:45:09 UTC

-- ============================================
-- Migration: 20260120131025_dfa41d31-24b7-4615-a7b9-1a03dbfe2e79.sql
-- ============================================
-- Create clients table
CREATE TABLE public.clients (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    company TEXT,
    hourly_rate DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create time entries table
CREATE TABLE public.time_entries (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    hours DECIMAL(5, 2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    billed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invoices table
CREATE TABLE public.invoices (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    total_hours DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clients
CREATE POLICY "Users can view their own clients" 
ON public.clients FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clients" 
ON public.clients FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" 
ON public.clients FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" 
ON public.clients FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies for time_entries
CREATE POLICY "Users can view their own time entries" 
ON public.time_entries FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own time entries" 
ON public.time_entries FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own time entries" 
ON public.time_entries FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own time entries" 
ON public.time_entries FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies for invoices
CREATE POLICY "Users can view their own invoices" 
ON public.invoices FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own invoices" 
ON public.invoices FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices" 
ON public.invoices FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices" 
ON public.invoices FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- Migration: 20260120133643_74226e64-69d8-4fc2-8b3d-f6777077b27f.sql
-- ============================================
-- Create blog_posts table (public)
CREATE TABLE public.blog_posts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT,
    category TEXT,
    published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create study_resources table (protected)
CREATE TABLE public.study_resources (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    resource_type TEXT NOT NULL DEFAULT 'article',
    duration TEXT,
    published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;

-- Blog posts: Public read for published, owner can do everything
CREATE POLICY "Anyone can view published blog posts" 
ON public.blog_posts FOR SELECT 
USING (published = true);

CREATE POLICY "Owners can view all their blog posts" 
ON public.blog_posts FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Owners can create blog posts" 
ON public.blog_posts FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their blog posts" 
ON public.blog_posts FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete their blog posts" 
ON public.blog_posts FOR DELETE 
USING (auth.uid() = user_id);

-- Study resources: Only authenticated users can read published, owner can do everything
CREATE POLICY "Authenticated users can view published study resources" 
ON public.study_resources FOR SELECT 
TO authenticated
USING (published = true);

CREATE POLICY "Owners can view all their study resources" 
ON public.study_resources FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Owners can create study resources" 
ON public.study_resources FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their study resources" 
ON public.study_resources FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete their study resources" 
ON public.study_resources FOR DELETE 
USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_blog_posts_updated_at
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_study_resources_updated_at
BEFORE UPDATE ON public.study_resources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- Migration: 20260120135226_cf377483-a956-4066-ba90-f93c0e05dca5.sql
-- ============================================
-- Create enum for platform types
CREATE TYPE public.platform_type AS ENUM ('shopify', 'meta', 'google');

-- Create table to store platform connections for clients
CREATE TABLE public.platform_connections (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    platform platform_type NOT NULL,
    store_name TEXT, -- For Shopify
    store_url TEXT, -- Shopify store URL
    access_token TEXT, -- Encrypted API token
    refresh_token TEXT, -- For OAuth refresh
    api_key TEXT, -- For platforms that use API keys
    account_id TEXT, -- Meta Ad Account ID or Google Account ID
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(client_id, platform)
);

-- Enable RLS
ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;

-- Only the owner (consultant) can manage connections
CREATE POLICY "Users can view their clients connections"
ON public.platform_connections
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.clients 
        WHERE clients.id = platform_connections.client_id 
        AND clients.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create connections for their clients"
ON public.platform_connections
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.clients 
        WHERE clients.id = platform_connections.client_id 
        AND clients.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their clients connections"
ON public.platform_connections
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.clients 
        WHERE clients.id = platform_connections.client_id 
        AND clients.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their clients connections"
ON public.platform_connections
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.clients 
        WHERE clients.id = platform_connections.client_id 
        AND clients.user_id = auth.uid()
    )
);

-- Create table to store synced metrics/KPIs
CREATE TABLE public.platform_metrics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    metric_type TEXT NOT NULL, -- 'revenue', 'orders', 'sessions', 'ad_spend', 'impressions', 'clicks', 'roas'
    metric_value NUMERIC NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(connection_id, metric_date, metric_type)
);

-- Enable RLS
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;

-- Users can view metrics for their clients
CREATE POLICY "Users can view their clients metrics"
ON public.platform_metrics
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.platform_connections pc
        JOIN public.clients c ON c.id = pc.client_id
        WHERE pc.id = platform_metrics.connection_id 
        AND c.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert metrics for their clients"
ON public.platform_metrics
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.platform_connections pc
        JOIN public.clients c ON c.id = pc.client_id
        WHERE pc.id = platform_metrics.connection_id 
        AND c.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update metrics for their clients"
ON public.platform_metrics
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.platform_connections pc
        JOIN public.clients c ON c.id = pc.client_id
        WHERE pc.id = platform_metrics.connection_id 
        AND c.user_id = auth.uid()
    )
);

-- Add trigger for updated_at
CREATE TRIGGER update_platform_connections_updated_at
BEFORE UPDATE ON public.platform_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- Migration: 20260120151824_2624aefe-e5ad-4310-8905-3ab9c460e524.sql
-- ============================================

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

-- ============================================
-- Migration: 20260120153611_4fb8b000-cbdc-4627-ba2f-1237771d2554.sql
-- ============================================
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
-- ============================================
-- Migration: 20260120155413_bd6ce71a-f35d-435b-aacb-941fbc74b8ab.sql
-- ============================================
-- Enable pgsodium extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create an encryption key for platform tokens
SELECT pgsodium.create_key(
  name := 'platform_tokens_key',
  key_type := 'aead-det'
);

-- Create function to encrypt a token
CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_id UUID;
  encrypted BYTEA;
BEGIN
  IF raw_token IS NULL OR raw_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Get the encryption key
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'platform_tokens_key' LIMIT 1;
  
  IF key_id IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found';
  END IF;
  
  -- Encrypt the token using AEAD deterministic encryption
  encrypted := pgsodium.crypto_aead_det_encrypt(
    raw_token::bytea,
    ''::bytea,  -- additional data
    key_id
  );
  
  -- Return as base64 string for storage
  RETURN encode(encrypted, 'base64');
END;
$$;

-- Create function to decrypt a token
CREATE OR REPLACE FUNCTION public.decrypt_platform_token(encrypted_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_id UUID;
  decrypted BYTEA;
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Get the encryption key
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'platform_tokens_key' LIMIT 1;
  
  IF key_id IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found';
  END IF;
  
  -- Decrypt the token
  decrypted := pgsodium.crypto_aead_det_decrypt(
    decode(encrypted_token, 'base64'),
    ''::bytea,  -- additional data  
    key_id
  );
  
  RETURN convert_from(decrypted, 'UTF8');
END;
$$;

-- Add encrypted columns to platform_connections
ALTER TABLE public.platform_connections 
ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT;

-- Migrate existing tokens to encrypted columns
UPDATE public.platform_connections 
SET 
  access_token_encrypted = public.encrypt_platform_token(access_token),
  refresh_token_encrypted = public.encrypt_platform_token(refresh_token),
  api_key_encrypted = public.encrypt_platform_token(api_key)
WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR api_key IS NOT NULL;

-- After migration, clear the plaintext columns (keeping for rollback ability)
-- In production, you would drop these columns after verification:
-- ALTER TABLE public.platform_connections DROP COLUMN access_token;
-- ALTER TABLE public.platform_connections DROP COLUMN refresh_token;
-- ALTER TABLE public.platform_connections DROP COLUMN api_key;

-- For now, we'll nullify them to prevent exposure
UPDATE public.platform_connections 
SET 
  access_token = NULL,
  refresh_token = NULL,
  api_key = NULL
WHERE access_token_encrypted IS NOT NULL 
   OR refresh_token_encrypted IS NOT NULL 
   OR api_key_encrypted IS NOT NULL;

-- Grant execute on encryption functions to authenticated users (through edge functions)
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_platform_token(TEXT) TO service_role;

-- Revoke from anon and authenticated to ensure only service_role can use these
REVOKE EXECUTE ON FUNCTION public.encrypt_platform_token(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_platform_token(TEXT) FROM anon, authenticated;
-- ============================================
-- Migration: 20260120155737_6a2b08f7-ff6d-427b-b3bc-1edc69b643de.sql
-- ============================================
-- Create a public view for blog posts that excludes user_id to prevent enumeration
CREATE OR REPLACE VIEW public.public_blog_posts AS
SELECT 
  id,
  title,
  excerpt,
  content,
  category,
  published,
  created_at,
  updated_at
FROM public.blog_posts
WHERE published = true;

-- Grant access to the view for anonymous and authenticated users
GRANT SELECT ON public.public_blog_posts TO anon, authenticated;

-- Drop the permissive public SELECT policy that exposes user_id
DROP POLICY IF EXISTS "Anyone can view published blog posts" ON public.blog_posts;

-- The "Owners can view all their blog posts" policy already exists and allows owners to see their own posts
-- For public access, apps should use the public_blog_posts view instead
-- ============================================
-- Migration: 20260120155800_bcbb6373-2081-42a5-bae2-90e9678334d1.sql
-- ============================================
-- Fix SECURITY DEFINER warning by recreating view with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_blog_posts;

CREATE VIEW public.public_blog_posts 
WITH (security_invoker = true) AS
SELECT 
  id,
  title,
  excerpt,
  content,
  category,
  published,
  created_at,
  updated_at
FROM public.blog_posts
WHERE published = true;

-- Grant access to the view for anonymous and authenticated users
GRANT SELECT ON public.public_blog_posts TO anon, authenticated;
-- ============================================
-- Migration: 20260120155825_65059ae5-3a1c-43b5-9e86-855a6cac6c0d.sql
-- ============================================
-- Add a policy to allow the SECURITY INVOKER view to access published blog posts
-- This policy allows read access to published posts without exposing user_id through the view
CREATE POLICY "Public can view published blog posts for view" 
ON public.blog_posts 
FOR SELECT 
TO anon, authenticated
USING (published = true);
-- ============================================
-- Migration: 20260120160925_3b9a8800-67c3-4596-9a20-e4b92ebe07fb.sql
-- ============================================
-- Make the public_blog_posts view read-only by creating rules that prevent modifications
-- This protects against unauthorized INSERT, UPDATE, DELETE operations on the view

-- Drop and recreate the view with SECURITY INVOKER to ensure it respects base table RLS
DROP VIEW IF EXISTS public.public_blog_posts;

CREATE VIEW public.public_blog_posts
WITH (security_invoker = on) AS
SELECT 
    id,
    title,
    excerpt,
    content,
    category,
    published,
    created_at,
    updated_at
FROM public.blog_posts
WHERE published = true;

-- Create rules to make the view completely read-only
-- These rules prevent any INSERT, UPDATE, or DELETE operations
CREATE RULE public_blog_posts_no_insert AS ON INSERT TO public.public_blog_posts DO INSTEAD NOTHING;
CREATE RULE public_blog_posts_no_update AS ON UPDATE TO public.public_blog_posts DO INSTEAD NOTHING;
CREATE RULE public_blog_posts_no_delete AS ON DELETE TO public.public_blog_posts DO INSTEAD NOTHING;
-- ============================================
-- Migration: 20260120161315_44d9fa88-262d-4e97-99e5-44467b89c976.sql
-- ============================================
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
-- ============================================
-- Migration: 20260120164106_620bca0d-4471-4663-8b53-24f815c4c0c0.sql
-- ============================================
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
-- ============================================
-- Migration: 20260120191620_fcdfccdf-8689-4be0-af07-7409304e46c9.sql
-- ============================================
-- Create buyer_personas table to store client buyer persona data
CREATE TABLE public.buyer_personas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  persona_data JSONB NOT NULL DEFAULT '{}',
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- Create steve_conversations table to store chat history
CREATE TABLE public.steve_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create steve_messages table to store individual messages
CREATE TABLE public.steve_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.steve_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.buyer_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for buyer_personas
CREATE POLICY "Clients can view their own buyer persona"
  ON public.buyer_personas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = buyer_personas.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Clients can insert their own buyer persona"
  ON public.buyer_personas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = buyer_personas.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Clients can update their own buyer persona"
  ON public.buyer_personas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = buyer_personas.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

-- RLS policies for steve_conversations
CREATE POLICY "Clients can view their own conversations"
  ON public.steve_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = steve_conversations.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Clients can create their own conversations"
  ON public.steve_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = steve_conversations.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

-- RLS policies for steve_messages
CREATE POLICY "Clients can view their own messages"
  ON public.steve_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.steve_conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = steve_messages.conversation_id
      AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())
    )
  );

CREATE POLICY "Clients can insert their own messages"
  ON public.steve_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.steve_conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = steve_messages.conversation_id
      AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())
    )
  );

-- Add trigger for updated_at on buyer_personas
CREATE TRIGGER update_buyer_personas_updated_at
  BEFORE UPDATE ON public.buyer_personas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on steve_conversations
CREATE TRIGGER update_steve_conversations_updated_at
  BEFORE UPDATE ON public.steve_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- Migration: 20260120200755_866602fd-c732-41ba-a041-3f1b4b7a9e85.sql
-- ============================================
-- Create table for saved meta copies
CREATE TABLE public.saved_meta_copies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  funnel_stage TEXT NOT NULL,
  ad_type TEXT NOT NULL,
  has_script BOOLEAN NOT NULL DEFAULT false,
  headlines TEXT[] NOT NULL DEFAULT '{}',
  primary_texts TEXT[] NOT NULL DEFAULT '{}',
  descriptions TEXT[] NOT NULL DEFAULT '{}',
  video_hooks TEXT[],
  video_scripts TEXT[],
  custom_instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_meta_copies ENABLE ROW LEVEL SECURITY;

-- Clients can view their own saved copies
CREATE POLICY "Clients can view their own saved copies"
ON public.saved_meta_copies
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = saved_meta_copies.client_id
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Clients can insert their own saved copies
CREATE POLICY "Clients can insert their own saved copies"
ON public.saved_meta_copies
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = saved_meta_copies.client_id
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Clients can delete their own saved copies
CREATE POLICY "Clients can delete their own saved copies"
ON public.saved_meta_copies
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = saved_meta_copies.client_id
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Create index for faster queries
CREATE INDEX idx_saved_meta_copies_client_id ON public.saved_meta_copies(client_id);
CREATE INDEX idx_saved_meta_copies_created_at ON public.saved_meta_copies(created_at DESC);
-- ============================================
-- Migration: 20260120203739_5c4dd69b-2f6e-450c-bd30-981af7061b56.sql
-- ============================================
-- Create table for Klaviyo email flow planning
CREATE TABLE public.klaviyo_email_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('welcome_series', 'abandoned_cart', 'customer_winback', 'campaign')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'implemented')),
  
  -- For campaigns
  campaign_date TIMESTAMP WITH TIME ZONE,
  campaign_subject TEXT,
  
  -- Email sequence (array of email definitions)
  emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Notes and feedback
  client_notes TEXT,
  admin_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.klaviyo_email_plans ENABLE ROW LEVEL SECURITY;

-- Clients can view and manage their own plans
CREATE POLICY "Clients can view their own email plans"
  ON public.klaviyo_email_plans FOR SELECT
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Clients can create their own email plans"
  ON public.klaviyo_email_plans FOR INSERT
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Clients can update their own email plans"
  ON public.klaviyo_email_plans FOR UPDATE
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Clients can delete their own email plans"
  ON public.klaviyo_email_plans FOR DELETE
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Trigger for updated_at
CREATE TRIGGER update_klaviyo_email_plans_updated_at
  BEFORE UPDATE ON public.klaviyo_email_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- Migration: 20260120205534_8cd74c80-0ced-4953-af9a-f02643b0ba06.sql
-- ============================================
-- Add klaviyo to the platform_type enum
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'klaviyo';
-- ============================================
-- Migration: 20260120210741_63ea2d10-b8a7-416a-af23-818cd7dd92b1.sql
-- ============================================
-- Create table to store Google Ads copies
CREATE TABLE public.saved_google_copies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_type TEXT NOT NULL,
  headlines TEXT[] NOT NULL,
  long_headlines TEXT[],
  descriptions TEXT[] NOT NULL,
  sitelinks JSONB,
  custom_instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_google_copies ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their client's google copies"
ON public.saved_google_copies FOR SELECT
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can insert their client's google copies"
ON public.saved_google_copies FOR INSERT
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can delete their client's google copies"
ON public.saved_google_copies FOR DELETE
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Create table for Steve feedback on generated content
CREATE TABLE public.steve_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL, -- 'meta_copy', 'google_copy', 'klaviyo_email'
  content_id UUID, -- Reference to the specific content
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  improvement_notes TEXT, -- Steve's notes on how to improve
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.steve_feedback ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their client's feedback"
ON public.steve_feedback FOR SELECT
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can insert their client's feedback"
ON public.steve_feedback FOR INSERT
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Add index for performance
CREATE INDEX idx_saved_google_copies_client ON public.saved_google_copies(client_id);
CREATE INDEX idx_steve_feedback_client ON public.steve_feedback(client_id);
CREATE INDEX idx_steve_feedback_content ON public.steve_feedback(content_type, content_id);
-- ============================================
-- Migration: 20260120230900_7dd2040b-fabf-4664-bee2-94d9008c9f1e.sql
-- ============================================
-- Drop and recreate the encrypt function with proper ownership
DROP FUNCTION IF EXISTS public.encrypt_platform_token(text);

CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgsodium
AS $$
DECLARE
  key_id UUID;
  encrypted BYTEA;
BEGIN
  IF raw_token IS NULL OR raw_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Get the encryption key
  SELECT id INTO key_id FROM pgsodium.valid_key WHERE name = 'platform_tokens_key' LIMIT 1;
  
  IF key_id IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found';
  END IF;
  
  -- Encrypt the token using AEAD deterministic encryption
  encrypted := pgsodium.crypto_aead_det_encrypt(
    raw_token::bytea,
    ''::bytea,
    key_id
  );
  
  -- Return as base64 string for storage
  RETURN encode(encrypted, 'base64');
END;
$$;

-- Ensure the function can be executed by service_role
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO authenticated;
-- ============================================
-- Migration: 20260120231136_ed757979-219d-4596-bd03-c7cefa316f1a.sql
-- ============================================
-- Use pgcrypto instead of pgsodium for encryption
-- First ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop and recreate the encrypt function using pgcrypto
DROP FUNCTION IF EXISTS public.encrypt_platform_token(text);

CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  encrypted_bytes bytea;
BEGIN
  IF raw_token IS NULL OR raw_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Use a fixed encryption key derived from the database 
  -- In production, this should come from a secure source
  encryption_key := current_setting('app.settings.encryption_key', true);
  
  -- Fallback to a derived key if not set
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := encode(digest('platform_tokens_secret_key_2024', 'sha256'), 'hex');
  END IF;
  
  -- Encrypt using pgcrypto's symmetric encryption
  encrypted_bytes := pgp_sym_encrypt(raw_token, encryption_key);
  
  -- Return as base64 string for storage
  RETURN encode(encrypted_bytes, 'base64');
END;
$$;

-- Drop and recreate the decrypt function using pgcrypto
DROP FUNCTION IF EXISTS public.decrypt_platform_token(text);

CREATE OR REPLACE FUNCTION public.decrypt_platform_token(encrypted_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  decrypted_text text;
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;
  
  -- Use the same encryption key
  encryption_key := current_setting('app.settings.encryption_key', true);
  
  -- Fallback to a derived key if not set
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := encode(digest('platform_tokens_secret_key_2024', 'sha256'), 'hex');
  END IF;
  
  -- Decrypt using pgcrypto
  decrypted_text := pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
  
  RETURN decrypted_text;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_platform_token(text) TO service_role;
-- ============================================
-- Migration: 20260120231527_e6e6e12b-b405-4359-8027-64771aa1771c.sql
-- ============================================
-- Fix: avoid pgcrypto.digest signature issues by using built-in md5 for fallback key
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  encrypted_bytes bytea;
BEGIN
  IF raw_token IS NULL OR raw_token = '' THEN
    RETURN NULL;
  END IF;

  encryption_key := current_setting('app.settings.encryption_key', true);

  -- Fallback key (deterministic) using built-in md5
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := md5('platform_tokens_secret_key_2024');
  END IF;

  encrypted_bytes := pgp_sym_encrypt(raw_token, encryption_key);
  RETURN encode(encrypted_bytes, 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_platform_token(encrypted_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key text;
  decrypted_text text;
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;

  encryption_key := current_setting('app.settings.encryption_key', true);

  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := md5('platform_tokens_secret_key_2024');
  END IF;

  decrypted_text := pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
  RETURN decrypted_text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_platform_token(text) TO service_role;
-- ============================================
-- Migration: 20260120232034_9dbb6628-44e9-41f2-a1c8-506ecd4540f1.sql
-- ============================================
CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  encryption_key text;
  encrypted_bytes bytea;
BEGIN
  IF raw_token IS NULL OR raw_token = '' THEN
    RETURN NULL;
  END IF;

  encryption_key := current_setting('app.settings.encryption_key', true);

  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := md5('platform_tokens_secret_key_2024');
  END IF;

  encrypted_bytes := extensions.pgp_sym_encrypt(raw_token, encryption_key);
  RETURN encode(encrypted_bytes, 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_platform_token(encrypted_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  encryption_key text;
  decrypted_text text;
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;

  encryption_key := current_setting('app.settings.encryption_key', true);

  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := md5('platform_tokens_secret_key_2024');
  END IF;

  decrypted_text := extensions.pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
  RETURN decrypted_text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_platform_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_platform_token(text) TO service_role;
-- ============================================
-- Migration: 20260121140221_1adf5758-9533-4291-8650-14e003a05390.sql
-- ============================================
-- Create client financial configuration table
CREATE TABLE public.client_financial_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL UNIQUE,
  
  -- Margin settings
  default_margin_percentage numeric NOT NULL DEFAULT 30,
  use_shopify_costs boolean NOT NULL DEFAULT false,
  
  -- Fixed costs per month
  shopify_plan_cost numeric NOT NULL DEFAULT 0,
  klaviyo_plan_cost numeric NOT NULL DEFAULT 0,
  other_fixed_costs numeric NOT NULL DEFAULT 0,
  other_fixed_costs_description text,
  
  -- Payment gateway commission
  payment_gateway_commission numeric NOT NULL DEFAULT 3.5,
  
  -- Product-level margins (JSON: { "sku": margin_percentage })
  product_margins jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_financial_config ENABLE ROW LEVEL SECURITY;

-- Clients can view their own config
CREATE POLICY "Clients can view their own financial config"
ON public.client_financial_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_financial_config.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  )
);

-- Clients can insert their own config
CREATE POLICY "Clients can insert their own financial config"
ON public.client_financial_config
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_financial_config.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  )
);

-- Clients can update their own config
CREATE POLICY "Clients can update their own financial config"
ON public.client_financial_config
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_financial_config.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_client_financial_config_updated_at
BEFORE UPDATE ON public.client_financial_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- Migration: 20260121152755_aa2dc2d3-0102-4fb8-add2-ab4ce1e3601e.sql
-- ============================================
-- Plans table for Steve subscriptions
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price_monthly NUMERIC NOT NULL DEFAULT 0,
  credits_monthly INTEGER, -- NULL = unlimited
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User subscriptions
CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  credits_used INTEGER NOT NULL DEFAULT 0,
  credits_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Plans are public readable
CREATE POLICY "Anyone can view active plans"
ON public.subscription_plans
FOR SELECT
USING (is_active = true);

-- Users can view their own subscription
CREATE POLICY "Users can view their own subscription"
ON public.user_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can manage subscriptions
CREATE POLICY "Admins can manage all subscriptions"
ON public.user_subscriptions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default plans
INSERT INTO public.subscription_plans (name, slug, price_monthly, credits_monthly, features) VALUES
('Free', 'free', 0, 10, '["Conexión Shopify", "10 generaciones/mes", "Brand Brief básico"]'::jsonb),
('Starter', 'starter', 20000, 50, '["Todo en Free", "50 generaciones/mes", "Copy Meta Ads", "Copy Google Ads"]'::jsonb),
('Pro', 'pro', 70000, 150, '["Todo en Starter", "150 generaciones/mes", "Klaviyo Planner", "Métricas avanzadas"]'::jsonb),
('Agency', 'agency', 100000, NULL, '["Todo en Pro", "Generaciones ilimitadas", "Múltiples clientes", "Soporte prioritario"]'::jsonb);

-- Trigger for updated_at
CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- Migration: 20260121213202_9b3f7473-6775-4665-a378-1275971ec498.sql
-- ============================================
-- Create table for campaign-level metrics
CREATE TABLE public.campaign_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  metric_date DATE NOT NULL,
  impressions NUMERIC DEFAULT 0,
  clicks NUMERIC DEFAULT 0,
  spend NUMERIC DEFAULT 0,
  conversions NUMERIC DEFAULT 0,
  conversion_value NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  cpc NUMERIC DEFAULT 0,
  cpm NUMERIC DEFAULT 0,
  roas NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(connection_id, campaign_id, metric_date)
);

-- Create table for AI recommendations per campaign
CREATE TABLE public.campaign_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  connection_id UUID NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  recommendation_type TEXT NOT NULL,
  recommendation_text TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaign_metrics
CREATE POLICY "Users can view their clients campaign metrics"
ON public.campaign_metrics FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_metrics.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can insert campaign metrics for their clients"
ON public.campaign_metrics FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_metrics.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can update campaign metrics for their clients"
ON public.campaign_metrics FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_metrics.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can delete campaign metrics for their clients"
ON public.campaign_metrics FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_metrics.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

-- RLS policies for campaign_recommendations
CREATE POLICY "Users can view their clients campaign recommendations"
ON public.campaign_recommendations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_recommendations.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can insert campaign recommendations for their clients"
ON public.campaign_recommendations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_recommendations.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can update campaign recommendations for their clients"
ON public.campaign_recommendations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_recommendations.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can delete campaign recommendations for their clients"
ON public.campaign_recommendations FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_recommendations.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

-- Add indexes for performance
CREATE INDEX idx_campaign_metrics_connection_date ON public.campaign_metrics(connection_id, metric_date);
CREATE INDEX idx_campaign_metrics_campaign ON public.campaign_metrics(campaign_id);
CREATE INDEX idx_campaign_recommendations_campaign ON public.campaign_recommendations(campaign_id);

-- Add trigger for updated_at
CREATE TRIGGER update_campaign_metrics_updated_at
BEFORE UPDATE ON public.campaign_metrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- Migration: 20260121214249_3c583ec1-0da1-49b3-be78-ceb1101c455d.sql
-- ============================================
-- Create table for Steve's training feedback on campaign recommendations
CREATE TABLE public.steve_training_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_id UUID REFERENCES public.campaign_recommendations(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  recommendation_type TEXT NOT NULL,
  original_recommendation TEXT NOT NULL,
  feedback_rating TEXT NOT NULL CHECK (feedback_rating IN ('positive', 'negative', 'neutral')),
  feedback_notes TEXT,
  improved_recommendation TEXT,
  campaign_metrics JSONB DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for custom training examples (cases)
CREATE TABLE public.steve_training_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'both')),
  scenario_description TEXT NOT NULL,
  campaign_metrics JSONB DEFAULT '{}',
  correct_analysis TEXT NOT NULL,
  incorrect_analysis TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.steve_training_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_training_examples ENABLE ROW LEVEL SECURITY;

-- RLS policies for training feedback (admin only)
CREATE POLICY "Admins can view all training feedback"
ON public.steve_training_feedback FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert training feedback"
ON public.steve_training_feedback FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update training feedback"
ON public.steve_training_feedback FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete training feedback"
ON public.steve_training_feedback FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- RLS policies for training examples (admin only)
CREATE POLICY "Admins can view all training examples"
ON public.steve_training_examples FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert training examples"
ON public.steve_training_examples FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update training examples"
ON public.steve_training_examples FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete training examples"
ON public.steve_training_examples FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_training_feedback_rating ON public.steve_training_feedback(feedback_rating);
CREATE INDEX idx_training_feedback_type ON public.steve_training_feedback(recommendation_type);
CREATE INDEX idx_training_examples_platform ON public.steve_training_examples(platform);
CREATE INDEX idx_training_examples_active ON public.steve_training_examples(is_active);

-- Trigger for updated_at
CREATE TRIGGER update_steve_training_examples_updated_at
BEFORE UPDATE ON public.steve_training_examples
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- Migration: 20260201233707_f270af18-ffb3-4ef6-bb7a-97cf9c17fb8e.sql
-- ============================================
-- =====================================================
-- MULTITENANCY SECURITY FIX: Shop-domain based isolation
-- =====================================================

-- 1. Add shop_domain column to clients table for tenant isolation
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_clients_shop_domain ON public.clients(shop_domain);

-- 2. Add is_super_admin flag to user_roles (only manually set by DB admin)
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- 3. Create a function to get shop_domain for current user
CREATE OR REPLACE FUNCTION public.get_user_shop_domain(_user_id uuid)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.shop_domain
  FROM public.clients c
  WHERE c.client_user_id = _user_id
     OR c.user_id = _user_id
  LIMIT 1
$$;

-- 4. Create a function to check if user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
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
      AND role = 'admin'
      AND is_super_admin = TRUE
  )
$$;

-- 5. Create function to check if user is a Shopify user (has shop_domain)
CREATE OR REPLACE FUNCTION public.is_shopify_user(_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE (c.client_user_id = _user_id OR c.user_id = _user_id)
      AND c.shop_domain IS NOT NULL
  )
$$;

-- 6. Function to check if user can access a specific shop's data
CREATE OR REPLACE FUNCTION public.can_access_shop(_user_id uuid, _shop_domain text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Super admins can access everything
    public.is_super_admin(_user_id)
    OR
    -- Regular users can only access their own shop
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE (c.client_user_id = _user_id OR c.user_id = _user_id)
        AND c.shop_domain = _shop_domain
    )
$$;

-- 7. Update platform_connections with shop_domain column
ALTER TABLE public.platform_connections 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_platform_connections_shop_domain ON public.platform_connections(shop_domain);

-- 8. Update platform_metrics with shop_domain for RLS
ALTER TABLE public.platform_metrics 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

-- Create index
CREATE INDEX IF NOT EXISTS idx_platform_metrics_shop_domain ON public.platform_metrics(shop_domain);

-- 9. Update campaign_metrics with shop_domain
ALTER TABLE public.campaign_metrics 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_shop_domain ON public.campaign_metrics(shop_domain);

-- 10. Update campaign_recommendations with shop_domain
ALTER TABLE public.campaign_recommendations 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_recommendations_shop_domain ON public.campaign_recommendations(shop_domain);

-- =====================================================
-- NEW RLS POLICIES FOR SHOP-DOMAIN ISOLATION
-- =====================================================

-- Platform Connections: Add shop_domain based policy
DROP POLICY IF EXISTS "Shop isolation for platform_connections" ON public.platform_connections;
CREATE POLICY "Shop isolation for platform_connections"
ON public.platform_connections
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  -- Fallback for existing data without shop_domain
  (shop_domain IS NULL AND client_id IN (
    SELECT id FROM clients WHERE client_user_id = auth.uid() OR user_id = auth.uid()
  ))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  (shop_domain IS NULL AND client_id IN (
    SELECT id FROM clients WHERE client_user_id = auth.uid() OR user_id = auth.uid()
  ))
);

-- Platform Metrics: Add shop_domain based policy  
DROP POLICY IF EXISTS "Shop isolation for platform_metrics" ON public.platform_metrics;
CREATE POLICY "Shop isolation for platform_metrics"
ON public.platform_metrics
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  -- Fallback for existing data
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
);

-- Campaign Metrics: Add shop_domain based policy
DROP POLICY IF EXISTS "Shop isolation for campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "Shop isolation for campaign_metrics"
ON public.campaign_metrics
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  -- Fallback for existing data
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
);

-- Campaign Recommendations: Add shop_domain based policy
DROP POLICY IF EXISTS "Shop isolation for campaign_recommendations" ON public.campaign_recommendations;
CREATE POLICY "Shop isolation for campaign_recommendations"
ON public.campaign_recommendations
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  -- Fallback
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
);

-- Clients table: Add shop_domain based policy
DROP POLICY IF EXISTS "Shop isolation for clients" ON public.clients;
CREATE POLICY "Shop isolation for clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR client_user_id = auth.uid()
  OR user_id = auth.uid()
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
);
-- ============================================
-- Migration: 20260201235338_bd8d558a-269e-4df4-853e-1a67fe6315cb.sql
-- ============================================

-- =====================================================
-- DEEP RLS CLEANUP: Multitenancy Security Hardening
-- =====================================================

-- 1. UPDATE can_access_shop to be more strict
-- Only allows access if user is EXCLUSIVELY linked to that shop_domain
CREATE OR REPLACE FUNCTION public.can_access_shop(_user_id uuid, _shop_domain text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- User must have a client record with this exact shop_domain
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE (c.client_user_id = _user_id OR c.user_id = _user_id)
        AND c.shop_domain = _shop_domain
        AND c.shop_domain IS NOT NULL
    )
$$;

-- 2. DROP ALL REDUNDANT POLICIES on platform_connections
DROP POLICY IF EXISTS "Shop isolation for platform_connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Clients can view their own connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Clients can insert their own connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can create connections for their clients" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can view their clients connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can update their clients connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can delete their clients connections" ON public.platform_connections;

-- 3. CREATE CLEAN POLICIES for platform_connections
-- Shopify users: ONLY their shop_domain
CREATE POLICY "Shopify users access own shop connections"
ON public.platform_connections FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

-- Super admins: Separate explicit policy
CREATE POLICY "Super admins view all connections"
ON public.platform_connections FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Non-Shopify clients (legacy): Access via client_id
CREATE POLICY "Legacy clients view own connections"
ON public.platform_connections FOR SELECT
TO authenticated
USING (
  shop_domain IS NULL
  AND client_id IN (
    SELECT id FROM public.clients 
    WHERE client_user_id = auth.uid() OR user_id = auth.uid()
  )
);

-- INSERT: Must match shop_domain or be super admin
CREATE POLICY "Insert connections with valid shop"
ON public.platform_connections FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  ))
);

-- UPDATE: Same restrictions
CREATE POLICY "Update own shop connections"
ON public.platform_connections FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  ))
);

-- DELETE: Same restrictions
CREATE POLICY "Delete own shop connections"
ON public.platform_connections FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  ))
);

-- 4. DROP ALL REDUNDANT POLICIES on platform_metrics
DROP POLICY IF EXISTS "Shop isolation for platform_metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Clients can view their own metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can view their clients metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can insert metrics for their clients" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can update metrics for their clients" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can delete metrics for their clients" ON public.platform_metrics;

-- 5. CREATE CLEAN POLICIES for platform_metrics
-- Shopify users: ONLY their shop_domain (NO admin fallback here)
CREATE POLICY "Shopify users view own shop metrics"
ON public.platform_metrics FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

-- Super admins: Separate policy
CREATE POLICY "Super admins view all metrics"
ON public.platform_metrics FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Legacy (non-Shopify)
CREATE POLICY "Legacy clients view own metrics"
ON public.platform_metrics FOR SELECT
TO authenticated
USING (
  shop_domain IS NULL
  AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  )
);

-- INSERT with shop_domain validation
CREATE POLICY "Insert metrics with valid shop"
ON public.platform_metrics FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- UPDATE
CREATE POLICY "Update own shop metrics"
ON public.platform_metrics FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- DELETE
CREATE POLICY "Delete own shop metrics"
ON public.platform_metrics FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- 6. DROP ALL REDUNDANT POLICIES on campaign_metrics
DROP POLICY IF EXISTS "Shop isolation for campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "Users can view their clients campaign metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "Users can insert campaign metrics for their clients" ON public.campaign_metrics;
DROP POLICY IF EXISTS "Users can update campaign metrics for their clients" ON public.campaign_metrics;
DROP POLICY IF EXISTS "Users can delete campaign metrics for their clients" ON public.campaign_metrics;

-- 7. CREATE CLEAN POLICIES for campaign_metrics
CREATE POLICY "Shopify users view own campaign metrics"
ON public.campaign_metrics FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

CREATE POLICY "Super admins view all campaign metrics"
ON public.campaign_metrics FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Legacy clients view own campaign metrics"
ON public.campaign_metrics FOR SELECT
TO authenticated
USING (
  shop_domain IS NULL
  AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  )
);

CREATE POLICY "Insert campaign metrics with valid shop"
ON public.campaign_metrics FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

CREATE POLICY "Update own campaign metrics"
ON public.campaign_metrics FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

CREATE POLICY "Delete own campaign metrics"
ON public.campaign_metrics FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- 8. DROP REDUNDANT POLICIES on campaign_recommendations
DROP POLICY IF EXISTS "Shop isolation for campaign_recommendations" ON public.campaign_recommendations;
DROP POLICY IF EXISTS "Users can view their clients campaign recommendations" ON public.campaign_recommendations;
DROP POLICY IF EXISTS "Users can insert campaign recommendations for their clients" ON public.campaign_recommendations;
DROP POLICY IF EXISTS "Users can update campaign recommendations for their clients" ON public.campaign_recommendations;
DROP POLICY IF EXISTS "Users can delete campaign recommendations for their clients" ON public.campaign_recommendations;

-- 9. CREATE CLEAN POLICIES for campaign_recommendations
CREATE POLICY "Shopify users view own recommendations"
ON public.campaign_recommendations FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

CREATE POLICY "Super admins view all recommendations"
ON public.campaign_recommendations FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Legacy clients view own recommendations"
ON public.campaign_recommendations FOR SELECT
TO authenticated
USING (
  shop_domain IS NULL
  AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  )
);

CREATE POLICY "Insert recommendations with valid shop"
ON public.campaign_recommendations FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

CREATE POLICY "Update own recommendations"
ON public.campaign_recommendations FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

CREATE POLICY "Delete own recommendations"
ON public.campaign_recommendations FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- 10. CLEANUP clients table policies
DROP POLICY IF EXISTS "Shop isolation for clients" ON public.clients;

-- Shopify users see ONLY their shop
CREATE POLICY "Shopify users view own client record"
ON public.clients FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

-- Super admin separate policy
CREATE POLICY "Super admins view all clients"
ON public.clients FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- ============================================
-- Migration: 20260202171502_4b8c780d-8bbe-4b14-87fc-d4a3dd41147d.sql
-- ============================================
-- Trigger function: auto-assign 'client' role and create client record on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_name text;
  user_email text;
BEGIN
  -- Extract name and email from the new user
  user_email := NEW.email;
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(user_email, '@', 1)
  );

  -- Create client record (user_id and client_user_id both point to the new user)
  INSERT INTO public.clients (user_id, client_user_id, name, email)
  VALUES (NEW.id, NEW.id, user_name, user_email)
  ON CONFLICT DO NOTHING;

  -- Assign 'client' role
  INSERT INTO public.user_roles (user_id, role, is_super_admin)
  VALUES (NEW.id, 'client', false)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users (runs after insert)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
-- ============================================
-- Migration: 20260216233146_a65444b7-b1c5-490b-9eb3-7feb515e44af.sql
-- ============================================

-- Table to persist OAuth state nonces for CSRF validation
CREATE TABLE public.oauth_states (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nonce text NOT NULL UNIQUE,
  shop_domain text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- RLS: only service role should access this table (edge functions use service role key)
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- No public policies - only service_role can access
-- Auto-cleanup old states
CREATE INDEX idx_oauth_states_nonce ON public.oauth_states(nonce);
CREATE INDEX idx_oauth_states_expires ON public.oauth_states(expires_at);

-- ============================================
-- Migration: 20260217151500_c9b325a3-6f73-4411-951a-f33b4cbc9dda.sql
-- ============================================

-- Storage bucket for client brand assets
INSERT INTO storage.buckets (id, name, public) VALUES ('client-assets', 'client-assets', true);

-- RLS for storage: clients can upload to their own folder
CREATE POLICY "Clients can upload their own assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-assets' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Clients can view their own assets"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-assets' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR (SELECT is_super_admin(auth.uid()))
  )
);

CREATE POLICY "Clients can delete their own assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'client-assets' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Public can view client assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-assets');

-- Table for brand research data (competitor analysis, SEO, ads library, keywords)
CREATE TABLE public.brand_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  research_type TEXT NOT NULL, -- 'competitor_analysis', 'seo_audit', 'ads_library', 'keywords'
  research_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, research_type)
);

ALTER TABLE public.brand_research ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own research"
ON public.brand_research FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients 
  WHERE clients.id = brand_research.client_id 
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

CREATE POLICY "Clients can insert their own research"
ON public.brand_research FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients 
  WHERE clients.id = brand_research.client_id 
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

CREATE POLICY "Clients can update their own research"
ON public.brand_research FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM clients 
  WHERE clients.id = brand_research.client_id 
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

CREATE POLICY "Super admins can manage all research"
ON public.brand_research FOR ALL
USING (is_super_admin(auth.uid()));

-- Add logo_url and website_url to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Trigger for updated_at
CREATE TRIGGER update_brand_research_updated_at
BEFORE UPDATE ON public.brand_research
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Migration: 20260217152156_b954b9b0-4be0-46f6-894a-3c390977afd7.sql
-- ============================================

-- Table: competitor_tracking (los handles de IG que el cliente quiere seguir)
CREATE TABLE public.competitor_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ig_handle TEXT NOT NULL,
  meta_page_id TEXT, -- Se resuelve una sola vez desde el handle
  display_name TEXT,
  profile_pic_url TEXT,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, ig_handle)
);

-- Table: competitor_ads (anuncios extraídos de Meta Ad Library)
CREATE TABLE public.competitor_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_id UUID NOT NULL REFERENCES public.competitor_tracking(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ad_library_id TEXT NOT NULL, -- ID único del anuncio en Meta Ad Library
  ad_text TEXT,
  ad_headline TEXT,
  ad_description TEXT,
  image_url TEXT,
  video_url TEXT,
  ad_type TEXT, -- 'image', 'video', 'carousel'
  cta_type TEXT, -- 'SHOP_NOW', 'LEARN_MORE', etc.
  started_at TIMESTAMP WITH TIME ZONE, -- Fecha inicio del anuncio
  is_active BOOLEAN NOT NULL DEFAULT true, -- Si sigue activo en Ad Library
  days_running INTEGER, -- Calculado: cuántos días lleva activo (los ganadores)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tracking_id, ad_library_id)
);

-- Indexes for performance
CREATE INDEX idx_competitor_tracking_client ON public.competitor_tracking(client_id);
CREATE INDEX idx_competitor_ads_tracking ON public.competitor_ads(tracking_id);
CREATE INDEX idx_competitor_ads_client ON public.competitor_ads(client_id);
CREATE INDEX idx_competitor_ads_days ON public.competitor_ads(days_running DESC NULLS LAST);

-- RLS
ALTER TABLE public.competitor_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_ads ENABLE ROW LEVEL SECURITY;

-- Policies: competitor_tracking
CREATE POLICY "Clients can view their own competitor tracking"
  ON public.competitor_tracking FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_tracking.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own competitor tracking"
  ON public.competitor_tracking FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_tracking.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own competitor tracking"
  ON public.competitor_tracking FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_tracking.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can delete their own competitor tracking"
  ON public.competitor_tracking FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_tracking.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all competitor tracking"
  ON public.competitor_tracking FOR ALL
  USING (is_super_admin(auth.uid()));

-- Policies: competitor_ads
CREATE POLICY "Clients can view their own competitor ads"
  ON public.competitor_ads FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_ads.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own competitor ads"
  ON public.competitor_ads FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_ads.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own competitor ads"
  ON public.competitor_ads FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_ads.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all competitor ads"
  ON public.competitor_ads FOR ALL
  USING (is_super_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_competitor_tracking_updated_at
  BEFORE UPDATE ON public.competitor_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competitor_ads_updated_at
  BEFORE UPDATE ON public.competitor_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Migration: 20260217152535_d975be26-34e2-4da9-abf8-d1bbe1bfecb3.sql
-- ============================================

-- Add deep_dive_data column to competitor_tracking for storing Firecrawl analysis
ALTER TABLE public.competitor_tracking 
ADD COLUMN deep_dive_data JSONB DEFAULT NULL,
ADD COLUMN store_url TEXT DEFAULT NULL,
ADD COLUMN last_deep_dive_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ============================================
-- Migration: 20260218213333_34118c43-544b-45ba-8d3c-012b71d371dc.sql
-- ============================================
-- Enable realtime for brand_research table so Supabase Realtime can stream changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_research;
-- ============================================
-- Migration: 20260219000621_800e5ea9-e54a-4919-8f37-cbfcd1605806.sql
-- ============================================

-- Table: client_assets (product photos, logos, lifestyle images per client)
CREATE TABLE IF NOT EXISTS public.client_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  url TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'producto', -- producto | lifestyle | logo | otro
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own assets"
  ON public.client_assets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_assets.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own assets"
  ON public.client_assets FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_assets.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own assets"
  ON public.client_assets FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_assets.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can delete their own assets"
  ON public.client_assets FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_assets.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all assets"
  ON public.client_assets FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_client_assets_updated_at
  BEFORE UPDATE ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: ad_creatives (generated ad copies + visual briefs per client)
CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  funnel TEXT NOT NULL,       -- tofu | mofu | bofu
  formato TEXT NOT NULL,      -- static | video
  angulo TEXT NOT NULL,
  titulo TEXT,
  texto_principal TEXT,
  descripcion TEXT,
  cta TEXT,
  brief_visual JSONB,
  prompt_generacion TEXT,
  foto_base_url TEXT,
  asset_url TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador',  -- borrador | aprobado | en_pauta
  custom_instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own ad creatives"
  ON public.ad_creatives FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = ad_creatives.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own ad creatives"
  ON public.ad_creatives FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = ad_creatives.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own ad creatives"
  ON public.ad_creatives FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = ad_creatives.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can delete their own ad creatives"
  ON public.ad_creatives FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = ad_creatives.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all ad creatives"
  ON public.ad_creatives FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_ad_creatives_updated_at
  BEFORE UPDATE ON public.ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Migration: 20260219115942_759d69eb-2efa-4c34-a323-92a9e0a4a6e6.sql
-- ============================================

-- Create client_credits table
CREATE TABLE IF NOT EXISTS public.client_credits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  creditos_disponibles integer NOT NULL DEFAULT 99999,
  creditos_usados integer NOT NULL DEFAULT 0,
  plan text NOT NULL DEFAULT 'free_beta',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own credits"
  ON public.client_credits FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_credits.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own credits"
  ON public.client_credits FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_credits.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own credits"
  ON public.client_credits FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_credits.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all credits"
  ON public.client_credits FOR ALL
  USING (is_super_admin(auth.uid()));

-- Create credit_transactions table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  accion text NOT NULL,
  creditos_usados integer NOT NULL DEFAULT 0,
  costo_real_usd decimal(10,4) DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own transactions"
  ON public.credit_transactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = credit_transactions.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own transactions"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = credit_transactions.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all transactions"
  ON public.credit_transactions FOR ALL
  USING (is_super_admin(auth.uid()));

-- Add updated_at trigger for client_credits
CREATE TRIGGER update_client_credits_updated_at
  BEFORE UPDATE ON public.client_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add prediction_id to ad_creatives if not exists
ALTER TABLE public.ad_creatives ADD COLUMN IF NOT EXISTS prediction_id text;

-- Auto-insert credits when a new client is created
-- (backfill for existing clients too)
INSERT INTO public.client_credits (client_id, creditos_disponibles, creditos_usados, plan)
SELECT id, 99999, 0, 'free_beta'
FROM public.clients
ON CONFLICT (client_id) DO NOTHING;

-- ============================================
-- Migration: 20260219141230_abfc4369-91d6-4725-a881-acf5b075b5cf.sql
-- ============================================

-- Drop the existing restrictive super admin policy and create a proper permissive one
DROP POLICY IF EXISTS "Super admins view all clients" ON public.clients;

CREATE POLICY "Super admins view all clients"
ON public.clients
FOR SELECT
USING (is_super_admin(auth.uid()));

-- ============================================
-- Migration: 20260219141519_937fbe80-54f3-4b95-8ae8-fb1065412b86.sql
-- ============================================

-- Super admin policies for client_credits
CREATE POLICY "Super admins manage all client credits"
ON public.client_credits
FOR ALL
USING (is_super_admin(auth.uid()));

-- Super admin policies for buyer_personas
CREATE POLICY "Super admins manage all buyer personas"
ON public.buyer_personas
FOR ALL
USING (is_super_admin(auth.uid()));

-- Super admin UPDATE policy for clients (needed to edit any client)
CREATE POLICY "Super admins update all clients"
ON public.clients
FOR UPDATE
USING (is_super_admin(auth.uid()));

-- ============================================
-- Migration: 20260219142506_27e4d0e2-0acc-450a-a6cb-f303613e3b61.sql
-- ============================================

-- Fix: Make super admin SELECT policy PERMISSIVE (not restrictive)
-- Drop the current restrictive policy
DROP POLICY IF EXISTS "Super admins view all clients" ON public.clients;

-- Recreate as a PERMISSIVE policy (default in Postgres)
CREATE POLICY "Super admins view all clients"
ON public.clients
FOR SELECT
USING (is_super_admin(auth.uid()));

-- ============================================
-- Migration: 20260219143309_1331f787-f9cb-4bb0-a1a8-a9d94cebc2a9.sql
-- ============================================

-- Drop ALL SELECT policies on clients and recreate them correctly
-- The root cause: all policies were RESTRICTIVE (AS RESTRICTIVE), which means
-- PostgreSQL requires ALL of them to pass simultaneously — impossible for super admin.
-- We need at least one PERMISSIVE policy per user type.

DROP POLICY IF EXISTS "Super admins view all clients" ON public.clients;
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Clients can view their own client record" ON public.clients;
DROP POLICY IF EXISTS "Shopify users view own client record" ON public.clients;

-- Recreate as PERMISSIVE (default in Postgres — no AS RESTRICTIVE keyword)
-- These will be ORed together, so any one passing = row is visible

CREATE POLICY "Super admins view all clients"
ON public.clients
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own clients"
ON public.clients
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Clients can view their own client record"
ON public.clients
FOR SELECT
TO authenticated
USING (auth.uid() = client_user_id);

CREATE POLICY "Shopify users view own client record"
ON public.clients
FOR SELECT
TO authenticated
USING ((shop_domain IS NOT NULL) AND can_access_shop(auth.uid(), shop_domain));

-- ============================================
-- Migration: 20260219144900_70423e0e-69af-4884-a177-cfc92a4423d9.sql
-- ============================================

-- Create steve_knowledge table
CREATE TABLE public.steve_knowledge (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria text NOT NULL,
  titulo text NOT NULL,
  contenido text NOT NULL,
  activo boolean DEFAULT true,
  orden integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.steve_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage all knowledge"
ON public.steve_knowledge
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can view active knowledge"
ON public.steve_knowledge
FOR SELECT
TO authenticated
USING (activo = true);

-- Create steve_bugs table
CREATE TABLE public.steve_bugs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria text NOT NULL,
  descripcion text NOT NULL,
  ejemplo_malo text,
  ejemplo_bueno text,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.steve_bugs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage all bugs"
ON public.steve_bugs
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can view active bugs"
ON public.steve_bugs
FOR SELECT
TO authenticated
USING (activo = true);

-- ============================================
-- Migration: 20260219193955_e03361c9-f0b9-4126-88ed-f8fcd468a8be.sql
-- ============================================

-- Add fase_negocio and presupuesto_ads columns to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS fase_negocio text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS presupuesto_ads bigint DEFAULT NULL;

-- ============================================
-- Migration: 20260219234648_d0fbd703-8295-433d-ba7b-0d60e15e6f15.sql
-- ============================================
ALTER TABLE public.ad_creatives
  ADD COLUMN IF NOT EXISTS dct_copies jsonb,
  ADD COLUMN IF NOT EXISTS dct_titulos jsonb,
  ADD COLUMN IF NOT EXISTS dct_descripciones jsonb,
  ADD COLUMN IF NOT EXISTS dct_briefs jsonb,
  ADD COLUMN IF NOT EXISTS dct_imagenes jsonb;
-- ============================================
-- Migration: 20260219235400_e27e55f4-dace-4301-b48a-9713d3656a2c.sql
-- ============================================
create table if not exists public.ad_assets (
  id uuid default gen_random_uuid() primary key,
  creative_id uuid references public.ad_creatives(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  asset_url text,
  tipo text default 'imagen',
  created_at timestamp with time zone default now()
);

alter table public.ad_assets enable row level security;

create policy "Clients can insert their own ad assets"
  on public.ad_assets for insert
  with check (exists (
    select 1 from public.clients
    where clients.id = ad_assets.client_id
      and (clients.client_user_id = auth.uid() or clients.user_id = auth.uid())
  ));

create policy "Clients can view their own ad assets"
  on public.ad_assets for select
  using (exists (
    select 1 from public.clients
    where clients.id = ad_assets.client_id
      and (clients.client_user_id = auth.uid() or clients.user_id = auth.uid())
  ));

create policy "Super admins manage all ad assets"
  on public.ad_assets for all
  using (is_super_admin(auth.uid()));
-- ============================================
-- Migration: 20260221100000_add_pending_question_index.sql
-- ============================================
-- Persist which question is "pending" after a rejection so the next message is treated as retry (same question).
-- Fixes bug: after [RECHAZO] user sends new answer but Steve was advancing to next question.
ALTER TABLE public.steve_conversations
  ADD COLUMN IF NOT EXISTS pending_question_index integer;

COMMENT ON COLUMN public.steve_conversations.pending_question_index IS 'When set, the next user message is a retry for this question index (0-based). Cleared when answer is accepted.';

