// El Chino — Fix Prompt Generator
// When a check fails, uses Claude Sonnet to generate a specific fix prompt
// for an agent to execute.

import { anthropicFetch } from '../lib/anthropic-fetch.js';

const FIX_MODEL = 'claude-sonnet-4-20250514';

export interface FixPromptInput {
  check_number: number;
  description: string;
  check_type: string;
  platform: string;
  severity: string;
  steve_value: string | null;
  real_value: string | null;
  error_message: string | null;
  screenshot_url: string | null;
  previous_fix_prompt?: string | null;
}

export interface FixPromptResult {
  fix_prompt: string;
  probable_cause: string;
  files_to_check: string[];
}

export async function generateFixPrompt(input: FixPromptInput): Promise<FixPromptResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      fix_prompt: `Check #${input.check_number} falló: ${input.error_message || input.description}. Investigar manualmente.`,
      probable_cause: 'ANTHROPIC_API_KEY not configured — no se pudo generar diagnóstico',
      files_to_check: [],
    };
  }

  const isRetry = !!input.previous_fix_prompt;
  const retryContext = isRetry
    ? `\n\n⚠️ SEGUNDO INTENTO. El fix anterior no funcionó:
Fix anterior: ${input.previous_fix_prompt?.substring(0, 500)}
Resultado: Sigue fallando. Intenta un approach DIFERENTE.`
    : '';

  const result = await anthropicFetch(
    {
      model: FIX_MODEL,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `Eres un senior engineer de Steve Ads. Un check de QA falló y necesitas generar un prompt para que un agente Claude Code lo arregle.

## Check que falló
- Número: ${input.check_number}
- Descripción: ${input.description}
- Tipo: ${input.check_type}
- Plataforma: ${input.platform}
- Severidad: ${input.severity}
- Lo que Steve dice: ${input.steve_value || 'N/A'}
- Lo que la API real dice: ${input.real_value || 'N/A'}
- Error: ${input.error_message || 'N/A'}
${input.screenshot_url ? `- Screenshot: ${input.screenshot_url}` : ''}${retryContext}

## Stack técnico de Steve Ads
- Frontend: React/TypeScript/Vite en Vercel (proyecto betabg, dominio steve.cl)
- Backend: Hono/Node.js en Cloud Run (cloud-run-api/)
- DB: Supabase (Postgres + RLS via can_access_shop())
- Edge Functions: fetch-shopify-products, sync-shopify-metrics, sync-meta-metrics, sync-klaviyo-metrics, klaviyo-push-emails, generate-meta-copy, steve-chat, learn-from-source
- Tokens encriptados en platform_connections, se desencriptan con decrypt_platform_token RPC
- AI: Claude API via anthropicFetch(), Gemini API para imágenes

## Tablas relevantes
- platform_connections (OAuth tokens encriptados)
- platform_metrics, campaign_metrics
- shopify_products, shopify_collections
- email_templates (content_blocks JSON)
- email_campaigns, email_events
- steve_knowledge, steve_messages
- chino_routine, chino_reports

Responde en JSON exacto:
{
  "fix_prompt": "El prompt completo que un agente Claude Code debe recibir para arreglar esto. Sé MUY específico: qué archivo abrir, qué buscar, qué cambiar, cómo verificar. El agente va a ejecutar esto literalmente.",
  "probable_cause": "La causa más probable del error en 1-2 oraciones",
  "files_to_check": ["lista", "de", "archivos", "relevantes"]
}

Responde SOLO el JSON, nada más.`,
        },
      ],
    },
    apiKey,
    { timeoutMs: 30_000 },
  );

  if (!result.ok) {
    console.error('[chino/fix-generator] Claude API error:', result.status, result.data);
    return {
      fix_prompt: `Check #${input.check_number} falló: ${input.error_message || input.description}. Investigar manualmente.`,
      probable_cause: `Claude API error ${result.status}`,
      files_to_check: [],
    };
  }

  const text = result.data?.content?.[0]?.text || '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      fix_prompt: parsed.fix_prompt || 'No se pudo generar prompt',
      probable_cause: parsed.probable_cause || 'Desconocida',
      files_to_check: Array.isArray(parsed.files_to_check) ? parsed.files_to_check : [],
    };
  } catch {
    return {
      fix_prompt: `Check #${input.check_number} falló: ${input.error_message || input.description}. Claude dijo: ${text.substring(0, 300)}`,
      probable_cause: 'No se pudo parsear respuesta de Claude',
      files_to_check: [],
    };
  }
}
