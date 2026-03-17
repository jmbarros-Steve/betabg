# MISIÓN: BLOQUE C — Self-Healing + Auto-Reglas + Calibración
Eres Diego W8. Tu trabajo: implementar C.4, C.5, C.6 del BLOQUE C.

cd ~/steve && git pull

## C.4 — Self-Healing Tests
- Crear: src/lib/healing-locator.ts
- Función resilientClick(page, selectors[]) con fallbacks
- Si selector principal falla → usa fallback y logea en qa_log
- NO instalar healenium, usar versión simple con fallbacks

## C.5 — Auto-generación de reglas
- Crear: cloud-run-api/src/routes/cron/auto-rule-generator.ts
- Cuando error sin regla → Claude Haiku genera regla nueva
- Inserta en criterio_rules con auto=true
- Registrar ruta en routes/index.ts

## C.6 — Calibración automática de reglas
- Crear: cloud-run-api/src/routes/cron/rule-calibrator.ts
- Cron: Domingo 3am (después de RCA a las 2am)
- Detecta reglas que rechazan >80% (mal calibrada)
- Detecta reglas que nunca rechazan en 50+ evaluaciones (inútil)
- Registrar ruta en routes/index.ts
- Auth: X-Cron-Secret header

## REGLAS
- Usar getSupabaseAdmin() de ../../lib/supabase.js
- Model: claude-haiku-4-5-20251001
- Commitea cada paso
