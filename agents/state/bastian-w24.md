# Bastián W24 — Brief & Onboarding
Squad: Producto | Última sesión: 2026-04-14

## Estado actual: 4 sesiones, 22+ fixes, brief funcional Q0→Q16

### Completado sesión 14/04/2026 — Normalizar renderers del Brief
**8 fixes** en 3 commits (01f96f39, 20ca2d7b, 8864c915). Solo frontend, cero riesgo backend.

- [x] FIX-7: safeText() — key:value legible en vez de JSON.stringify
- [x] FIX-8: normalizeResearchData() — normalizar keys executive_summary + mapa perceptual
- [x] FIX-2: Mapa Perceptual — fallback ubicacion_marcas / brands
- [x] FIX-1: Customer Journey — fallbacks por fase (trigger_de_entrada, factores_de_conversion)
- [x] FIX-3: Personalidad — arquetipo_primario, secundario, a_evitar
- [x] FIX-4: Tono de Voz — tono_inferido, voz_probable, registro, evaluacion
- [x] FIX-5: Propuesta de Valor — descripcion, frases_inferidas_por_naming
- [x] FIX-6: Executive Summary — parsear JSON string, oportunidades_top3 → oportunidades_detectadas

---

### Completado sesión 13/04/2026 (tarde) — Fix 6 Brief Bugs + Scraping Fallback
- [x] BUG-01: Fix pregunta duplicada en implicitAdvance (off-by-one)
- [x] BUG-02: Q16 timeout 180s + 1 retry + carga buyer_personas
- [x] BUG-04: Normalización brand_identity keys
- [x] BUG-06: Keywords PDF — filtro phases acepta etapa + regex
- [x] BUG-08: Propuesta de valor vacía en PDF
- [x] BUG-09: Mapa perceptual texto → SVG scatter plot
- [x] Scraping: Firecrawl fallback cuando Apify <500 chars

---

### Completado sesión 13/04/2026 (mañana) — Fix loop infinito + reparación RazasPet
- [x] Fix system prompt L243 y L272-277 (contradecían questionContext)
- [x] Safety net implicitAdvance (detecta AI off-script)
- [x] Reparación buyer_personas RazasPet (answered_count 12→16, Q12-Q15 reconstruidas)
- [x] Deploy steve-api-00516-k6l

---

### Completado sesión 12/04/2026 — Fix AI off-script + creación agente
- [x] Separar responsabilidades: AI solo evalúa, pregunta determinística
- [x] Eliminar implicitAdvance v1 (innecesario con append determinístico)
- [x] Override system prompt en questionContext
- [x] Truncar en [AVANZAR]/[RECHAZO] con substring
- [x] Creación agente Bastián W24

---

## Pendiente
- [ ] Verificar brief RazasPet en producción (4 fases Customer Journey con contenido)
- [ ] Verificar PDF sin JSON crudo
- [ ] Probar con otro cliente para confirmar fallbacks con keys distintas
- [ ] Test completo Q0→Q16 con brief limpio (cliente nuevo)
- [ ] Verificar formularios aparecen en Q2, Q3, Q4, Q9, Q10
- [ ] Verificar rechazo funciona (respuesta vaga en Q5)
- [ ] Verificar clarificación funciona ("qué es CPA?" en Q2)

## Blockers
- Ninguno actualmente
