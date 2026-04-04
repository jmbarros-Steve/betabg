# Tomás W7 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `steve_knowledge` | category, rule_text, quality_score, times_used, approval_status, auto | 487 reglas activas |
| `steve_knowledge_versions` | knowledge_id, version, snapshot | Activa |
| `steve_sources` | url, content, relevance_score, created_at | **0 filas (VACIO)** |
| `steve_conversations` | client_id, thread_id, created_at | Activa |
| `steve_messages` | conversation_id, role, content | Activa |
| `steve_episodic_memory` | client_id, event, context, created_at | Activa |
| `steve_working_memory` | client_id, key, value, updated_at | Activa |
| `steve_feedback` | message_id, rating, comment | Activa |
| `steve_training_examples` | input, expected_output, category | Activa |
| `steve_training_feedback` | example_id, feedback | Activa |
| `steve_ab_tests` | feature, variant_a, variant_b, winner | Activa |
| `steve_bugs` | title, severity, status, agent_code | Activa |
| `steve_commitments` | agent_code, commitment, due_date | Activa |
| `steve_fix_queue` | bug_id, fix_status, assigned_to | Activa |
| `learning_queue` | source, insight, status, created_at | Activa |
| `swarm_runs` | query, status, insights_count, created_at | 16 exitosos de 360 |
| `swarm_sources` | url, topic, created_at | **0 filas (VACIO)** |
| `auto_learning_digests` | date, content, approved | Activa |
| `study_resources` | url, title, category | Activa |

## Tablas que Lees (de otros agentes)
| Tabla | Dueño | Para qué la lees |
|-------|-------|-----------------|
| `qa_log` | Javiera W12 | Para agent loop PERCEIVE |
| `campaign_metrics` | Felipe W2 | Para agent loop PERCEIVE |
| `creative_history` | Valentín W18 | Para context in steve-chat |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| swarm-research-2h | `0 */2 * * *` | /api/cron/swarm-research | Activo (95% failure) |
| steve-content-hunter-20min | `*/20 * * * *` | /api/cron/steve-content-hunter | Activo (writes to 0 rows) |
| steve-agent-loop-2h | `0 */2 * * *` | /api/cron/steve-agent-loop | Activo |
| steve-discoverer-sun-2am | `0 2 * * 0` | /api/cron/steve-discoverer | Activo |
| auto-learning-digest-9am | `0 9 * * *` | /api/cron/auto-learning-digest | Activo |
| knowledge-quality-score-sun-5am | `0 5 * * 0` | /api/cron/knowledge-quality-score | Activo |
| knowledge-dedup-monthly | `0 6 1 * *` | /api/cron/knowledge-dedup | Activo |
| knowledge-decay-monthly | `0 4 1 * *` | /api/cron/knowledge-decay | Activo |
| knowledge-consolidator-monthly | `0 5 1 * *` | /api/cron/knowledge-consolidator | Activo |
| steve-prompt-evolver-sun-3am | `0 3 * * 0` | /api/cron/steve-prompt-evolver | Activo |
| cross-client-learning-monthly | `0 3 1 * *` | /api/cron/cross-client-learning | Activo |

## Tus Archivos
- Backend: `cloud-run-api/src/routes/ai/steve-chat.ts` (120KB), `cloud-run-api/src/routes/cron/swarm-research.ts`, `steve-content-hunter.ts`, `steve-agent-loop.ts`, `steve-discoverer.ts`, `auto-learning-digest.ts`, `knowledge-quality-score.ts`, `knowledge-dedup.ts`, `knowledge-decay.ts`, `knowledge-consolidator.ts`, `steve-prompt-evolver.ts`, `cross-client-learning.ts`
- Frontend: ninguno
- Edge Functions: `steve-chat`, `train-steve`, `learn-from-source`, `steve-bulk-analyze`
- Libs: `cloud-run-api/src/lib/knowledge-versioner.ts`

## Tus Edge Functions
- `steve-chat`
- `train-steve`
- `learn-from-source`
- `steve-bulk-analyze`

## Dependencias
- Necesitas de: Diego W8 (steve_sources data), Firecrawl API (scraping)
- Alimentas a: TODOS (steve_knowledge used by chat, copy, criterio, espejo, juez)

## Problemas Conocidos
- steve_sources=0 (Content Hunter corre para NADA)
- swarm_sources=0
- swarm 95% failure rate (16 exitosos de 360)
- approval_status='pending' acumulandose
- Posibles reglas contradictorias en steve_knowledge
