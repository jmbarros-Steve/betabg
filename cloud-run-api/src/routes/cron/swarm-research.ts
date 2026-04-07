import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';

/**
 * POST /api/cron/swarm-research
 * Every 2 hours: Haiku generates 10 questions → OpenAI o4-mini searches web ×10 parallel →
 * Opus synthesizes cross-domain insights → saves to steve_knowledge as pending.
 */
export async function swarmResearch(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!ANTHROPIC_API_KEY || !OPENAI_API_KEY) {
    return c.json({ error: 'Missing ANTHROPIC_API_KEY or OPENAI_API_KEY' }, 500);
  }

  // Create swarm run record
  const { data: swarmRun, error: insertErr } = await supabase
    .from('swarm_runs')
    .insert({ status: 'running', started_at: new Date().toISOString() })
    .select('id')
    .single();

  if (insertErr || !swarmRun) {
    console.error('[swarm] Failed to create swarm_runs record:', insertErr);
    return c.json({ error: 'Failed to create swarm run', details: insertErr?.message }, 500);
  }

  const runId = swarmRun.id;

  try {
    // ── Step 1: Director (Haiku) — generate 10 research questions ──
    const { theme } = getCurrentTheme();
    const questions = await generateQuestions(supabase, ANTHROPIC_API_KEY);
    console.log(`[swarm] ${runId} — Theme: ${theme} — Haiku generated ${questions.length} questions`);

    await supabase.from('swarm_runs').update({ questions }).eq('id', runId);

    // ── Step 2: 10 McKinseys in parallel (OpenAI o4-mini + web search) ──
    const reports = await runParallelResearch(questions, OPENAI_API_KEY);
    console.log(`[swarm] ${runId} — Got ${reports.length} reports`);

    const totalSources = reports.reduce((acc, r) => acc + (r.sources?.length || 0), 0);
    await supabase.from('swarm_runs').update({ reports, total_sources: totalSources }).eq('id', runId);

    // ── Step 3: Senior Partner (Opus) — cross-domain synthesis ──
    const insights = await synthesizeInsights(questions, reports, ANTHROPIC_API_KEY);
    console.log(`[swarm] ${runId} — Opus generated ${insights.length} insights`);

    const synthesisText = JSON.stringify(insights, null, 2);
    await supabase.from('swarm_runs').update({
      synthesis: synthesisText,
      insights_generated: insights.length,
    }).eq('id', runId);

    // ── Step 4: Save insights to steve_knowledge as pending ──
    // Each insight can have multiple categories — insert one row per category
    // linked by a shared insight_group_id.
    let saved = 0;
    for (const insight of insights) {
      // Support both "categorias" (array) and legacy "categoria" (string)
      const categories: string[] = Array.isArray(insight.categorias) && insight.categorias.length > 0
        ? insight.categorias.slice(0, 3)
        : [insight.categoria || 'analisis'];

      const groupId = crypto.randomUUID();

      for (const cat of categories) {
        const { error: knErr } = await supabase.from('steve_knowledge').insert({
          categoria: cat,
          titulo: (insight.titulo || '').slice(0, 200),
          contenido: insight.contenido || '',
          activo: true,
          orden: 0,
          approval_status: 'pending',
          source_explanation: insight.explanation || '',
          confidence: Math.min(10, Math.max(1, insight.confidence || 5)),
          sources_urls: insight.sources || [],
          swarm_run_id: runId,
          industria: 'general',
          insight_group_id: categories.length > 1 ? groupId : null,
        });
        if (!knErr) saved++;
        else console.error('[swarm] Failed to save insight:', knErr);
      }
    }

    // ── Step 4b: Update swarm_sources tracking (last_used_at, hits) ──
    try {
      const activeSources = await safeQuery<{ id: string; url: string; hits: number | null }>(
        supabase
          .from('swarm_sources')
          .select('id, url, hits')
          .eq('active', true),
        'swarmResearch.fetchActiveSources',
      );

      if (activeSources.length > 0) {
        // Collect all source URLs from reports and insights
        const allReportUrls = reports.flatMap((r) => r.sources || []);
        const allInsightUrls = insights.flatMap((i: any) => i.sources || []);
        const allUrlsText = [...allReportUrls, ...allInsightUrls].join(' ');

        for (const source of activeSources) {
          try {
            const sourceDomain = new URL(source.url).hostname.replace('www.', '');
            if (allUrlsText.includes(sourceDomain)) {
              await supabase
                .from('swarm_sources')
                .update({
                  last_used_at: new Date().toISOString(),
                  hits: (source.hits || 0) + 1,
                })
                .eq('id', source.id);
            }
          } catch { /* skip invalid URLs */ }
        }
      }
    } catch (trackErr: any) {
      console.error('[swarm] Source tracking error (non-fatal):', trackErr.message);
    }

    // Mark swarm run as completed
    await supabase.from('swarm_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', runId);

    // ── Step 5: Log to qa_log ──
    await supabase.from('qa_log').insert({
      check_type: 'swarm_research',
      status: 'pass',
      details: {
        swarm_run_id: runId,
        questions_count: questions.length,
        insights_generated: saved,
        total_sources: totalSources,
      },
    });

    return c.json({
      success: true,
      swarm_run_id: runId,
      theme,
      questions: questions.length,
      reports: reports.length,
      insights_saved: saved,
      total_sources: totalSources,
    });
  } catch (err: any) {
    console.error('[swarm] Fatal error:', err);

    await supabase.from('swarm_runs').update({
      status: 'error',
      error_message: err.message || String(err),
      completed_at: new Date().toISOString(),
    }).eq('id', runId);

    await supabase.from('qa_log').insert({
      check_type: 'swarm_research',
      status: 'fail',
      details: { swarm_run_id: runId, error: err.message || String(err) },
    });

    return c.json({ error: 'Swarm research failed', swarm_run_id: runId, details: err.message }, 500);
  }
}

