# STEVE BRAIN — Sistema de Inteligencia AI

## Arquitectura General

Steve Brain es un sistema multi-agente construido sobre Claude (Haiku, Sonnet, Opus) que aprende de datos de merchants, competencia y patrones cross-client para generar recomendaciones de marketing cada vez más inteligentes.

**Filosofía:**
- **Pipeline 3-Cerebros**: Investigador → Estratega → Conversador
- **Aprendizaje continuo**: Cada interacción genera conocimiento nuevo
- **Quality Gates**: Todo insight debe ser aprobado antes de usarse
- **Multi-Categoría**: Un insight puede aplicar a múltiples áreas simultáneamente

---

## 1. CEREBROS PRINCIPALES

### 1.1 Steve WA Brain
**Archivo:** `cloud-run-api/src/lib/steve-wa-brain.ts`

Sistema de engagement por WhatsApp con prospectos. Carga datos del merchant (métricas, campañas, brief), integra historial de mensajes, hace scoring BANT y push a HubSpot cuando califica.

**Tablas:** `wa_prospects`, `wa_messages`, `clients`, `campaign_metrics`

### 1.2 Steve Multi-Brain (Pipeline 3-Cerebros)
**Archivo:** `cloud-run-api/src/lib/steve-multi-brain.ts`

Conversación WhatsApp en 5-7 segundos total:

| Cerebro | Modelo | Tiempo | Función |
|---------|--------|--------|---------|
| **Investigador** | Haiku | ~1s | Carga datos pre-scrapeados del prospecto, competitor ads, sales learnings |
| **Estratega** | Haiku | ~1.5s | Analiza estado emocional, posición en funnel, decide táctica y tono |
| **Conversador** | Sonnet | ~3-5s | Genera mensaje final con knowledge rules inyectadas |

**Acciones del Estratega:**
`validate_emotion` | `ask_discovery` | `show_data` | `pitch_soft` | `pitch_hard` | `send_case_study` | `suggest_meeting` | `close_trial` | `back_off`

### 1.3 Steve Strategy
**Archivo:** `cloud-run-api/src/routes/ai/steve-strategy.ts`

Chat estratégico de marca. Detecta categorías relevantes del mensaje del usuario, carga reglas de `steve_knowledge` matching, inyecta bloque de conocimiento y responde con Claude.

**Categorías detectadas:** meta_ads, google_ads, klaviyo, shopify, brief, buyer_persona, anuncios

---

## 2. SISTEMA DE CONOCIMIENTO

### 2.1 Tabla `steve_knowledge`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `categoria` | string | meta_ads, google_ads, klaviyo, shopify, anuncios, brief, analisis, sales_learning, cross_channel, seo, prospecting |
| `titulo` | string(80) | Título accionable |
| `contenido` | text | Formato: CUANDO → HAZ → PORQUE |
| `approval_status` | string | pending, approved, rejected |
| `orden` | int(0-99) | Prioridad (99=más relevante) |
| `confidence` | int(1-10) | Confianza del swarm |
| `quality_score` | int(0-100) | Auto-calculado semanalmente |
| `veces_usada` | int | Contador de uso |
| `insight_group_id` | UUID | Vincula siblings multi-categoría |
| `swarm_run_id` | UUID | Trazabilidad al swarm run |
| `client_id` | UUID | Opcional: reglas específicas por cliente |

**Formato obligatorio del contenido:**
```
CUANDO: Situación específica donde aplica
HAZ:
  1. Acción concreta 1
  2. Acción concreta 2
PORQUE: Razón con datos (%, $, benchmarks)
```

### 2.2 Multi-Categoría (insight_group_id)

Un insight como "cuotas sin interés suben conversión 35%" aplica a shopify, meta_ads Y klaviyo. En vez de una fila con array, se insertan **múltiples filas** con el mismo `insight_group_id`.

