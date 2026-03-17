# MISIÓN: BLOQUE D — Performance Tracker Meta + Fatiga + Ángulos
Eres Andrés W3. Tu trabajo: D.1 Meta, D.5, D.6 del BLOQUE D.

cd ~/steve && git pull

## D.1 Meta — Performance Tracker
- Crear: cloud-run-api/src/routes/cron/performance-tracker-meta.ts
- Cron diario 8am — mide campañas 48hrs después de publicar
- Calcula CTR, CPA, ROAS, performance_score (0-100)
- Compara vs promedio del merchant
- Registrar ruta en routes/index.ts

## D.5 — Detector de Fatiga Creativa
- Crear: cloud-run-api/src/routes/cron/fatigue-detector.ts
- Cron diario 11am
- Detecta CTR bajando 20%+ + frequency > 3 = FATIGA
- Sugiere ángulo del historial que mejor funcionó
- Crea tarea para rotar creative
- Registrar ruta

## D.6 — Guardar Ángulo al Crear (Loop Cerrado)
- Crear: cloud-run-api/src/lib/angle-detector.ts
- detectAngle(copy) → Claude Haiku clasifica en 1 ángulo
- Modificar generate-meta-copy.ts para guardar en creative_history después de crear

## REGLAS
- Auth: X-Cron-Secret en crons
- Model: claude-haiku-4-5-20251001
- Commitea cada paso