// ─────────────────────────────────────────────────────────────
// Thematic rotation schedule (Chile timezone UTC-4)
// Each 2h slot gets a specific theme for deep specialization
// ─────────────────────────────────────────────────────────────
const THEME_SCHEDULE: Record<number, Record<'AM' | 'PM', { theme: string; focus: string }>> = {
  1: { // Monday
    AM: { theme: 'Meta Ads', focus: 'Meta campaigns, ASC, Advantage+, bidding strategies, ad formats, ROAS optimization, audience targeting, frequency management, creative testing for Facebook & Instagram ads' },
    PM: { theme: 'Google Ads', focus: 'Google Ads for ecommerce, Shopping campaigns, Performance Max, Search ads, bidding strategies, keyword optimization, ROAS for small budgets, Smart Bidding' },
  },
  2: { // Tuesday
    AM: { theme: 'Klaviyo & Email Marketing', focus: 'Klaviyo flows, email automation, welcome series, abandoned cart, post-purchase, win-back, segmentation, deliverability, subject lines, email design, open rates, click rates' },
    PM: { theme: 'Shopify & Checkout', focus: 'Shopify store optimization, checkout conversion, Shop Pay, upsells, cross-sells, product pages, collections, discount strategies, apps, theme optimization' },
  },
  3: { // Wednesday
    AM: { theme: 'Customer Retention & Loyalty', focus: 'Customer retention tactics, loyalty programs, repeat purchase rate, LTV optimization, referral programs, subscription models, community building, VIP tiers for DTC brands' },
    PM: { theme: 'Pricing & Promotions', focus: 'Ecommerce pricing strategies, discount psychology, bundle pricing, flash sales, free shipping thresholds, dynamic pricing, seasonal promotions, margin optimization' },
  },
  4: { // Thursday
    AM: { theme: 'Creative & Copywriting', focus: 'Ad copy hooks, creative formats, UGC, Reels, short-form video, carousel ads, static vs video, creative fatigue, AI-generated creatives, brand voice, persuasion techniques' },
    PM: { theme: 'LATAM Ecommerce Trends', focus: 'Ecommerce trends in Latin America, Chile, Mexico, Colombia, Brazil, payment methods, logistics, consumer behavior, mobile commerce, social commerce in LATAM' },
  },
  5: { // Friday
    AM: { theme: 'Cross-Channel Strategy', focus: 'Omnichannel marketing, combining email + ads + social, attribution, customer journey mapping, retargeting across channels, unified messaging, channel synergies' },
    PM: { theme: 'Marketing Automation', focus: 'Marketing automation tools, workflow optimization, AI in marketing, chatbots, WhatsApp marketing, SMS campaigns, triggered campaigns, personalization at scale' },
  },
  6: { // Saturday
    AM: { theme: 'Competitor Analysis', focus: 'Competitor research, ad spy tools, benchmarking, market positioning, competitive pricing, ad library analysis, share of voice, emerging DTC brands to watch' },
    PM: { theme: 'Competitor Analysis', focus: 'Competitor research, ad spy tools, benchmarking, market positioning, competitive pricing, ad library analysis, share of voice, emerging DTC brands to watch' },
  },
  0: { // Sunday
    AM: { theme: 'Free Topic (Haiku decides)', focus: 'Any topic Haiku considers most valuable based on current knowledge gaps and merchant needs. Could be analytics, CRO, SEO, influencer marketing, or any emerging opportunity.' },
    PM: { theme: 'Free Topic (Haiku decides)', focus: 'Any topic Haiku considers most valuable based on current knowledge gaps and merchant needs. Could be analytics, CRO, SEO, influencer marketing, or any emerging opportunity.' },
  },
};

