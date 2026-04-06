-- Waitlist leads para landing pre-launch
CREATE TABLE IF NOT EXISTS public.waitlist_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  ecommerce_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','contacted','converted','spam')),
  notes TEXT,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_leads_email_unique
  ON public.waitlist_leads (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_waitlist_leads_created_at
  ON public.waitlist_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_waitlist_leads_status
  ON public.waitlist_leads (status) WHERE status = 'pending';

ALTER TABLE public.waitlist_leads ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede sumarse al waitlist (form público)
DROP POLICY IF EXISTS "Public can insert waitlist" ON public.waitlist_leads;
CREATE POLICY "Public can insert waitlist"
  ON public.waitlist_leads FOR INSERT WITH CHECK (true);

-- Solo super admins ven y administran
DROP POLICY IF EXISTS "Super admins manage waitlist" ON public.waitlist_leads;
CREATE POLICY "Super admins manage waitlist"
  ON public.waitlist_leads FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
