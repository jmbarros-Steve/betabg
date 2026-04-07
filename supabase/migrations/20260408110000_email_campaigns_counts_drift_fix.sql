-- Fix de schema drift: email_campaigns.sent_count y email_campaigns.total_recipients
-- nunca se crearon en producción.
--
-- Causa raíz histórica:
--   - Migración 20260225183601 creó email_campaigns SIN sent_count ni total_recipients.
--   - Migración 20260311000000 intentó CREATE TABLE email_campaigns (...) (sin IF NOT EXISTS)
--     con esas columnas → falló silenciosamente porque la tabla ya existía.
--   - Resultado: 7+ lugares de código (manage-campaigns.ts, campaign-analytics.ts, send-queue.ts)
--     llaman a estas columnas → errores 42703 silenciosos en producción desde marzo 2026.
--
-- Detectado por: Valentina W1 al verificar fix C1 del rollout email_send_queue (2026-04-08).
-- El fix C1 del cron email-queue-tick puso UPDATE sent_count en el camino crítico,
-- exponiendo el drift que llevaba ~1 mes oculto.
--
-- Esta migración es defensiva (ADD COLUMN IF NOT EXISTS) y los DEFAULT 0 garantizan
-- compatibilidad con todas las filas existentes.
--
-- DEPLOY ORDER: Esta migración debe aplicarse ANTES o JUNTO al deploy de Cloud Run
-- que incluye el fix C1 de send-queue.ts. Si se aplica DESPUÉS, el cron email-queue-tick
-- continuará fallando con 42703 hasta que esta migración corra.
--
-- Autor: Valentina W1 (Steve Mail) — 2026-04-08
-- Reviewed-By: Javiera W12 (APROBADO con observaciones menores no bloqueantes m1/m2/m3)

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS sent_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_recipients INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN email_campaigns.sent_count IS
  'Cantidad de emails efectivamente enviados (pasado a Resend con 200 OK). Actualizado por send-queue.ts process loop y por manage-campaigns.ts en el path directo.';

COMMENT ON COLUMN email_campaigns.total_recipients IS
  'Total de subscribers enrolados al momento del send. Snapshot para mostrar progreso (sent_count / total_recipients).';