function getCurrentTheme(): { theme: string; focus: string } {
  // Chile is UTC-4 (CLT) / UTC-3 (CLST)
  const now = new Date();
  const chileOffset = -4; // UTC-4 standard; adjust to -3 during DST if needed
  const chileHour = (now.getUTCHours() + chileOffset + 24) % 24;
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const period: 'AM' | 'PM' = chileHour < 14 ? 'AM' : 'PM'; // before 2pm = AM slot

  const daySchedule = THEME_SCHEDULE[dayOfWeek];
  return daySchedule[period];
}

// ─────────────────────────────────────────────────────────────
// Step 1: Haiku Director — generate 10 research questions
// Uses thematic rotation: each time slot has a specific topic
// ─────────────────────────────────────────────────────────────
// Maps theme names to category slugs for matching preferred sources
function mapThemeToCategories(theme: string): string[] {
  const t = theme.toLowerCase();
  if (t.includes('meta')) return ['meta_ads', 'anuncios'];
  if (t.includes('google')) return ['google_ads', 'anuncios'];
  if (t.includes('klaviyo') || t.includes('email')) return ['klaviyo'];
  if (t.includes('shopify') || t.includes('checkout')) return ['shopify'];
  if (t.includes('retention') || t.includes('loyalty')) return ['shopify', 'klaviyo'];
  if (t.includes('pricing') || t.includes('promotion')) return ['shopify', 'sales_learning'];
  if (t.includes('creative') || t.includes('copy')) return ['anuncios', 'meta_ads'];
  if (t.includes('latam')) return ['analisis', 'cross_channel'];
  if (t.includes('cross-channel') || t.includes('cross channel')) return ['cross_channel'];
  if (t.includes('automation')) return ['klaviyo', 'cross_channel'];
  if (t.includes('competitor')) return ['analisis', 'meta_ads'];
  // Free topic / fallback: all categories
  return ['meta_ads', 'google_ads', 'klaviyo', 'shopify', 'anuncios', 'cross_channel', 'analisis', 'sales_learning'];
}

async function generateQuestions(supabase: any, apiKey: string): Promise<string[]> {
  const { theme, focus } = getCurrentTheme();

  // Get existing knowledge for this theme's categories to avoid repeats
  const existingKnowledge = await safeQuery<{ titulo: string }>(
    supabase
      .from('steve_knowledge')
      .select('titulo')
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(50),
    'swarmResearch.fetchExistingKnowledge',
  );

  const recentTitles = existingKnowledge.map((k: any) => k.titulo).slice(0, 20);

  // Load preferred sources for this theme
  const allSources = await safeQuery<{ name: string; url: string; category: string }>(
    supabase
      .from('swarm_sources')
      .select('name, url, category')
      .eq('active', true),
    'swarmResearch.fetchAllSources',
  );

  const sources = allSources;
  const themeCategories = mapThemeToCategories(theme);
  const matchingSources = sources.filter((s: any) => themeCategories.includes(s.category));
  const otherSources = sources.filter((s: any) => !themeCategories.includes(s.category));

  const hasPreferredSources = matchingSources.length > 0 || otherSources.length > 0;

  // Build sources section for the prompt
  let sourcesPrompt = '';
  if (hasPreferredSources) {
    sourcesPrompt = `
PREFERRED SOURCES for this theme:
${matchingSources.length > 0 ? matchingSources.map((s: any) => `- ${s.name}: ${s.url}`).join('\n') : '(none matching this theme)'}

OTHER AVAILABLE SOURCES:
${otherSources.length > 0 ? otherSources.map((s: any) => `- ${s.name} (${s.category}): ${s.url}`).join('\n') : '(none)'}

SOURCE RULES:
- 7 of 10 questions must search for information IN or ABOUT the preferred sources above
  Example: "What did ${matchingSources[0]?.name || 'Source'} say about X in their latest content?"
  Example: "According to ${matchingSources[0]?.url || 'source'}, what are the best practices for X?"
- 3 of 10 questions are FREE: search the open web for things these sources don't cover
- If there are no preferred sources for this theme, make all 10 free`;
  }

  const prompt = `You are the research director at a top marketing consultancy for LATAM ecommerce.

TODAY'S RESEARCH THEME: ${theme}
FOCUS AREAS: ${focus}

EXISTING KNOWLEDGE (avoid repeating these topics):
${recentTitles.map((t: string) => `- ${t}`).join('\n')}
${sourcesPrompt}

Generate exactly 10 research questions in English about "${theme}".

RULES:
- Each question must be SPECIFIC and SEARCHABLE (not vague)
- Focus on 2026 data, trends, and actionable tactics
- Target: small-medium ecommerce stores in LATAM (budget $500-5000/month)
- Include at least 2 questions about benchmarks/numbers (e.g. "what is the average X in 2026?")
- Include at least 2 questions about NEW tactics/features released recently
- Do NOT repeat topics already in existing knowledge
- Questions should be diverse within the theme (don't ask the same thing 10 ways)

Respond ONLY with a JSON array of 10 strings. No explanation.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Haiku API error ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  const text = (data.content?.[0]?.text || '').trim();

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 10);
    }
  } catch {
    // Try to extract JSON array from text
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed.slice(0, 10);
    }
  }

  throw new Error('Haiku failed to generate valid questions array');
}

// ─────────────────────────────────────────────────────────────
// Step 2: 10 parallel OpenAI web searches (o4-mini + web_search_preview)
// ─────────────────────────────────────────────────────────────
interface ResearchReport {
  question: string;
  text: string;
  sources: string[];
}

async function runParallelResearch(questions: string[], apiKey: string): Promise<ResearchReport[]> {
  const researchPromises = questions.map(async (question): Promise<ResearchReport> => {
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'o4-mini',
          tools: [{ type: 'web_search_preview' }],
          input: question,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[swarm] OpenAI error for "${question.slice(0, 50)}...": ${res.status} ${errText}`);
        return { question, text: `Error: ${res.status}`, sources: [] };
      }

      const data: any = await res.json();

      // Extract text from output items
      let text = '';
      const sources: string[] = [];

      if (Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item.type === 'message' && Array.isArray(item.content)) {
            for (const block of item.content) {
              if (block.type === 'output_text') {
                text += block.text + '\n';
                // Extract inline URL citations
                if (Array.isArray(block.annotations)) {
                  for (const ann of block.annotations) {
                    if (ann.type === 'url_citation' && ann.url) {
                      sources.push(ann.url);
                    }
                  }
                }
              }
            }
          }
        }
      }

      return { question, text: text.trim() || 'No content returned', sources: [...new Set(sources)] };
    } catch (err: any) {
      console.error(`[swarm] Research error for "${question.slice(0, 50)}...":`, err.message);
      return { question, text: `Error: ${err.message}`, sources: [] };
    }
  });

  return Promise.all(researchPromises);
}

