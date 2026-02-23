import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const isInternalCall = token === supabaseServiceKey;

    let userId: string | null = null;
    if (!isInternalCall) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    const { client_id, website_url, competitor_urls } = await req.json();

    if (!client_id) {
      return new Response(JSON.stringify({ error: 'Missing client_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id, client_user_id, user_id, name, company')
      .eq('id', client_id)
      .single();

    if (!client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isInternalCall && userId && client.client_user_id !== userId && client.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    async function updateProgress(step: string, detail: string, pct: number) {
      await supabase.from('brand_research').upsert(
        { client_id, research_type: 'analysis_progress', research_data: { step, detail, pct, ts: new Date().toISOString() } },
        { onConflict: 'client_id,research_type' }
      );
    }

    async function scrapeUrl(url: string): Promise<string> {
      if (!firecrawlApiKey) return '';
      try {
        const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
        });
        const data = await resp.json();
        return data?.data?.markdown || data?.markdown || '';
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

    // Build final competitor list: max 3 (explicit + brief fallback)
    const explicitUrls = (competitor_urls || []).filter((u: string) => u.trim());
    const remainingSlots = 3 - Math.min(explicitUrls.length, 3);
    const fillFromBrief = briefCompetitorUrls
      .filter(u => !explicitUrls.some((e: string) => e.includes(u.replace(/https?:\/\//, '').split('/')[0])))
      .slice(0, remainingSlots);
    const allCompetitorUrls = [...new Set([...explicitUrls, ...fillFromBrief])].slice(0, 3);

    console.log('Competitor URLs to analyze:', allCompetitorUrls);

    // 3. Scrape each competitor (max 3, sequentially)
    const competitorContents: string[] = [];
    for (let i = 0; i < allCompetitorUrls.length; i++) {
      const url = allCompetitorUrls[i];
      try {
        let formattedUrl = url.trim();
        if (!formattedUrl.startsWith('http')) formattedUrl = `https://${formattedUrl}`;
        const domain = new URL(formattedUrl).hostname.replace('www.', '');
        const pct = 20 + Math.round((i / allCompetitorUrls.length) * 50);
        await updateProgress(`competidor_${i}`, `Analizando competidor: ${domain}...`, pct);

        const content = await scrapeUrl(formattedUrl);
        competitorContents.push(`## ${formattedUrl}\n${content.slice(0, 3000) || '(Sin contenido disponible)'}`);
      } catch (e) {
        console.error('Competitor scrape error:', url, e);
        competitorContents.push(`## ${url}\n(Sin contenido disponible)`);
      }
    }

    await updateProgress('ia', `Análisis de datos completado — iniciando análisis estratégico con IA (${competitorContents.length} competidores)...`, 75);

    // Save research data so strategy function can read it
    const researchPayload = {
      websiteContent: websiteContent.slice(0, 6000),
      competitorContents,
      clientProvidedUrls: allCompetitorUrls,
      brandContext: JSON.stringify(briefContext).slice(0, 3000),
      clientName: client.name,
      clientCompany: client.company || '',
      websiteUrl: website_url || '',
    };

    return new Response(JSON.stringify({ success: true, research: researchPayload }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('analyze-brand-research error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
