# Michael W25 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `steve_conversations` | client_id, conversation_type='estrategia' | Lectura/escritura — conversaciones de la tab Estrategia |
| `steve_messages` | conversation_id, role, content, created_at | Lectura/escritura — mensajes de la tab Estrategia |

## Tablas que Lees (de otros agentes)
| Tabla | Dueño | Para qué la lees |
|-------|-------|-----------------|
| `buyer_personas` | Bastián W24 | Inyectar contexto de marca en system prompt de estrategia |
| `brand_research` | Bastián W24 / Ignacio W17 | Contexto de competencia y posicionamiento |
| `steve_knowledge` | Tomás W7 | Knowledge global y client-specific inyectado por categoría |
| `steve_commitments` | Tomás W7 | Compromisos pendientes que Steve debe traer a colación |
| `platform_connections` | Diego W8 | Saber qué canales tiene activos antes de recomendar |
| `email_campaigns` / `email_templates` | Valentina W1 / Rodrigo W0 | Lectura del contenido de mails de estrategia (no edición de infra) |

## Zona Protegida — NO escribís acá
| Archivo | Dueño | Tu rol |
|---------|-------|--------|
| `cloud-run-api/src/routes/ai/steve-chat.ts` (Brief Q0→Q16) | Bastián W24 + JM | Fuera de scope total — extracción del modo estrategia ya completada (2026-04-27) |
| Infra de envío de mails (Resend, Klaviyo, SES) | Valentina W1 / Rodrigo W0 | Solo proponés cambios al contenido |

## Tus Crons
_(Ninguno propio aún — los mails de estrategia se disparan vía crons que pertenecen a Valentina W1 / Rodrigo W0; tú definís el contenido, no el schedule)_

## Tus Archivos
- Frontend: `src/components/client-portal/SteveEstrategia.tsx` (~423 líneas — componente principal de la tab)
- Frontend: `src/components/client-portal/SteveStrategyChat.tsx` (251 líneas — chat reutilizable)
- Frontend: `src/pages/ClientPortal.tsx` (registro de la tab — L18 import, L57 TabType, L216 validTabs, L331 menú, L559-563 render)
- **Backend: `cloud-run-api/src/routes/ai/strategy-chat.ts` (~870 líneas — DUEÑO directo desde 2026-04-27)**
- Mails (contenido — TBD): `src/components/client-portal/email/emailTemplates.ts` (107KB, parte relevante a estrategia), templates en `cloud-run-api/src/routes/email/`

## Endpoints que usás
- `callApi('strategy-chat', { body: { client_id, conversation_id, message } })` — chat principal (POST `/api/strategy-chat`)
- `callApi('check-client-connections', { body: { client_id } })` — banner "sin conexiones"

## Dependencias
- **Necesitas de:**
  - Bastián W24 — brief completo (`buyer_personas.is_complete`) es prerequisito para que la tab Estrategia se active
  - Tomás W7 — `steve_knowledge` (categorías: brief, meta_ads, buyer_persona, seo, google_ads, klaviyo, shopify) y `steve_commitments`
  - Diego W8 — `platform_connections` para saber qué canales recomendar
  - Valentina W1 — infra de envío de mails (vos das el copy, ella lo manda)
  - Rodrigo W0 — si los mails de estrategia van por Klaviyo
- **Alimentás a:**
  - El cliente directamente (vía tab Estrategia + mails) — no hay agente downstream

## Problemas Conocidos
- `categoriaRelevante` (strategy-chat.ts) es una heurística simple de keywords — puede clasificar mal mensajes ambiguos ("metaverso" → meta_ads)
- Sin distinción de UI clara entre "cliente sin brief", "cliente sin conexiones" y "cargando" en SteveEstrategia
- Mails de estrategia: aún no hay inventario claro de cuáles existen, cuándo se disparan y desde dónde
- Helpers `sanitizeMessagesForAnthropic` y `truncateMessages` viven en steve-chat.ts (importados via `export`) — si Bastián los toca, te afecta. Coordinar antes de cambios estructurales.

## Archivos GRANDES (leer antes de tocar)
| Archivo | Tamaño | Notas |
|---------|--------|-------|
| `strategy-chat.ts` | ~870 líneas | TUYO — editás libre |
| `BrandBriefView.tsx` | 287KB | NO es tuyo (Bastián W24) — solo lectura para entender qué datos tiene el cliente |
| `emailTemplates.ts` | 107KB | Compartido — vos solo el contenido de mails de estrategia |
