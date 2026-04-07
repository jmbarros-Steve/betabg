# Audit: Destructurings Supabase sin error capture

**Fecha:** 2026-04-07
**Ejecutado por:** Tomás W7 (Fase 2 deuda técnica post 6-bugs-fix)
**Script:** `scripts/audit-supabase-error-capture.py`
**Reporte JSON:** `docs/audits/supabase-error-capture-2026-04-07.json`

## Contexto

En la auditoría del loop del Brain (commit `0ece3f3`, 7 abril 2026), Tomás W7 encontró 6 bugs silenciosos. 5 de los 6 tenían la misma causa raíz: queries Supabase destructuradas sin capturar `error`:

```typescript
// Patrón buggy (silent failure)
const { data: foo } = await supabase.from('x').select(...);
// Si falla: foo=null, el código sigue como si no hubiera data,
// el cron retorna "success" aunque la query murió.
```

Isidora W6 observó en el review que el patrón es sistémico. Este audit confirma la magnitud.

## Resultados

**457 casos** en el codebase de `cloud-run-api/src`:

| Severidad | Cantidad | Ubicación |
|-----------|----------|-----------|
| **CRITICAL** | 89 | `/routes/cron/` — corren sin supervisión |
| **HIGH** | 130 | `/lib/`, `/chino/`, `/routes/ai/` |
| **MEDIUM** | 86 | `/routes/meta`, `/google`, `/klaviyo`, `/shopify`, `/whatsapp` |
| **LOW** | 152 | Otras rutas, seed scripts |

## Top 10 archivos CRITICAL (crons)

| Casos | Archivo |
|------:|---------|
| 14 | `routes/cron/weekly-report.ts` |
| 6 | `routes/cron/prospect-followup.ts` |
| 5 | `routes/cron/detective-visual.ts` |
| 5 | `routes/cron/task-prioritizer.ts` |
| 4 | `routes/cron/merchant-upsell.ts` |
| 4 | `routes/cron/steve-agent-loop.ts` |
| 3 | `routes/cron/anomaly-detector.ts` |
| 3 | `routes/cron/churn-detector.ts` |
| 3 | `routes/cron/error-budget-calculator.ts` |
| 3 | `routes/cron/revenue-attribution.ts` |

Total crons afectados: **34 archivos**

## Top 10 archivos HIGH

| Casos | Archivo |
|------:|---------|
| 28 | `chino/checks/api-compare.ts` |
| 15 | `chino/checks/data-quality.ts` |
| 10 | `lib/steve-wa-brain.ts` |
| 9 | `routes/ai/generate-meta-copy.ts` |
| 7 | `chino/checks/security.ts` |
| 5 | `chino/checks/functional.ts` |
| 5 | `chino/whatsapp.ts` |
| 5 | `routes/ai/criterio-email.ts` |
| 5 | `routes/ai/criterio-meta.ts` |
| 4 | `lib/creative-context.ts` |

## Estrategia de fix

Arreglar los 457 casos manualmente en una sesión es irrealista. La estrategia escalonada es:

### Corto plazo (prevención, Fase 3 y 4)
1. **ESLint rule custom** (Fase 3): detectar el patrón en CI → bloquea nuevos bugs. Se activa como `warn` inicialmente para no romper builds existentes, se promociona a `error` cuando los CRITICAL estén arreglados.
2. **Helper `safeSupabaseQuery`** (Fase 4): wrapper que fuerza fail-fast. Migración opt-in.

### Mediano plazo (fixes priorizados por dueño)
Cada agente responsable arregla los casos de sus archivos cuando los toque:
- **Tomás W7**: crons `steve-*`, `knowledge-*` (los más críticos del Brain)
- **Sebastián W5**: `weekly-report`, `error-budget-calculator`, infra crons
- **Isidora W6 + Javiera W12**: `chino/checks/*` (28+15+7+5+5 = 60 casos)
- **Paula W19**: `steve-wa-brain`, `prospect-followup`, `onboarding-wa`
- **Felipe W2**: `routes/meta/*`, `generate-meta-copy`, `execute-meta-rules`

### Largo plazo (prevención permanente)
Cuando CRITICAL count llegue a 0:
- Promover ESLint rule de `warn` → `error`
- Agregar check al CI que corra `audit-supabase-error-capture.py --severity CRITICAL` y falle si retorna casos nuevos.

## Uso del script

```bash
# Todo el reporte (texto)
python3 scripts/audit-supabase-error-capture.py

# Solo CRITICAL
python3 scripts/audit-supabase-error-capture.py --severity CRITICAL

# JSON para procesamiento
python3 scripts/audit-supabase-error-capture.py --json > report.json

# Otro directorio
python3 scripts/audit-supabase-error-capture.py --dir cloud-run-api/src/lib
```

El script retorna exit code `1` si encuentra casos (útil para CI).

## Patrón correcto de referencia

```typescript
// BAD (actual, 457 sitios)
const { data: foo } = await supabase
  .from('x')
  .select('*');

// GOOD
const { data: foo, error: fooErr } = await supabase
  .from('x')
  .select('*');

if (fooErr) {
  console.error('[context] fetch foo failed:', fooErr.message);
  // degrade gracefully o fail-fast según criticidad
  return c.json({ error: 'failed_to_fetch_foo' }, 500);
}
// ahora foo es data válida o []
```

Para queries en `Promise.all`:

```typescript
// BAD
const [{ data: a }, { data: b }] = await Promise.all([...]);

// GOOD
const [aRes, bRes] = await Promise.all([...]);
if (aRes.error) console.error('[x] a fetch:', aRes.error.message);
if (bRes.error) console.error('[x] b fetch:', bRes.error.message);
const a = aRes.data || [];
const b = bRes.data || [];
```
