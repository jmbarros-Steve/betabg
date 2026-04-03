-- Seller Calendars: Google Calendar OAuth for booking system
-- Sellers (sales team) connect their Google Calendar once.
-- Prospects book via public /agendar/:sellerId page → creates event with Google Meet.

CREATE TABLE IF NOT EXISTS public.seller_calendars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_name TEXT NOT NULL,
  seller_email TEXT,
  google_access_token_encrypted TEXT,
  google_refresh_token_encrypted TEXT,
  google_calendar_id TEXT DEFAULT 'primary',
  token_expires_at TIMESTAMPTZ,
  -- Working hours (Chile time)
  working_hours_start INTEGER DEFAULT 9,   -- 9am
  working_hours_end INTEGER DEFAULT 18,    -- 6pm
  working_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- Mon-Fri (1=Mon, 7=Sun)
  slot_duration_minutes INTEGER DEFAULT 15,
  buffer_minutes INTEGER DEFAULT 5,        -- Buffer between meetings
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS: sellers manage their own calendar, admins see all
ALTER TABLE public.seller_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar"
  ON public.seller_calendars
  FOR ALL
  USING (user_id = auth.uid());

-- Index for public booking page lookup
CREATE INDEX IF NOT EXISTS idx_seller_calendars_active
  ON public.seller_calendars (id)
  WHERE is_active = true;

-- Link wa_prospects to the seller they should book with
ALTER TABLE public.wa_prospects
  ADD COLUMN IF NOT EXISTS assigned_seller_id UUID REFERENCES public.seller_calendars(id);
