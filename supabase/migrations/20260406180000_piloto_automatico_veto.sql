-- Piloto Automático con Veto: nuevas columnas en steve_fix_queue
-- Permite clasificar fixes como auto/manual y gestionar aprobaciones

ALTER TABLE steve_fix_queue
  ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'manual'
    CHECK (difficulty IN ('auto','manual')),
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending_approval'
    CHECK (approval_status IN ('pending_approval','approved','rejected','auto_approved')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Backfill: fixes terminados → auto_approved, activos → pending_approval
UPDATE steve_fix_queue SET approval_status = 'auto_approved'
  WHERE status IN ('fixed','failed','escalated');
UPDATE steve_fix_queue SET approval_status = 'pending_approval'
  WHERE status IN ('pending','assigned','fixing');

-- RLS para que AdminCerebro (frontend) pueda leer/aprobar
CREATE POLICY "super_admin_read_fix_queue" ON steve_fix_queue
  FOR SELECT USING (is_super_admin(auth.uid()));

CREATE POLICY "super_admin_update_fix_queue" ON steve_fix_queue
  FOR UPDATE USING (is_super_admin(auth.uid()));

CREATE POLICY "super_admin_read_chino_routine" ON chino_routine
  FOR SELECT USING (is_super_admin(auth.uid()));

-- Index para queries de aprobación pendiente
CREATE INDEX IF NOT EXISTS idx_fix_queue_approval
  ON steve_fix_queue(approval_status) WHERE approval_status = 'pending_approval';