```
Swarm → Opus: categorias: ["shopify", "meta_ads", "klaviyo"]
  ↓
3 filas en steve_knowledge (insight_group_id compartido)
  ↓
JM aprueba UNA → las 3 se aprueban automáticamente
  ↓
generate-meta-copy busca "meta_ads"  → ✅ la encuentra
klaviyo-smart-format busca "klaviyo" → ✅ la encuentra
```

### 2.3 Flujo de Aprobación

```
pending (nuevo del swarm) → approved (JM aprueba ✅) → activo en prompts
                         → rejected (JM rechaza ❌) → archivado
```

**Filtro de seguridad:** Todas las queries que leen knowledge para inyectar en prompts incluyen `.eq('approval_status', 'approved')`. Ningún insight pendiente se filtra a generadores.

### 2.4 Métodos de Creación de Reglas

| Método | Frecuencia | Fuente |
|--------|-----------|--------|
| Swarm Research | Cada 2h | Web research cruzado (Opus) |
| Sales Learning Loop | Diario 8pm | Conversaciones convertidas/perdidas |
| Cross-Client Learning | Mensual | Patrones entre merchants |
| Steve Discoverer | Domingo 2am | Patrones emergentes en métricas |
| Auto-Rule Generator | On-demand | Errores sin regla existente |
| Content Hunter | Cada 20min | Blogs, YouTube, RSS externos |

---

## 3. PIPELINE DE INVESTIGACIÓN

### 3.1 Swarm Research (Cada 2 horas)
**Archivo:** `cloud-run-api/src/routes/cron/swarm-research.ts`

**4 fases:**

#### Fase 1: Director (Haiku → 10 preguntas)
Rotación temática por día:
- Lunes AM: Meta Ads / PM: Google Ads
- Martes AM: Klaviyo & Email / PM: Shopify & Checkout
- Miércoles AM: Retención / PM: Pricing
- Jueves AM: Creative & Copy / PM: LATAM Ecommerce Trends
- Viernes AM: Cross-Channel / PM: Automation
- Sábado: Competencia
- Domingo: Libre (Haiku decide según gaps)

**Regla:** 7 de 10 preguntas buscan en fuentes preferidas (`swarm_sources`), 3 son libres.

#### Fase 2: McKinseys (10x OpenAI o4-mini en paralelo)
10 búsquedas web simultáneas, una por pregunta. Extraen URLs y contenido.

#### Fase 3: Senior Partner (Opus sintetiza)
Cruza los 10 reportes para encontrar insights que ningún consultor individual podía ver. Output: array de insights con `categorias[]` (1-3), confidence (1-10), sources.

#### Fase 4: Insert multi-categoría
Por cada insight, por cada categoría → INSERT con `insight_group_id` compartido, `approval_status='pending'`.

### 3.2 Content Hunter (Cada 20 minutos)
**Archivo:** `cloud-run-api/src/routes/cron/steve-content-hunter.ts`

Escanea fuentes externas (blogs, YouTube, RSS) desde tabla `steve_sources`. Extrae contenido nuevo, lo analiza con Haiku y genera 2-3 reglas accionables por contenido.

### 3.3 Steve Discoverer (Domingo 2am)
**Archivo:** `cloud-run-api/src/routes/cron/steve-discoverer.ts`

Analiza 30 días de datos de performance (ROAS por día, ángulos creativos, patrones de email) y le pide a Haiku encontrar correlaciones que nadie enseñó explícitamente.

### 3.4 Sales Learning Loop (Diario 8pm)
**Archivo:** `cloud-run-api/src/routes/cron/sales-learning-loop.ts`

Analiza conversaciones de prospectos convertidos/perdidos con Sonnet:
- Técnicas que funcionaron (con ejemplo del mensaje exacto)
- Punto de inflexión de la conversación
- Personalidad del prospecto (directo/cauteloso/emocional/analítico)
- Qué replicar y qué evitar

Guarda como `categoria='sales_learning'`.

### 3.5 Cross-Client Learning (Mensual)
**Archivo:** `cloud-run-api/src/routes/cron/cross-client-learning.ts`

