/**
 * Steve Multi-Brain — 3-brain pipeline for prospect conversations.
 *
 * 1. Investigator (Haiku, ~1s): Loads pre-scraped data, competitor insights, sales learnings
 * 2. Strategist (Haiku, ~1.5s): Analyzes prospect state, produces tactical brief
 * 3. Conversationalist (Sonnet, ~3-5s): Generates the final WA message
 *
 * Total pipeline: ~5-7s (within 10s TwiML limit)
 */

import { getSupabaseAdmin } from './supabase.js';
import type { ProspectRecord } from './steve-wa-brain.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvestigatorResult {
  investigationContext: string;
  competitorInsights: string;
  salesLearnings: string;
}

export interface StrategistResult {
  brief: string;
  suggestedAction: string;
  tone: string;
}

// ---------------------------------------------------------------------------
// Investigator — Haiku, ~1s
// ---------------------------------------------------------------------------

/**
 * Loads pre-existing intelligence about a prospect:
 * - investigation_data from DB (previously scraped store/social data)
 * - competitor_ads matching the prospect's industry
 * - sales learnings from steve_knowledge (past wins/losses)
 */
export async function runInvestigator(
  prospect: ProspectRecord,
): Promise<InvestigatorResult> {
  const supabase = getSupabaseAdmin();
  const result: InvestigatorResult = {
    investigationContext: '',
    competitorInsights: '',
    salesLearnings: '',
  };

  try {
    // 1. Load investigation_data (pre-scraped store/social/competitor data)
    if (prospect.id) {
      const { data: fresh } = await supabase
        .from('wa_prospects')
        .select('investigation_data')
        .eq('id', prospect.id)
        .maybeSingle();

      const invData = fresh?.investigation_data;
      if (invData) {
        const parts: string[] = [];

        if (invData.store) {
          const store = invData.store;
          // Format products with names and prices (expert observations)
          if (store.top_products?.length) {
            const products = store.top_products.slice(0, 5).map((p: any) => {
              if (typeof p === 'string') return p;
              return `${p.name}${p.price ? ` (${p.price})` : ''}`;
            });
            parts.push(`Productos: ${products.join(', ')}`);
          }
          if (store.brand_style) parts.push(`Estilo: ${store.brand_style}`);
          if (store.price_range) parts.push(`Rango precios: ${store.price_range}`);
          if (store.category_summary) parts.push(`Tipo tienda: ${store.category_summary}`);
          if (store.product_images?.length) parts.push(`${store.product_images.length} productos publicados`);
        }

        if (invData.social) {
          const social = invData.social;
          if (social.followers) parts.push(`IG: ${social.followers.toLocaleString()} followers`);
          if (social.engagement_rate) parts.push(`Engagement: ${social.engagement_rate}`);
        }

        if (invData.competitor_ads?.length) {
          const topAds = invData.competitor_ads.slice(0, 3);
          parts.push(`Ads competencia: ${topAds.map((a: any) => a.headline || a.ad_text?.slice(0, 50)).join(' | ')}`);
        }

        if (parts.length > 0) {
          result.investigationContext = `TIENDA DEL PROSPECTO:\n${parts.join('\n')}`;
        }
      }
    }

    // 2. Load competitor ads matching industry
    const industry = (prospect.what_they_sell || '').toLowerCase();
    if (industry) {
      const keywords = industry.split(/[\s,;]+/).filter(w => w.length >= 3);
      if (keywords.length > 0) {
        const { data: compAds } = await supabase
          .from('competitor_ads')
          .select('ad_text, ad_headline, ad_type, impressions_lower')
          .ilike('ad_text', `%${keywords[0]}%`)
          .order('impressions_lower', { ascending: false })
          .limit(3);

        if (compAds?.length) {
          const adLines = compAds.map((ad: any) =>
            `- "${(ad.ad_headline || ad.ad_text || '').slice(0, 80)}" (${ad.ad_type || 'image'}, ~${ad.impressions_lower || '?'} impresiones)`
          ).join('\n');
          result.competitorInsights = `ADS DE COMPETENCIA EN SU INDUSTRIA:\n${adLines}`;
        }
      }
    }

    // 3. Load sales learnings from steve_knowledge
    const { data: learnings } = await supabase
      .from('steve_knowledge')
      .select('titulo, contenido')
      .eq('categoria', 'sales_learning')
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(5);

    if (learnings?.length) {
      // Filter learnings relevant to this prospect's industry
      const relevant = industry
        ? learnings.filter((l: any) =>
            (l.contenido || '').toLowerCase().includes(industry.split(' ')[0]) ||
            (l.titulo || '').toLowerCase().includes(industry.split(' ')[0])
          )
        : [];

      const toUse = relevant.length > 0 ? relevant.slice(0, 3) : learnings.slice(0, 2);
      if (toUse.length > 0) {
        result.salesLearnings = `APRENDIZAJES DE VENTAS PASADAS:\n${toUse.map((l: any) => `- ${l.titulo}: ${(l.contenido || '').slice(0, 200)}`).join('\n')}`;
      }
    }
  } catch (err) {
    console.error('[multi-brain/investigator] Error:', err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Strategist — Haiku, ~1.5s
// ---------------------------------------------------------------------------

/**
 * Analyzes prospect state and produces a tactical brief for the Conversationalist.
 * Brief is max 200 tokens: emotional state, funnel position, available levers, recommended approach.
 */
export async function runStrategist(
  prospect: ProspectRecord,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  investigatorResults: InvestigatorResult,
): Promise<StrategistResult> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { brief: '', suggestedAction: 'continue_discovery', tone: 'friendly' };
  }

  try {
    // Build context for strategist
    const recentHistory = history.slice(-6).map(m =>
      `${m.role === 'user' ? 'Prospecto' : 'Steve'}: ${m.content}`
    ).join('\n');

    const knownData: string[] = [];
    if (prospect.what_they_sell) knownData.push(`Vende: ${prospect.what_they_sell}`);
    if (prospect.monthly_revenue) knownData.push(`Facturación: ${prospect.monthly_revenue}`);
    if (prospect.current_marketing) knownData.push(`Marketing: ${prospect.current_marketing}`);
    if (prospect.pain_points?.length) knownData.push(`Dolores: ${prospect.pain_points.join(', ')}`);
    if (prospect.store_platform) knownData.push(`Plataforma: ${prospect.store_platform}`);
    knownData.push(`Score: ${prospect.lead_score || 0}, Stage: ${prospect.stage || 'discovery'}, Msgs: ${prospect.message_count || 0}`);

    const prompt = `Eres un estratega de ventas senior. Analiza esta conversación y produce un BRIEF TÁCTICO para el vendedor.

DATOS DEL PROSPECTO:
${knownData.join('\n')}

${investigatorResults.investigationContext || ''}
${investigatorResults.competitorInsights || ''}
${investigatorResults.salesLearnings || ''}

CONVERSACIÓN RECIENTE:
${recentHistory}

Responde SOLO con un JSON (sin markdown):
{
  "brief": "Brief táctico en 2-3 oraciones. Estado emocional del prospecto, posición en funnel, qué palanca usar, qué evitar.",
  "suggestedAction": "una de: validate_emotion | ask_discovery | show_data | pitch_soft | pitch_hard | send_case_study | suggest_meeting | close_trial | back_off",
  "tone": "una de: empathetic | confident | casual | urgent | provocative"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('[multi-brain/strategist] API error:', response.status);
      return { brief: '', suggestedAction: 'continue_discovery', tone: 'friendly' };
    }

    const data: any = await response.json();
    const text = (data.content?.[0]?.text || '').trim();
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    return {
      brief: parsed.brief || '',
      suggestedAction: parsed.suggestedAction || 'continue_discovery',
      tone: parsed.tone || 'friendly',
    };
  } catch (err) {
    console.error('[multi-brain/strategist] Error:', err);
    return { brief: '', suggestedAction: 'continue_discovery', tone: 'friendly' };
  }
}

// ---------------------------------------------------------------------------
// Conversationalist — Sonnet, ~3-5s
// ---------------------------------------------------------------------------

/**
 * Generates the final WA message using the full dynamic prompt + strategist brief.
 * Max 800 tokens for WA messages (supports [SPLIT] for long ones).
 */
export async function runConversationalist(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  strategistBrief: StrategistResult,
  dynamicPrompt: string,
  sanitizedMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return 'Hola! Soy Steve 🐕 Tu asistente de marketing AI. ¿En qué te puedo ayudar?';
  }

  try {
    // Prepend strategist brief to the dynamic prompt
    let systemPrompt = dynamicPrompt;
    if (strategistBrief.brief) {
      systemPrompt = `🧠 BRIEF DEL ESTRATEGA (SIGUE ESTA DIRECTRIZ):
${strategistBrief.brief}
Acción sugerida: ${strategistBrief.suggestedAction}
Tono: ${strategistBrief.tone}

${dynamicPrompt}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: systemPrompt,
        messages: sanitizedMessages,
      }),
    });

    if (!response.ok) {
      console.error('[multi-brain/conversationalist] API error:', response.status);
      return 'Hola! Soy Steve 🐕 Tu asistente de marketing AI. ¿En qué te puedo ayudar?';
    }

    const data: any = await response.json();
    const rawMsg = data.content?.[0]?.text || '';
    return rawMsg
      .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
      .trim() || 'Hola! Soy Steve 🐕 ¿Tienes una tienda online? Te puedo ayudar con tu marketing.';
  } catch (err) {
    console.error('[multi-brain/conversationalist] Error:', err);
    return 'Hola! Soy Steve 🐕 ¿Tienes una tienda online? Te puedo ayudar con tu marketing.';
  }
}
