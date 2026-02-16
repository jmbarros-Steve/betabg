
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