Agrega datos anónimos de todos los merchants (spend, CTR, ROAS, conversion rate), pide a Haiku encontrar patrones cross-client. Guarda como `categoria='analisis'` marcado `[CROSS-CLIENT]`.

---

## 4. SISTEMA WOLF (Inteligencia de Prospectos)

### 4.1 Wolf Night Mode (Diario 3am)
**Archivo:** `cloud-run-api/src/routes/cron/wolf-night-mode.ts`

Re-scrapea tiendas de prospectos con Apify durante la noche:
- Detecta productos nuevos, cambios de precio, imágenes nuevas
- Scrapea ads de competidores del rubro del prospecto
- Guarda hallazgos en `wolf_findings` JSONB

### 4.2 Wolf Morning Send (Diario 9am)
**Archivo:** `cloud-run-api/src/routes/cron/wolf-morning-send.ts`

Genera mensajes proactivos de WhatsApp basados en hallazgos nocturnos. Haiku genera mensaje natural (no vendedor) mencionando el hallazgo más interesante. Envía via Twilio.

---

## 5. GENERACIÓN DE CONTENIDO

### 5.1 Generate Meta Copy
**Archivo:** `cloud-run-api/src/routes/ai/generate-meta-copy.ts`

Genera copy para Meta Ads con:
- Reglas CRITERIO inyectadas
- Creative context (rendimiento de ángulos previos)
- Metodologías: Sabri Suby, Russell Brunson, AIDA, Storytelling
- Knowledge rules de categorías relevantes

### 5.2 Generate Google Copy
**Archivo:** `cloud-run-api/src/routes/utilities/generate-google-copy.ts`

Copy para Google Ads con knowledge de `google_ads` inyectado.

### 5.3 Generate Brief Visual
**Archivo:** `cloud-run-api/src/routes/utilities/generate-brief-visual.ts`

Brief visual para equipo creativo con reglas de `anuncios` y `meta_ads`.

### 5.4 Klaviyo Smart Format
**Archivo:** `cloud-run-api/src/routes/klaviyo/klaviyo-smart-format.ts`

Aplica reglas de knowledge a templates de email Klaviyo (subject lines, CTAs, timing, segmentación).

**Todas las queries de generación filtran por `approval_status='approved'`.**

---

## 6. TRACKING DE PERFORMANCE

### 6.1 Performance Tracker Meta (Diario 8am)
**Archivo:** `cloud-run-api/src/routes/cron/performance-tracker-meta.ts`

Mide campañas Meta 48-72hrs después de creación. Calcula score (CTR, ROAS, CPA) y asigna veredicto: bueno(65+), neutro(40-64), malo(<40). Guarda en `creative_history`.

### 6.2 Performance Evaluator (Diario 10am)
**Archivo:** `cloud-run-api/src/routes/cron/performance-evaluator.ts`

Analiza POR QUÉ creativos funcionaron o fallaron (últimos 7 días). Haiku identifica winning patterns, failing patterns y recomendaciones.

### 6.3 Fatigue Detector (Diario 11am)
**Archivo:** `cloud-run-api/src/routes/cron/fatigue-detector.ts`

Detecta fatiga creativa: CTR drop >20% del pico o frequency >3. Crea task para rotar creativo sugiriendo mejor ángulo de `creative_history`.

### 6.4 Predictive Alerts (Cada 6h)
**Archivo:** `cloud-run-api/src/routes/cron/predictive-alerts.ts`

Predice caídas de performance 1-2 días antes:
- CPM sube >15% → alerta targeting
- CTR baja >20% → alerta fatiga
- ROAS baja >25% → alerta caída
- Conversiones bajan >40% → alerta crítica

### 6.5 Anomaly Detector (Diario 10pm)
**Archivo:** `cloud-run-api/src/routes/cron/anomaly-detector.ts`

Compara métricas del día vs histórico del mismo día de la semana (8 semanas). Flaggea desviaciones >40%.

---

## 7. MANTENIMIENTO DE CONOCIMIENTO

