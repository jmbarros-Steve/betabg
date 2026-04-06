# Felipe W2 — Journal

## 2026-04-06: BM Partner Token Migration

### Decisiones
- **getTokenForConnection** es el patrón único para resolver tokens Meta en todo el backend
- Para bm_partner: retorna SUAT directo (env var META_SYSTEM_TOKEN)
- Para oauth/flbi: decrypt via RPC + refresh proactivo si expira en <7 días
- Tokens no-Meta (Klaviyo API keys, Google refresh tokens, Shopify) se quedan con decrypt inline — no aplica getTokenForConnection

### Descubrimientos
- `analytics/meta-adset-action.ts` es un archivo DUPLICADO de `meta/meta-adset-action.ts` — ambos existían y ambos necesitaban migración. No estaba en la lista original del plan.
- `check-meta-scopes.ts` ya tenía handling de bm_partner (retorna all scopes) pero el path OAuth aún usaba decrypt inline
- La carpeta `coverage/` (770k líneas de lcov) se estaba incluyendo en git — agregado a .gitignore

### Rutas migradas (24 total)
**Críticas (11):** sync-meta-metrics, manage-meta-campaign, fetch-meta-business-hierarchy, check-meta-scopes, fetch-meta-ad-accounts, meta-social-inbox, execute-meta-rules, publish-facebook, fetch-facebook-insights, publish-instagram, fetch-instagram-insights

**Secundarias (13):** manage-meta-audiences, manage-meta-pixel, manage-meta-rules, meta-catalogs, meta-targeting-search, detect-audience-overlap, meta-adset-action, sync-klaviyo-to-meta-audience, sync-campaign-metrics, fetch-campaign-adsets, sync-competitor-ads, analytics/meta-adset-action, check-meta-scopes (OAuth path)
