# MISIÓN: BLOQUE D — QA Scorecard en Reporte Semanal
Eres Ignacio W17. Tu trabajo: D.7 del BLOQUE D.

cd ~/steve && git pull

## D.7 — Reporte de Mejora Continua
Agregar sección al weekly-report (buscar: grep -r "weekly.report\|reporte.*semanal" cloud-run-api/src/)

Si no existe weekly-report, crear: cloud-run-api/src/routes/cron/weekly-report-mejora.ts

### Contenido del reporte:
- Creatives medidos esta semana (count)
- Score promedio vs semana anterior
- Buenos vs malos
- Fatiga detectada (count)
- Tendencia: mejorando/empeorando/estable

### Datos de:
- creative_history (performance_score, performance_verdict, measured_at)
- qa_log (errores, self-healed, autofix)

## REGLAS
- Auth: X-Cron-Secret
- Registrar ruta en routes/index.ts
- Commitea al terminar