### 7.1 Knowledge Quality Score (Domingo 5am)
**Archivo:** `cloud-run-api/src/routes/cron/knowledge-quality-score.ts`

Calcula score 0-100 por regla:

| Criterio | Puntos | Condición |
|----------|--------|-----------|
| Formato | 20 | Tiene CUANDO/HAZ/PORQUE |
| Especificidad | 20 | Tiene números (%/$), largo 100-600 chars |
| Uso | 20 | Min(20, veces_usada × 4) |
| Recencia | 20 | <30d=20, 30-90d=15, 90-180d=10, 180d+=5 |
| Ejemplo real | 20 | Tiene ejemplo_real |

- Score <40 → Haiku reescribe automáticamente
- Score <20 + sin uso 60d → desactivación automática

### 7.2 Knowledge Consolidator (Mensual)
**Archivo:** `cloud-run-api/src/routes/cron/knowledge-consolidator.ts`

Cuando una categoría tiene 15+ reglas, Haiku las consolida en 5-8 reglas maestras. Desactiva las originales y marca las nuevas como `[CONSOLIDADA]`.

### 7.3 Knowledge Dedup (Mensual)
**Archivo:** `cloud-run-api/src/routes/cron/knowledge-dedup.ts`

Haiku busca duplicados semánticos por categoría. Mantiene la de mayor orden, desactiva las redundantes.

### 7.4 Knowledge Decay (Mensual)
**Archivo:** `cloud-run-api/src/routes/cron/knowledge-decay.ts`

- 90+ días sin update + orden >50 → baja orden a 50
- 180+ días sin update → desactivación total

### 7.5 Rule Calibrator (Domingo 3am)
**Archivo:** `cloud-run-api/src/routes/cron/rule-calibrator.ts`

Detecta reglas CRITERIO descalibradas: reject rate >80% (muy estricta) o <1% con 50+ evaluaciones (inútil).

### 7.6 Steve Prompt Evolver (Domingo 3am)
**Archivo:** `cloud-run-api/src/routes/cron/steve-prompt-evolver.ts`

Evoluciona el system prompt de Steve basado en feedback positivo/negativo de los últimos 30 días. Haiku genera 3-5 instrucciones nuevas.

---

## 8. AGENTE AUTÓNOMO

### 8.1 Steve Agent Loop (Cada 2h)
**Archivo:** `cloud-run-api/src/routes/cron/steve-agent-loop.ts`

Loop de 3 fases:

1. **PERCIBIR**: Alertas recientes, stats de knowledge, feedback, métricas de clientes
2. **RAZONAR**: Haiku analiza estado y decide 2-3 acciones prioritarias
3. **ACTUAR**: Ejecuta acciones (buscar contenido, evaluar reglas, alertar cliente, mejorar knowledge)

**Acciones posibles:** `search_topic`, `evaluate_rules`, `alert_client`, `improve_knowledge`, `nothing`

---

## 9. QA Y VERIFICACIÓN

### 9.1 Detective Visual (Cada 2h, 8am-8pm)
**Archivo:** `cloud-run-api/src/routes/cron/detective-visual.ts`

Compara datos de Steve vs plataformas reales:
- Meta: spend, impressions, conversions, status
- Shopify: precio, stock, nombre
- Klaviyo: tamaño segmento, sync status

**Tolerancias:** spend 5%, ROAS 10%, precio 0% (debe coincidir exacto)

### 9.2 Auto-Learning Digest (Diario 9am)
**Archivo:** `cloud-run-api/src/routes/cron/auto-learning-digest.ts`

Envía WhatsApp a JM con resumen de insights pendientes, agrupados por categoría, con link seguro para aprobar.

---

## 10. FRONTEND

