# MISIÓN: BLOQUE D — Inyectar Contexto Histórico en Steve AI
Eres Paula W19. Tu trabajo: D.4 del BLOQUE D.

cd ~/steve && git pull

## D.4 — Inyectar contexto en prompts de Steve
Cuando Steve genera campañas o emails, debe consultar el historial del merchant ANTES de crear.

1. En cloud-run-api/src/routes/ai/generate-meta-copy.ts:
   - Importar getCreativeContext de ../../lib/creative-context.ts (Rodrigo W0 lo crea)
   - ANTES de llamar a Claude, agregar: const creativeContext = await getCreativeContext(shop_id, 'meta', product_name)
   - Agregar al system prompt: creativeContext + "IMPORTANTE: Si un ángulo tiene score <40, NO lo sugieras"

2. En cloud-run-api/src/routes/ai/generate-mass-campaigns.ts:
   - Mismo patrón: importar getCreativeContext, agregar al prompt para emails/klaviyo

3. En cloud-run-api/src/routes/ai/steve-chat.ts (modo estrategia):
   - Si el merchant pide crear campaña/email, incluir contexto histórico

## NOTA: Espera a que Rodrigo W0 termine D.3 (creative-context.ts) antes de importarlo.
Si no existe aún, créalo tú con la spec de BLOQUE_D.md paso D.3.

## REGLAS
- NO cambiar la lógica existente, solo AGREGAR contexto
- Commitea al terminar
