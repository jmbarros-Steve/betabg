# CampaignBuilder — Plan de refactor

## Contexto

`CampaignBuilder.tsx` tiene **1865 líneas** (~81KB). Está flaggeado como
"archivo grande" en `CLAUDE.md` junto a BrandBriefView, CampaignCreateWizard
y steve-chat.ts. Es un componente-monolito que mezcla:

- Listado de campañas (CRUD)
- Editor wizard de 4 pasos (setup → design → audience → review)
- Estado de A/B testing (6+ vars)
- Estado de product recommendations
- Estado de template gallery
- Estado de conditional blocks
- Envío (send now, schedule, test send)
- Preview desktop/mobile
- AI generation
- Optimistic locking contra colisión de envíos

## Por qué duele

1. **Onboarding brutal**: un dev nuevo tiene que scrollear 1800 líneas para
   entender qué hace qué.
2. **Merge conflicts garantizados**: 2 personas tocando A/B + product recs
   a la vez → conflict resolution infernal.
3. **Re-renders innecesarios**: un cambio en `abSubjectB` re-renderiza la
   lista entera de campañas porque todo vive en el mismo componente.
4. **Tests imposibles**: no podés testear "envío de test email" sin montar
   todo el editor, el gallery, y los paneles condicionales.
5. **Isidora W6 (code reviewer)** flaggea cada PR a este archivo como "too
   many changes to review properly".

## Estrategia (gradual, sin romper nada)

### Fase 1 ✅ (este commit)
- [x] Crear carpeta `campaign-builder/`
- [x] Extraer tipos a `types.ts`
- [x] Extraer constantes a `constants.ts`
- [x] Este README con el plan

### Fase 2 — Extraer hooks puros (próximo sprint)
- [ ] `hooks/useCampaigns.ts` — fetch + CRUD de la lista
- [ ] `hooks/useSubscriberCount.ts` — count con filtros
- [ ] `hooks/useOptimisticLock.ts` — lock por campaign_id
- [ ] `hooks/useDirtyTracking.ts` — detecta cambios sin guardar

### Fase 3 — Sacar paneles autocontenidos
- [ ] `AbTestConfigPanel.tsx` — toda la UI de A/B testing
- [ ] `ProductRecommendationsPanel.tsx` — recEnabled/recType/recCount
- [ ] `ScheduleCampaignDialog.tsx` — picker de fecha + timezone

### Fase 4 — Romper el wizard en steps
- [ ] `steps/SetupStep.tsx` — nombre, subject, from, preview text
- [ ] `steps/DesignStep.tsx` — editor Unlayer + templates + AI
- [ ] `steps/AudienceStep.tsx` — listas, filtros, counts
- [ ] `steps/ReviewStep.tsx` — preview + scheduling + A/B + send

### Fase 5 — State management
- [ ] `CampaignBuilderContext.tsx` — Context + useReducer con todo el state
- [ ] `CampaignBuilder.tsx` se reduce a ~150 líneas orquestando el context
      y renderizando los steps.

## Regla de oro para migrar

**NO** borrar nada de `CampaignBuilder.tsx` hasta que el reemplazo esté
testeado en producción con traffic real. Refactor en paralelo, con feature
flag si hace falta. Una regresión en envío de campañas = clientes enojados.

## Responsables

- **Valentina W1** (Steve Mail) — owner del refactor
- **Isidora W6** — code review lógica
- **Camila W4** — UX del wizard

## Archivos relacionados

- `../CampaignBuilder.tsx` — el archivo original (intocable hasta Fase 2)
- `../EmailMarketing.tsx` — monta el `<CampaignBuilder />` en una tab
- `../GrapesEmailEditor.tsx` — el editor visual Unlayer wrapper
- `../EmailTemplateGallery.tsx` — gallery de templates
- `../ConditionalBlockPanel.tsx` — panel de bloques condicionales
- `../ABTestResultsPanel.tsx` — resultados de A/B tests
- `../ProductBlockPanel.tsx` — bloque de productos
