import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function analyzeBrandResearch(c: Context) {
  try {
  const supabase = getSupabaseAdmin();
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const apifyToken = process.env.APIFY_TOKEN;

  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.replace('Bearer ', '').trim();
  // Check internal call via both Authorization header AND X-Internal-Key custom header
  // (the Supabase gateway may strip the JWT from the Authorization header on internal calls)
  const internalKey = c.req.header('X-Internal-Key')?.trim();
  const isInternalCall = token === supabaseServiceKey || internalKey === supabaseServiceKey;

  let userId: string | null = null;
  if (!isInternalCall) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    userId = user.id;
  }

  const { client_id, website_url, competitor_urls } = await c.req.json();

  if (!client_id) {
    return c.json({ error: 'Missing client_id' }, 400);
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, client_user_id, user_id, name, company')
    .eq('id', client_id)
    .single();

  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  if (!isInternalCall && userId && client.client_user_id !== userId && client.user_id !== userId) {
    return c.json({ error: 'Access denied' }, 403);
  }

  async function updateProgress(step: string, detail: string, pct: number) {
    await supabase.from('brand_research').upsert(
      { client_id, research_type: 'analysis_progress', research_data: { step, detail, pct, ts: new Date().toISOString() } },
      { onConflict: 'client_id,research_type' }
    );
  }

  async function scrapeUrl(url: string): Promise<string> {
    if (!apifyToken) return '';
    try {
      const resp = await fetch(
        `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url }],
            maxCrawlPages: 1,
            outputFormats: ['markdown'],
          }),
        }
      );
      const items: any = await resp.json();
      return items?.[0]?.text || items?.[0]?.markdown || '';
    } catch (e) {
      console.error('Scrape error for', url, e);
      return '';
    }
  }

  await updateProgress('inicio', 'Iniciando análisis de marca...', 5);

  // 1. Scrape client website
  let websiteContent = '';
  if (website_url) {
    await updateProgress('sitio_web', `Analizando tu sitio web (${website_url})...`, 10);
    websiteContent = await scrapeUrl(website_url.startsWith('http') ? website_url : `https://${website_url}`);
    console.log('Scraped website, length:', websiteContent.length);
  }

  // 2. Extract competitor URLs from brief
  const { data: persona } = await supabase
    .from('buyer_personas')
    .select('persona_data')
    .eq('client_id', client_id)
    .maybeSingle();
  const briefContext = persona?.persona_data as any || {};

  let briefCompetitorUrls: string[] = [];
  if (briefContext?.raw_responses && briefContext?.questions) {
    const rawResponses: string[] = briefContext.raw_responses || [];
    const questions: string[] = briefContext.questions || [];
    const competitorsIdx = questions.indexOf('competitors');
    if (competitorsIdx >= 0) {
      const competitorsResponse = String(rawResponses[competitorsIdx] ?? '');
      // 1) comp1_url: cannonhome.cl, comp2_url: https://intime.cl, etc.
      const compUrlRegex = /comp[123]_url\s*:\s*([^\s\n,]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = compUrlRegex.exec(competitorsResponse)) !== null) {
        const url = m[1].trim();
        if (url && url.length > 4 && !url.includes(client.name?.toLowerCase())) {
          briefCompetitorUrls.push(url.startsWith('http') ? url : `https://${url}`);
        }
      }
      // 2) "Web ... : url" or "🌐 url"
      if (briefCompetitorUrls.length === 0) {
        const urlMatches = competitorsResponse.match(/(?:Web[^:]*:\s*|🌐\s*)([^\s\n,]+\.[a-z]{2,})/gi) || [];
        for (const match of urlMatches) {
          const url = match.replace(/^(?:Web[^:]*:\s*|🌐\s*)/i, '').trim();
          if (url && !url.includes(client.name?.toLowerCase())) {
            briefCompetitorUrls.push(url.startsWith('http') ? url : `https://${url}`);
          }
        }
      }
      // 3) Full URLs and bare domains
      if (briefCompetitorUrls.length === 0) {
        const fullUrls = competitorsResponse.match(/(?:https?:\/\/)?(?:www\.)?[\w.-]+\.(?:com|cl|mx|ar|co|pe|es|io|store|shop)(?:\/\S*)?/gi) || [];
        const domainOnly = competitorsResponse.match(/\b[\w-]+\.(?:cl|com|com\.ar|mx|pe|co|es|io)\b/g) || [];
        const combined = [...fullUrls, ...domainOnly];
        for (const u of combined) {
          const url = u.startsWith('http') ? u : `https://${u}`;
          if (!briefCompetitorUrls.includes(url) && !u.includes(client.name?.toLowerCase())) {
            briefCompetitorUrls.push(url);
          }
        }
      }
      briefCompetitorUrls = [...new Set(briefCompetitorUrls)];
    }
  }

  // Build final competitor list: max 6 (3 user-provided + up to 3 AI-detected)
  const explicitUrls = (competitor_urls || []).filter((u: string) => u.trim());
  const remainingSlots = 6 - Math.min(explicitUrls.length, 6);
  const fillFromBrief = briefCompetitorUrls
    .filter(u => !explicitUrls.some((e: string) => e.includes(u.replace(/https?:\/\//, '').split('/')[0])))
    .slice(0, remainingSlots);
  let allCompetitorUrls = [...new Set([...explicitUrls, ...fillFromBrief])].slice(0, 6);

  // Track how many are user-provided (before AI detection fills the rest)
  const numUserProvided = allCompetitorUrls.length;

  console.log('Competitor URLs before AI detection:', allCompetitorUrls);

  // 2b. AI auto-detection of competitors when we have fewer than 6
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (allCompetitorUrls.length < 6 && anthropicApiKey && (websiteContent || briefContext)) {
    await updateProgress('auto_competidores', 'Detectando competidores automáticamente...', 18);
    try {
      const slotsNeeded = 6 - allCompetitorUrls.length;
      const existingDomains = allCompetitorUrls.map(u => {
        try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace('www.', ''); } catch { return u; }
      });
      const clientDomain = website_url ? (() => { try { return new URL(website_url.startsWith('http') ? website_url : `https://${website_url}`).hostname.replace('www.', ''); } catch { return ''; } })() : '';

      const aiPrompt = `Eres un experto en e-commerce y marketing digital en Chile/LATAM.
Basándote en la siguiente información de un negocio, identifica exactamente ${slotsNeeded} competidores directos que vendan productos similares en el mismo mercado.

MARCA: ${client.name || ''} ${client.company || ''}
WEB: ${website_url || 'no disponible'}
CONTENIDO DEL SITIO (resumen): ${(websiteContent || '').slice(0, 2000)}
CONTEXTO DEL BRIEF: ${JSON.stringify(briefContext).slice(0, 1500)}

COMPETIDORES YA IDENTIFICADOS (NO repetir): ${existingDomains.join(', ')}
DOMINIO DEL CLIENTE (NO incluir): ${clientDomain}

Responde SOLO con un JSON array de objetos con "url" (dominio completo con https://) y "reason" (1 línea por qué es competidor directo).
Ejemplo: [{"url": "https://competidor.cl", "reason": "Vende ropa de cama premium en Chile"}]
Solo dominios reales de tiendas que existan. NO inventes dominios.`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: aiPrompt }],
        }),
      });

      if (aiRes.ok) {
        const aiData: any = await aiRes.json();
        const aiText = aiData.content?.[0]?.text || '';
        const jsonMatch = aiText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const detected: { url: string; reason: string }[] = JSON.parse(jsonMatch[0]);
          for (const comp of detected) {
            if (allCompetitorUrls.length >= 6) break;
            const compUrl = comp.url.startsWith('http') ? comp.url : `https://${comp.url}`;
            const compDomain = new URL(compUrl).hostname.replace('www.', '');
            if (compDomain !== clientDomain && !existingDomains.includes(compDomain)) {
              allCompetitorUrls.push(compUrl);
              existingDomains.push(compDomain);
              console.log(`[AI auto-detect] Found competitor: ${compUrl} — ${comp.reason}`);
            }
          }
        }
      }
    } catch (aiErr) {
      console.error('AI competitor auto-detection error:', aiErr);
      // Non-fatal — continue with whatever competitors we have
    }
  }

  console.log('Final competitor URLs to analyze:', allCompetitorUrls);

  // Save AI-detected competitors to competitor_tracking so they appear in panels
  if (allCompetitorUrls.length > numUserProvided) {
    for (let i = numUserProvided; i < allCompetitorUrls.length; i++) {
      try {
        const compUrl = allCompetitorUrls[i];
        const fullUrl = compUrl.startsWith('http') ? compUrl : `https://${compUrl}`;
        const domain = new URL(fullUrl).hostname.replace('www.', '');
        const { error: upsErr } = await supabase.from('competitor_tracking').upsert({
          client_id,
          ig_handle: domain,
          display_name: domain,
          store_url: fullUrl,
          is_active: true,
        }, { onConflict: 'client_id,ig_handle' });
        if (upsErr) console.error(`[analyze-brand-research] Error saving AI competitor ${domain}:`, upsErr);
        else console.log(`[analyze-brand-research] Saved AI-detected competitor: ${domain}`);
      } catch (saveErr) {
        console.error('[analyze-brand-research] Error saving AI competitor:', saveErr);
      }
    }
  }

  // 3. Scrape all competitors in parallel (max 6)
  await updateProgress('competidores', `Analizando ${allCompetitorUrls.length} competidores en paralelo...`, 20);

  const scrapePromises = allCompetitorUrls.map((url) => {
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http')) formattedUrl = `https://${formattedUrl}`;
    return scrapeUrl(formattedUrl)
      .then(content => ({ formattedUrl, content, error: null as any }))
      .catch(e => ({ formattedUrl, content: '', error: e }));
  });

  const scrapeResults = await Promise.allSettled(scrapePromises);

  const competitorContents: string[] = [];
  for (let i = 0; i < scrapeResults.length; i++) {
    const result = scrapeResults[i];
    const url = allCompetitorUrls[i];
    if (result.status === 'fulfilled' && !result.value.error) {
      const { formattedUrl, content } = result.value;
      const domain = new URL(formattedUrl).hostname.replace('www.', '');
      console.log(`Scraped competitor ${domain}, length: ${content.length}`);
      competitorContents.push(`## ${formattedUrl}\n${content.slice(0, 3000) || '(Sin contenido disponible)'}`);
    } else {
      const errorMsg = result.status === 'rejected' ? result.reason : result.value.error;
      console.error('Competitor scrape error:', url, errorMsg);
      competitorContents.push(`## ${url}\n(Sin contenido disponible)`);
    }
  }

  await updateProgress('ia', 'Análisis de datos completado — generando estrategia de marketing...', 75);

  // Save research data so strategy function can read it
  const researchPayload = {
    websiteContent: websiteContent.slice(0, 6000),
    competitorContents,
    clientProvidedUrls: allCompetitorUrls,
    numUserProvided,
    brandContext: JSON.stringify(briefContext).slice(0, 3000),
    clientName: client.name,
    clientCompany: client.company || '',
    websiteUrl: website_url || '',
  };

  return c.json({ success: true, research: researchPayload });
  } catch (err: any) {
    console.error('[analyze-brand-research]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
