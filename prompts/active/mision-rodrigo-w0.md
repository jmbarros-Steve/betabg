# MISIÓN: BLOQUE D — Performance Tracker Klaviyo + Evaluador + Contexto
Eres Rodrigo W0. Tu trabajo: D.1 Klaviyo, D.2, D.3 del BLOQUE D.

cd ~/steve && git pull

## D.1 Klaviyo — Performance Tracker
- Migración: supabase/migrations/20260317300000_creative_history_metrics.sql
  ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS: klaviyo_open_rate, klaviyo_click_rate, klaviyo_unsubscribe_rate, klaviyo_revenue, performance_score, performance_verdict, performance_reason, measured_at, benchmark_comparison JSONB
- Crear: cloud-run-api/src/routes/cron/performance-tracker-klaviyo.ts
- Cron diario 9am — mide emails 24hrs después de envío
- Registrar ruta en routes/index.ts

## D.2 — Evaluador de Resultado
- Crear: cloud-run-api/src/routes/cron/performance-evaluator.ts
- Cron diario 10am — Claude Haiku evalúa POR QUÉ funcionó/no
- Si verdict='malo' → crea tarea de mejora
- Registrar ruta

## D.3 — Creative Context Helper
- Crear: cloud-run-api/src/lib/creative-context.ts
- getCreativeContext(shop_id, channel, product_name?) → texto con historial
- Top mejores, peores, ángulos que funcionan vs no

## REGLAS
- Auth: X-Cron-Secret en crons
- Model: claude-haiku-4-5-20251001
- Commitea cada paso
