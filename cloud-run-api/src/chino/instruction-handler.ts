// El Chino — Instruction Handler
// When JM sends a WhatsApp instruction like "de ahora en adelante revisa X",
// Claude converts it to a new check in chino_routine.

import { getSupabaseAdmin } from '../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../lib/safe-supabase.js';
import { anthropicFetch } from '../lib/anthropic-fetch.js';

const INSTRUCTION_MODEL = 'claude-sonnet-4-20250514';

export async function handleChinoInstruction(message: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return 'Error: ANTHROPIC_API_KEY no configurado.';
  }

  const supabase = getSupabaseAdmin();

  const result = await anthropicFetch(
    {
      model: INSTRUCTION_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `José Manuel le está dando una instrucción al Chino (sistema de QA autónomo de Steve Ads).

Mensaje: "${message}"

Convierte esto en un check para la tabla chino_routine. Responde en JSON:
{
  "description": "descripción del check en lenguaje claro",
  "check_type": "api_compare|api_exists|visual|data_quality|functional|security|performance|token_health",
  "platform": "shopify|meta|klaviyo|stevemail|steve_chat|brief|scraping|infra|security|all",
  "severity": "critical|high|medium|low",
  "check_config": {},
  "confirmation_message": "mensaje de confirmación para José Manuel en español chileno informal"
}

Contexto de plataformas:
- shopify: productos, órdenes, descuentos, colecciones, webhooks
- meta: campañas, audiencias, pixel, presupuesto, social inbox
- klaviyo: flows de email, métricas de email, sincronización contactos
- stevemail: sistema de email marketing propio, templates, campañas, formularios
- steve_chat: chat AI de Steve, respuestas, contexto, prompt quality
- brief: generación de copies, briefs creativos, análisis de marca
- scraping: web scraping, competencia, contenido externo
- infra: endpoints de Steve, tiempos de respuesta, health checks, Cloud Run
- security: tokens, permisos, RLS, datos sensibles, accesos
- all: aplica a todas las plataformas

Responde SOLO el JSON.`,
        },
      ],
    },
    apiKey,
    { timeoutMs: 15_000 },
  );

  if (!result.ok) {
    return 'Error al procesar instrucción. Intenta de nuevo.';
  }

  const text = result.data?.content?.[0]?.text || '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let newCheck: any;
  try {
    newCheck = JSON.parse(cleaned);
  } catch {
    return 'No entendí la instrucción. ¿Puedes ser más específico?';
  }

  // Get next check_number with retry logic to handle concurrent inserts
  let nextNumber = 0;
  let insertError: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const maxCheck = await safeQuerySingleOrDefault<{ check_number: number }>(
      supabase
        .from('chino_routine')
        .select('check_number')
        .order('check_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
      null,
      'chinoInstruction.getMaxCheckNumber',
    );

    nextNumber = (maxCheck?.check_number || 50) + 1;

    const { error } = await supabase.from('chino_routine').insert({
      check_number: nextNumber,
      description: newCheck.description || message,
      check_type: newCheck.check_type || 'data_quality',
      platform: newCheck.platform || 'all',
      severity: newCheck.severity || 'medium',
      check_config: newCheck.check_config || {},
      is_active: true,
      consecutive_fails: 0,
    });

    if (!error) {
      insertError = null;
      break; // success
    }

    console.warn(`[chino/instruction] Insert attempt ${attempt + 1} failed (check_number=${nextNumber}): ${error.message}`);
    insertError = error;

    if (attempt === 2) break; // give up after 3 tries
  }

  if (insertError) {
    console.error('[chino/instruction] Insert failed after 3 attempts:', insertError.message);
    return `Error al crear check: ${insertError.message}`;
  }

  console.log(`[chino/instruction] Created check #${nextNumber}: ${newCheck.description}`);

  return `Anotado jefe. Check #${nextNumber}: ${newCheck.description}\n\n${newCheck.confirmation_message || 'Lo voy a revisar en la próxima ronda.'}`;
}

// Detect if a WA message from JM is a Chino instruction
export function isChinoInstruction(message: string): boolean {
  const triggers = [
    'de ahora en adelante',
    'agrega check',
    'revisa también',
    'chequea también',
    'monitorea',
    'vigila',
    'agrega al chino',
    'el chino',
    'quiero que revises',
    'empieza a revisar',
    'verifica que',
    'asegúrate que',
    'asegurate que',
  ];
  const lower = message.toLowerCase();
  return triggers.some((t) => lower.includes(t));
}
