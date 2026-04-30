-- steve_proposals — Propuestas estructuradas que Steve genera para precargar wizards.
-- Dueño funcional del schema: Michael W25 (genera) + dueños de canal (consumen vía wizard).
-- Code review: Javiera W12 (RLS/integridad) + Diego W8 (DB).
--
-- Modelo "Steve propone, merchant ejecuta": Steve no ejecuta operaciones complejas.
-- Genera el JSON, lo guarda acá, y manda al merchant un link al wizard del dueño de canal.
-- El wizard lee la propuesta con `?proposal=<id>`, precarga campos, y el merchant publica.

CREATE TABLE IF NOT EXISTS public.steve_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Tipo de propuesta — debe coincidir con el wizard que la consume.
  -- Valores válidos definidos por dueños de canal en sus contexts.
  proposal_type text NOT NULL CHECK (proposal_type IN (
    'meta_campaign',         -- Felipe W2 — wizard CampaignCreateWizard
    'meta_audience',         -- Felipe W2 — MetaAudienceManager
    'google_campaign',       -- Andrés W3
    'google_pmax',           -- Andrés W3
    'klaviyo_flow',          -- Rodrigo W0 — flow canvas
    'klaviyo_campaign',      -- Rodrigo W0
    'email_ab_test',         -- Valentina W1
    'email_template',        -- Valentina W1
    'shopify_promotion',     -- Matías W13 (descuento + creative bundle)
    'creative_brief',        -- Valentín W18 — Brief Estudio
    'wa_merchant_campaign'   -- Paula W19 — campaña WA del merchant a sus clientes
  )),

  -- Blob precargable del wizard. Schema por tipo en docs/STEVE-PROPOSALS-CONTRACT.md
  proposal_data jsonb NOT NULL,

  -- Resumen humano corto (lo que Steve dice al merchant en el chat)
  summary text NOT NULL,
  -- Razonamiento (por qué Steve propone esto) — usado para feedback loop de Tomás W7
  reasoning text,

  -- Estado del flujo
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',     -- Recién creada, todavía no abierta
    'opened',      -- Merchant abrió el link
    'edited',      -- Merchant ajustó campos del wizard
    'published',   -- Merchant ejecutó (campaña/flow/test creado)
    'discarded',   -- Merchant descartó explícitamente
    'expired'      -- TTL alcanzado sin acción (ver expires_at)
  )),

  -- Trazabilidad de la conversación que la generó
  steve_conversation_id uuid REFERENCES public.steve_conversations(id) ON DELETE SET NULL,
  steve_message_id uuid REFERENCES public.steve_messages(id) ON DELETE SET NULL,
  channel text CHECK (channel IN ('in_app', 'wa_cmo')),  -- por dónde se ofreció

  -- Resultado de la ejecución (cuando status='published')
  -- ej: { "campaign_id": "23856...", "ad_set_ids": [...], "ad_ids": [...] }
  execution_result jsonb,

  -- Timestamps del flujo
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  published_at timestamptz,
  discarded_at timestamptz,
  discarded_reason text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX IF NOT EXISTS idx_steve_proposals_client_status
  ON public.steve_proposals (client_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_steve_proposals_type_status
  ON public.steve_proposals (proposal_type, status);

CREATE INDEX IF NOT EXISTS idx_steve_proposals_conversation
  ON public.steve_proposals (steve_conversation_id)
  WHERE steve_conversation_id IS NOT NULL;

-- RLS
ALTER TABLE public.steve_proposals ENABLE ROW LEVEL SECURITY;

-- Owner del client puede leer/actualizar sus propuestas (publicar/descartar desde wizard)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'steve_proposals' AND policyname = 'steve_proposals_owner_select') THEN
    CREATE POLICY steve_proposals_owner_select ON public.steve_proposals
      FOR SELECT
      USING (
        client_id IN (
          SELECT id FROM public.clients WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'steve_proposals' AND policyname = 'steve_proposals_owner_update') THEN
    CREATE POLICY steve_proposals_owner_update ON public.steve_proposals
      FOR UPDATE
      USING (
        client_id IN (
          SELECT id FROM public.clients WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        client_id IN (
          SELECT id FROM public.clients WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'steve_proposals' AND policyname = 'steve_proposals_admin_all') THEN
    CREATE POLICY steve_proposals_admin_all ON public.steve_proposals
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- Service role bypass (Steve generador desde Cloud Run usa service role)
-- No requiere policy adicional: service role bypasses RLS by default.

-- Auto-expiry trigger (cron-friendly): si querés expirar via cron, query es:
--   UPDATE public.steve_proposals
--   SET status = 'expired'
--   WHERE status = 'pending' AND expires_at < now();

COMMENT ON TABLE public.steve_proposals IS
  'Propuestas estructuradas generadas por Steve (Michael W25) que precargan wizards de canales (Felipe/Andrés/Rodrigo/Valentina/Matías/Valentín). Modelo: Steve propone, merchant ejecuta. Schema por tipo en docs/STEVE-PROPOSALS-CONTRACT.md.';

COMMENT ON COLUMN public.steve_proposals.proposal_data IS
  'JSON precargable. El formato por proposal_type lo define el dueño de canal en agents/contexts/{nombre}.md sección "Steve Tools / Wizard precargable".';

COMMENT ON COLUMN public.steve_proposals.execution_result IS
  'Resultado al publicar: IDs de la entidad creada en la plataforma (campaign_id Meta, flow_id Klaviyo, etc.). Usado para trazabilidad y aprendizaje.';