| Componente | Archivo | Función |
|-----------|---------|---------|
| **InsightApprovalPanel** | `src/components/dashboard/InsightApprovalPanel.tsx` | Aprobar/rechazar insights, multi-cat dialog, bulk actions, vista de grupos |
| **KnowledgeRulesExplorer** | `src/components/dashboard/KnowledgeRulesExplorer.tsx` | Explorar reglas aprobadas por categoría, búsqueda, filtro fecha |
| **SteveKnowledgePanel** | `src/components/dashboard/SteveKnowledgePanel.tsx` | CRUD admin de reglas |
| **SteveTrainingPanel** | `src/components/dashboard/SteveTrainingPanel.tsx` | Feedback de entrenamiento |
| **SteveTrainingChat** | `src/components/dashboard/SteveTrainingChat.tsx` | Chat para entrenar a Steve |

---

## 11. CRONS (44 jobs en Google Cloud Scheduler)

### Generación de Conocimiento
| Job | Schedule | Qué hace |
|-----|----------|----------|
| swarm-research-2h | `0 */2 * * *` | 10 preguntas → 10 reportes → Opus síntesis → knowledge |
| steve-content-hunter-20min | `*/20 * * * *` | Escanea fuentes externas → extrae reglas |
| steve-discoverer-sun-2am | `0 2 * * 0` | Descubre patrones emergentes en métricas |
| sales-learning-loop-8pm | `0 20 * * *` | Analiza conversaciones convertidas/perdidas |
| cross-client-learning-monthly | `0 3 1 * *` | Patrones cross-client |
| auto-learning-digest-9am | `0 9 * * *` | WhatsApp digest de pendientes a JM |

### Calidad y Mantenimiento
| Job | Schedule | Qué hace |
|-----|----------|----------|
| knowledge-quality-score-sun-5am | `0 5 * * 0` | Calcula quality_score, auto-mejora |
| knowledge-consolidator-monthly | `0 5 1 * *` | Merge 15+ reglas → 5-8 maestras |
| knowledge-dedup-monthly | `0 6 1 * *` | Elimina duplicados semánticos |
| knowledge-decay-monthly | `0 4 1 * *` | Demota (90d) y retira (180d) reglas |
| rule-calibrator-sun-3am | `0 3 * * 0` | Detecta reglas CRITERIO descalibradas |
| steve-prompt-evolver-sun-3am | `0 3 * * 0` | Evoluciona system prompt con feedback |

### Performance
| Job | Schedule | Qué hace |
|-----|----------|----------|
| performance-tracker-meta-8am | `0 8 * * *` | Mide campañas Meta 48-72hrs |
| performance-evaluator-10am | `0 10 * * *` | Analiza por qué creativos funcionaron/fallaron |
| fatigue-detector-11am | `0 11 * * *` | Detecta fatiga creativa |
| predictive-alerts-6h | `0 */6 * * *` | Predice caídas 1-2 días antes |
| anomaly-detector-10pm | `0 22 * * *` | Anomalías estadísticas diarias |

### Prospectos (Wolf)
| Job | Schedule | Qué hace |
|-----|----------|----------|
| wolf-night-mode-3am | `0 3 * * *` | Re-scrapea tiendas de prospectos |
| wolf-morning-send-9am | `0 9 * * *` | Mensajes proactivos con hallazgos |

### Agente Autónomo
| Job | Schedule | Qué hace |
|-----|----------|----------|
| steve-agent-loop-2h | `0 */2 * * *` | Percibir → Razonar → Actuar |

---

## 12. RESUMEN: SUPERPODERES DE STEVE

1. **Siempre aprendiendo** — Swarm, sales learning, discoverer, content hunter 24/7
2. **3 cerebros** — Investigador → Estratega → Conversador en 5-7 segundos
3. **Knowledge gates** — Todo insight pasa por aprobación humana antes de usarse
4. **Multi-categoría** — Un insight llega a todos los generadores relevantes
5. **Auto-mantenimiento** — Decay, dedup, consolidación, quality score automáticos
6. **Proactivo** — Wolf vigila prospectos de noche, predictive alerts avisa antes de caídas
7. **Cross-client** — Aprende de todos los merchants, aplica a todos
8. **Autónomo** — Agent loop percibe, razona y actúa cada 2 horas
