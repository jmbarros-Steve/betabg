# Isidora W6 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `criterio_rules` | name, category, check_rule, weight, severity, auto, reject_rate | 493 reglas activas |
| `criterio_results` | rule_id, content_id, content_type, score, passed, failed_rules | Activa |

## Tablas que Lees (de otros agentes)
| Tabla | Dueño | Para qué la lees |
|-------|-------|-----------------|
| `creative_history` | Valentín W18 | Resultados reales para calibrar |
| `brand_research` | Ignacio W17 | Contexto de marca para evaluación |
| `email_campaigns` | Valentina W1 | Emails a evaluar |
| `meta_campaigns` | Felipe W2 | Campañas a evaluar |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| rule-calibrator-sun-3am | `0 3 * * 0` | /api/cron/rule-calibrator | Activo |
| auto-rule-generator | on demand | /api/cron/auto-rule-generator | Activo |
| execute-meta-rules-9am | `0 9 * * *` | /api/cron/execute-meta-rules | Activo (shared with Felipe W2) |

## Tus Archivos
- Backend: `cloud-run-api/src/routes/ai/criterio-meta.ts`, `criterio-email.ts`
- Frontend: ninguno
- Edge Functions: `evaluate-rules`, `criterio-setup`
- Libs: ninguno

## Tus Edge Functions
- `evaluate-rules`
- `criterio-setup`

## Dependencias
- Necesitas de: Valentín W18 (creative_history para calibrar), Ignacio W17 (brand_research)
- Alimentas a: Felipe W2 (gate Meta), Valentina W1 (gate Email), TODOS (code review lógica)

## Problemas Conocidos
- Reglas auto-generadas sin revisión humana
- Posibles contradicciones entre categorías
- Algunas reglas con reject_rate >80% (demasiado estrictas) o <1% (inútiles)

## Patrones de error frecuentes (para cross-review)
- Funciones sin manejo de null/undefined
- Error messages genéricos ("Something went wrong")
- Over-engineering en cambios simples
- Tipos `any` innecesarios en TypeScript
- Código muerto o imports sin usar
