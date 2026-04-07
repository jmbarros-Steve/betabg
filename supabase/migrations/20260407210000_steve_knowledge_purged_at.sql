-- =========================================================================
-- Soft-delete Fase 1: marca zombis de steve_knowledge con purged_at
-- =========================================================================
--
-- Autor: Tomás W7 (Steve AI / Cerebro) — 2026-04-07
-- Aplicada: 2026-04-07 via edge function temporal `apply-mig-20260407210000`
--           (workaround por bloqueo de `supabase db push` con migraciones
--           fantasma en remote history — misma patología que enfrentó
--           Javiera W12 antes).
--
-- DESCUBRIMIENTO durante ejecución:
--   1. La tabla `juez_golden_questions` NO existe (Javiera W12 la mencionó
--      como blocker con info obsoleta).
--   2. La ÚNICA FK apuntando a steve_knowledge es
--      `steve_knowledge_versions.knowledge_id` con ON DELETE CASCADE →
--      el DELETE bulk original NUNCA habría sido bloqueado por integridad.
--   3. Soft-delete sigue siendo preferible por: reversibilidad, trazabilidad,
--      ventana de rescate 30d, idempotencia del UPDATE.
--
-- Estrategia en 2 fases:
--   Fase 1 (esta migration): agregar columna `purged_at`, marcar candidatas
--                            con filtro restrictivo. Reversible.
--   Fase 2 (cron mensual futuro `knowledge-hard-purge-monthly`): hard-delete
--          de las que llevan >30 días con purged_at. Hasta entonces hay ventana
--          de rescate (UPDATE purged_at = NULL).
--
-- Filtro:
--   1. approval_status IN ('rejected', 'pending') — nunca 'approved'.
--   2. created_at < NOW() - 30 days — cosas viejas.
--   3. purged_at IS NULL — idempotente, re-ejecuciones no pisan marcas previas.
--
-- Candidatas al momento de aplicar: 0 (0 rejected + 578 pending pero todas <2 días).
--
-- =========================================================================

-- 1. Agregar columna (idempotente)
ALTER TABLE steve_knowledge
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

COMMENT ON COLUMN steve_knowledge.purged_at IS
  'Soft-delete marker. Cuando != NULL, la regla está programada para hard-delete. Fase 2 (cron mensual) hará DELETE donde purged_at < NOW()-30d. Ventana de rescate: UPDATE purged_at = NULL antes de que expire.';

-- 2. Índice parcial para que el cron de fase 2 (hard-delete) sea O(log n)
CREATE INDEX IF NOT EXISTS idx_steve_knowledge_purged_at
  ON steve_knowledge (purged_at)
  WHERE purged_at IS NOT NULL;

-- 3. Dry-count antes del UPDATE (aparece en logs de supabase db push)
DO $$
DECLARE
  candidate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO candidate_count
  FROM steve_knowledge sk
  WHERE sk.approval_status IN ('rejected', 'pending')
    AND sk.created_at < NOW() - INTERVAL '30 days'
    AND sk.purged_at IS NULL;
  RAISE NOTICE '[soft-delete fase 1] candidatas a marcar con purged_at: %', candidate_count;
END $$;

-- 4. UPDATE marcando candidatas + qa_log condicional
WITH marked AS (
  UPDATE steve_knowledge sk
  SET purged_at = NOW()
  WHERE sk.approval_status IN ('rejected', 'pending')
    AND sk.created_at < NOW() - INTERVAL '30 days'
    AND sk.purged_at IS NULL
  RETURNING sk.id, sk.approval_status, sk.categoria
)
INSERT INTO qa_log (check_type, status, details, detected_by)
SELECT
  'soft_delete_phase_1',
  'pass',
  jsonb_build_object(
    'phase', 1,
    'marked_count', (SELECT COUNT(*) FROM marked),
    'by_approval_status', (
      SELECT jsonb_object_agg(approval_status, cnt)
      FROM (SELECT approval_status, COUNT(*) cnt FROM marked GROUP BY approval_status) s
    ),
    'by_categoria', (
      SELECT jsonb_object_agg(COALESCE(categoria, 'null'), cnt)
      FROM (SELECT categoria, COUNT(*) cnt FROM marked GROUP BY categoria) s
    ),
    'migration', '20260407210000_steve_knowledge_purged_at',
    'rescue_window_days', 30
  ),
  'migration/tomas-w7'
WHERE EXISTS (SELECT 1 FROM marked);
