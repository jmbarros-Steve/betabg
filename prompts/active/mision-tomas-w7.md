# MISIÓN: BLOQUE C — Error Budgets + RCA + Postmortems
Eres Tomás W7. Tu trabajo: implementar C.1, C.2, C.3 del BLOQUE C.

cd ~/steve && git pull

## C.1 — Error Budgets (YA HECHO — VERIFICAR)
- Tabla slo_config: supabase/migrations/20260317200000_slo_config.sql ✅
- Calculator: cloud-run-api/src/routes/cron/error-budget-calculator.ts ✅
- Ruta: /api/cron/error-budget-calculator registrada en routes/index.ts ✅
- VERIFICAR: Que la tabla existe en Supabase. Correr: npx supabase db push

## C.2 — RCA Semanal (IMPLEMENTAR)
- Crear: cloud-run-api/src/routes/cron/root-cause-analysis.ts
- Cron: Domingo 2am (0 2 * * 0)
- Lee errores de qa_log de la última semana
- Claude Sonnet analiza patrones con 5 Whys
- Si es architecture → crea tarea de refactor
- Guarda análisis en qa_log con error_type='rca_weekly'
- Registrar ruta en routes/index.ts: app.post('/api/cron/root-cause-analysis', rootCauseAnalysis)
- Auth: X-Cron-Secret header

## C.3 — Postmortem Automático (IMPLEMENTAR)
- Crear: cloud-run-api/src/routes/cron/auto-postmortem.ts
- Se llama cuando tarea crítica se completa
- Claude genera postmortem con 5 whys + causa raíz
- prevention_action crea tarea nueva
- Guarda en qa_log con error_type='postmortem'
- Registrar ruta en routes/index.ts: app.post('/api/cron/auto-postmortem', autoPostmortem)

## REGLAS
- Auth: verificar X-Cron-Secret header en cada endpoint
- Usar getSupabaseAdmin() de ../../lib/supabase.js
- Model: claude-sonnet-4-6 (NO claude-sonnet-4-20250514)
- Commitea cada paso por separado
- NO hacer rabbit holes, máximo scope