// ─────────────────────────────────────────────────────────────
// Step 3: Opus Senior Partner — cross-domain synthesis
// ─────────────────────────────────────────────────────────────
interface Insight {
  titulo: string;
  contenido: string;
  categoria?: string;
  categorias?: string[];
  explanation: string;
  confidence: number;
  sources: string[];
}

async function synthesizeInsights(
  questions: string[],
  reports: ResearchReport[],
  apiKey: string,
): Promise<Insight[]> {
  const reportsText = reports
    .map((r, i) => `=== REPORTE ${i + 1}: ${questions[i]} ===\n${r.text}`)
    .join('\n\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4000,
      system: `Eres el socio senior de una consultora de marketing digital para ecommerce LATAM.
Recibes 10 reportes de investigación de 10 consultores junior.
Tu trabajo: CRUZAR hallazgos entre disciplinas para encontrar insights que ningún consultor individual podía ver.

Responde SOLO JSON array:
[{
  "titulo": "máx 80 chars, accionable",
  "contenido": "CUANDO: [situación]. HAZ: 1. [acción]. 2. [acción]. PORQUE: [razón con dato].",
  "categorias": ["array de 1-3 categorías donde aplica este insight"],
  "explanation": "Por qué este insight es valioso. Qué reportes cruzaste para llegar a él.",
  "confidence": 1-10,
  "sources": ["url1", "url2"]
}]

CATEGORÍAS VÁLIDAS: meta_ads, google_ads, anuncios, sales_learning, klaviyo, shopify, analisis, cross_channel

REGLAS:
- Solo insights CRUZADOS (que combinan hallazgos de 2+ reportes)
- Máximo 8 insights por síntesis
- Cada insight debe ser ACCIONABLE para un merchant de ecommerce LATAM
- "categorias" es un ARRAY de 1-3 categorías donde el insight aplica. Ejemplo: un insight sobre cuotas sin interés que suben conversión aplica a ["shopify", "meta_ads", "klaviyo"].
- confidence 8+ = dato duro con fuente. confidence 5-7 = tendencia clara. <5 = hipótesis.
- Responde SOLO el JSON array, sin markdown ni texto adicional.`,
      messages: [{ role: 'user', content: reportsText }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Opus API error ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  const text = (data.content?.[0]?.text || '').trim();

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.slice(0, 8);
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed.slice(0, 8);
    }
  }

  throw new Error('Opus failed to generate valid insights array');
}
