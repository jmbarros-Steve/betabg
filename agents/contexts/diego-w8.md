# Diego W8 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `clients` | id, business_name, created_at, status | 127 rows |
| `user_roles` | user_id, role (admin/client) | OK |
| `platform_connections` | client_id, platform, encrypted_token, expires_at, status | ~3 activas de 127 |
| `tasks` | agent_code, title, severity, status, created_at | OK |
| `agent_sessions` | agent_code, personality_md, status_md, memory_md, updated_at | OK |
| `backlog` | title, priority, status | OK |
| `steve_sources` | url, content, relevance_score, created_at | **0 filas (VACIO)** |
| `swarm_sources` | url, topic, created_at | **0 filas (VACIO)** |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `steve_knowledge` | Tomas W7 | Verificar que las fuentes alimenten el brain |
| `swarm_runs` | Tomas W7 | Monitorear ejecucion del swarm (16 exitosos de 360 posibles) |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| (ninguno) | — | — | Diego no tiene crons directos |

## Tus Archivos
- Backend: `supabase/migrations/*.sql` (142 archivos)
- Frontend: (ninguno directo)
- Edge Functions: (ninguna directa — mantiene el schema que todas usan)
- Libs: RPCs `encrypt_platform_token`, `decrypt_platform_token`
- Env var: `ENCRYPTION_KEY`

## Tus Edge Functions
Diego no mantiene edge functions directamente. Su dominio es el schema, las migraciones y las RLS policies que todas las edge functions consumen.

## Dependencias
- Necesitas de: nadie (eres la base)
- Alimentas a: TODOS (schema, RLS, datos, tokens encriptados)

## Problemas Conocidos
- `steve_sources` = 0 filas — el brain no tiene fuentes de contenido
- `swarm_sources` = 0 filas — el swarm no tiene fuentes de busqueda
- Solo 3 `platform_connections` activas de 127 clientes registrados
- Migraciones pendientes de aplicar al nuevo Supabase (zpswjccsxjtnhetkkqde)
- `swarm_runs`: solo 16 exitosos de 360 posibles (tasa de exito 4.4%)
