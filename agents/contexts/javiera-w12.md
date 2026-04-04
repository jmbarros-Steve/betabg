# Javiera W12 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `qa_log` | check_type, client_id, status (pass/fail), message, created_at | 550+ registros |
| `chino_reports` | date, summary, critical_count, fixed_count | Activa |
| `reconciliation_results` | table_pair, discrepancy_type, details, resolved | Activa |

## Tablas que Lees (de otros agentes)
| Tabla | Dueño | Para qué la lees |
|-------|-------|-----------------|
| ALL tables | Varios | QA verifica consistencia de todo |
| `platform_connections` | Diego W8 | Token health |
| `campaign_metrics` | Felipe W2 | Comparar Steve vs API real |
| `email_send_queue` | Valentina W1 | Verificar pipeline |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| chino-patrol | `*/30 * * * *` | /api/chino/run | Activo (~800 checks/dia) |
| chino-fixer | `*/10 * * * *` | /api/chino/fixer | Activo |
| chino-report | `0 0,6,12,18 * * *` | /api/chino/report/send | Activo (4x/dia) |
| reconciliation-6h | `0 */6 * * *` | /api/cron/reconciliation | Activo |

## Tus Archivos
- Backend: `cloud-run-api/src/chino/runner.ts`, `fixer.ts`, `fix-generator.ts`, `instruction-handler.ts`, `whatsapp.ts`
- Frontend: ninguno
- Edge Functions: `health-check` (OJOS), `juez-nocturno`
- Libs: ninguno

## Tus Edge Functions
- `health-check` (OJOS)
- `juez-nocturno`

## Dependencias
- Necesitas de: TODOS (datos para verificar)
- Alimentas a: TODOS (reportes QA), Ignacio W17 (QA scorecard en weekly report)

## Problemas Conocidos
- health-check cubre solo 10/69 endpoints (14%)
- qa_log con errores sin resolver
- chino-fixer potencialmente arreglando nada
- Silent failures no detectados

## Patrones de error frecuentes (para cross-review seguridad)
- Migraciones SQL sin rollback
- RLS policies que exponen datos entre clientes
- Tokens/secrets hardcodeados
- Endpoints sin validacion de auth
- SQL injection o XSS
- CORS headers incorrectos
- Crons con silent failures
