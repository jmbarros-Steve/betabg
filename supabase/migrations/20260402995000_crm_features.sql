-- CRM Features: Timeline, Tasks, Proposals
-- Created: 2026-04-02

-- 1. Timeline de eventos del prospecto
CREATE TABLE IF NOT EXISTS public.wa_prospect_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES wa_prospects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'message_in','message_out','stage_change','score_change','meeting_booked','meeting_cancelled','note_added','task_created','proposal_sent'
  event_data JSONB DEFAULT '{}',
  created_by TEXT, -- 'steve','system','admin:{user_id}'
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_prospect_events_prospect ON wa_prospect_events(prospect_id, created_at DESC);

-- 2. Campos extra en wa_prospects
ALTER TABLE wa_prospects
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 3. Tareas de venta vinculadas a prospectos
CREATE TABLE IF NOT EXISTS public.sales_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID REFERENCES wa_prospects(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'manual', -- 'manual','auto_followup','auto_meeting_prep','auto_proposal'
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sales_tasks_prospect ON sales_tasks(prospect_id);
CREATE INDEX idx_sales_tasks_assigned ON sales_tasks(assigned_to, status);

-- 4. Propuestas/Cotizaciones
CREATE TABLE IF NOT EXISTS public.proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES wa_prospects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  plan_type TEXT, -- 'basico','profesional','enterprise','custom'
  monthly_price INTEGER,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','accepted','rejected')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_proposals_prospect ON proposals(prospect_id);

-- RLS
ALTER TABLE wa_prospect_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage prospect events" ON wa_prospect_events FOR ALL
  USING (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND (u.raw_user_meta_data->>'role')::text IN ('admin','super_admin')));

CREATE POLICY "Admins manage sales tasks" ON sales_tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND (u.raw_user_meta_data->>'role')::text IN ('admin','super_admin')));

CREATE POLICY "Admins manage proposals" ON proposals FOR ALL
  USING (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND (u.raw_user_meta_data->>'role')::text IN ('admin','super_admin')));
