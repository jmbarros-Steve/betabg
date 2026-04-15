# Bastián W24 — Journal

## 2026-04-14 — Renderers: la IA nunca devuelve los mismos keys
**Descubrimiento crítico:** Claude Sonnet devuelve keys distintos cada vez que genera brand_research. No puedes confiar en keys exactos — siempre necesitas normalización + fallbacks.
- `oportunidades_top3` vs `oportunidades_detectadas`
- `tono_y_voz` vs `tono_voz` vs `tono_inferido`
- `personalidad_de_marca` vs `personalidad_marca` vs `arquetipo_primario`
- `propuesta_valor_actual` vs `propuesta_de_valor_actual` vs `propuesta_valor`
**Lección:** Crear `normalizeResearchData()` que mapee variantes ANTES de pasar al renderer. Nunca asumir que la IA devuelve el key exacto.

## 2026-04-13 — El system prompt siempre gana
**Descubrimiento crítico:** Cuando el system prompt (L243, L277) dice "HACER la siguiente pregunta" y el questionContext dice "SOLO evalúa", Opus prioriza el system prompt. Esto causa loop infinito porque:
1. AI escribe siguiente pregunta sin [AVANZAR]
2. Backend no detecta avance
3. answered_count se queda pegado
4. Formularios no aparecen
5. Brief en loop

**Solución:** Override explícito en questionContext + truncación agresiva + safety net implicitAdvance.
**Lección:** NUNCA confiar en que el AI siga el questionContext si el system prompt lo contradice. El system prompt es rey.

## 2026-04-13 — Apify cheerio no renderiza JS
**Descubrimiento:** SuperZoo.cl devolvía 128 chars con Apify cheerio porque el sitio es JS-heavy. Firecrawl (con waitFor 5s) devolvió 31,094 chars.
**Regla:** Si scraping < 500 chars → Firecrawl fallback obligatorio. Truncar a 15K chars para no explotar contexto LLM.

## 2026-04-13 — Off-by-one en preguntas
**Bug recurrente:** El display number de la pregunta era `currentQuestionIndex + 2` en vez de `+ 1`. Esto causaba que la detección de duplicados no encontrara el signature correcto.
**Regla:** Display number = `currentQuestionIndex + 1`. Siempre.
