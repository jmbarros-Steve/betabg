import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function steveContentHunter(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  const now = new Date();
  let totalExtracted = 0;
  const results: Array<{ source: string; newContent: number; rulesExtracted: number }> = [];

  // Helper: log a per-content fail to qa_log so we can aggregate by error_type
  // Each fail point inserts ONE row — supports `SELECT error_type, count(*) ... GROUP BY error_type`
  const logSourceFail = async (sourceName: string, sourceType: string, reason: string, detail: string) => {
    try {
      await supabase.from('qa_log').insert({
        check_type: 'content_hunt_source_fail',
        status: 'warn',
        error_type: reason,
        error_detail: `[${sourceType}] ${sourceName}: ${detail}`.slice(0, 500),
        detected_by: 'steve-content-hunter',
      });
    } catch (e) {
      console.error('[content-hunter] logSourceFail failed:', e);
    }
  };

  try {
    // Get enabled sources that need checking
    const { data: sources } = await supabase
      .from('steve_sources')
      .select('*')
      .eq('enabled', true)
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(5); // Process max 5 sources per run

    if (!sources || sources.length === 0) {
      return c.json({ success: true, message: 'No sources to check', totalExtracted: 0 });
    }

    for (const source of sources) {
      // Check if enough time has passed since last check
      if (source.last_checked_at) {
        const minutesSinceCheck = (now.getTime() - new Date(source.last_checked_at).getTime()) / 60000;
        if (minutesSinceCheck < (source.check_interval_min || 60)) continue;
      }

      try {
        let newContentUrls: Array<{ url: string; title: string }> = [];

        switch (source.source_type) {
          case 'youtube_channel': {
            // YouTube channels have RSS feeds at: https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
            // Or we can scrape the channel page for recent videos
            const channelUrl = source.url;
            let feedUrl = '';

            // If it's a channel URL, convert to RSS
            const channelIdMatch = channelUrl.match(/channel\/([a-zA-Z0-9_-]+)/);
            if (channelIdMatch) {
              feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
            } else {
              // Try to fetch the channel page and find channel ID
              const pageRes = await fetch(channelUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
              if (pageRes.ok) {
                const html = await pageRes.text();
                const idMatch = html.match(/channel_id=([a-zA-Z0-9_-]+)/);
                if (idMatch) feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${idMatch[1]}`;
                // Also try externalId
                const extMatch = html.match(/"externalId":"([a-zA-Z0-9_-]+)"/);
                if (!feedUrl && extMatch) feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${extMatch[1]}`;
              }
            }

            if (feedUrl) {
              const feedRes = await fetch(feedUrl);
              if (feedRes.ok) {
                const xml = await feedRes.text();
                // Parse video entries from Atom XML
                const entries = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)];
                for (const entry of entries.slice(0, 3)) { // Max 3 latest videos
                  const videoIdMatch = entry[0].match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
                  const titleMatch = entry[0].match(/<title>([^<]+)<\/title>/);
                  if (videoIdMatch) {
                    const videoUrl = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;
                    // Skip if we already processed this video
                    if (source.last_content_id === videoIdMatch[1]) break;
                    newContentUrls.push({ url: videoUrl, title: titleMatch?.[1] || '' });
                  }
                }
              }
            }
            break;
          }

          case 'rss':
          case 'blog': {
            const feedRes = await fetch(source.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (feedRes.ok) {
              const xml = await feedRes.text();
              // Parse RSS items
              const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)];
              for (const item of items.slice(0, 3)) {
                const linkMatch = item[0].match(/<link>([^<]+)<\/link>/);
                const titleMatch = item[0].match(/<title>(?:<!\[CDATA\[)?([^\]<]+)/);
                if (linkMatch) {
                  if (source.last_content_id === linkMatch[1]) break;
                  newContentUrls.push({ url: linkMatch[1], title: titleMatch?.[1] || '' });
                }
              }
            }
            break;
          }

          case 'website': {
            // For plain websites, just fetch and extract content
            newContentUrls.push({ url: source.url, title: source.name });
            break;
          }
        }

        if (newContentUrls.length === 0) {
          // Normal case: feed already processed up to last_content_id. Don't spam qa_log.
          await supabase.from('steve_sources').update({ last_checked_at: now.toISOString() }).eq('id', source.id);
          continue;
        }

        let rulesExtracted = 0;

        for (const content of newContentUrls) {
          try {
            // Fetch content
            let text = '';

            if (content.url.includes('youtube.com') || content.url.includes('youtu.be')) {
              // Extract YouTube transcript
              const videoIdMatch = content.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
              if (videoIdMatch) {
                const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoIdMatch[1]}`, {
                  headers: { 'User-Agent': 'Mozilla/5.0' },
                });
                if (ytRes.ok) {
                  const html = await ytRes.text();
                  const captionMatch = html.match(/"captionTracks"\s*:\s*(\[.*?\])/);
                  if (captionMatch) {
                    try {
                      const tracks = JSON.parse(captionMatch[1]);
                      const preferred = tracks.find((t: any) => t.languageCode === 'es')
                        || tracks.find((t: any) => t.languageCode === 'en')
                        || tracks[0];
                      if (preferred?.baseUrl) {
                        const captionRes = await fetch(preferred.baseUrl);
                        if (captionRes.ok) {
                          const captionXml = await captionRes.text();
                          text = [...captionXml.matchAll(/<text[^>]*>(.*?)<\/text>/gs)]
                            .map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, ' ').trim())
                            .filter(Boolean).join(' ');
                        }
                      }
                    } catch {}
                  }
                }
              }
            } else {
              // Fetch URL content
              const APIFY_TOKEN = process.env.APIFY_TOKEN;
              if (APIFY_TOKEN) {
                const apifyRes = await fetch(
                  `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ startUrls: [{ url: content.url }], maxCrawlPages: 1, outputFormats: ['markdown'] }),
                  }
                );
                if (apifyRes.ok) {
                  const items: any = await apifyRes.json();
                  text = items?.[0]?.text || items?.[0]?.markdown || '';
                }
              }

              if (!text) {
                const res = await fetch(content.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (res.ok) {
                  const html = await res.text();
                  text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30000);
                }
              }
            }

            if (!text || text.length < 200) {
              await logSourceFail(source.name, source.source_type, 'text_too_short', `length=${text?.length || 0} url=${content.url}`);
              continue;
            }

            // Extract rules with Haiku
            const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 3000,
                messages: [{
                  role: 'user',
                  content: `Extrae reglas accionables de marketing de este contenido.

FORMATO OBLIGATORIO por regla:
{"titulo": "máx 60 chars", "contenido": "CUANDO: [situación]. HAZ: 1. [acción]. 2. [acción]. PORQUE: [razón con dato].", "categoria": "meta_ads|google|seo|keywords|klaviyo|shopify|brief|anuncios|buyer_persona|analisis"}

REGLAS:
- Máximo 600 chars por regla
- Solo reglas ACCIONABLES (un marketer debe poder ejecutarla)
- No incluir opiniones genéricas ni consejos vagos
- Si no hay reglas accionables, responde []

Contenido (de: ${content.title || content.url}):
${text.slice(0, 15000)}

Responde SOLO JSON array. Sin markdown.`,
                }],
              }),
            });

            if (!aiRes.ok) {
              await logSourceFail(source.name, source.source_type, `ai_http_${aiRes.status}`, `url=${content.url}`);
              continue;
            }

            const aiData: any = await aiRes.json();
            const rawText = (aiData.content?.[0]?.text || '[]').trim();
            let rules: any;
            try {
              rules = JSON.parse(rawText.replace(/```json|```/g, '').trim());
            } catch {
              const sample = rawText.slice(0, 120).replace(/[\r\n]+/g, ' ');
              await logSourceFail(source.name, source.source_type, 'ai_parse_error', `sample=${sample} url=${content.url}`);
              continue;
            }

            if (!Array.isArray(rules)) {
              await logSourceFail(source.name, source.source_type, 'ai_not_array', `type=${typeof rules} url=${content.url}`);
              continue;
            }
            if (rules.length === 0) {
              await logSourceFail(source.name, source.source_type, 'ai_returned_empty', `url=${content.url} text_len=${text.length}`);
              continue;
            }

            for (const rule of rules) {
              if (!rule.titulo || !rule.contenido || !rule.categoria) continue;
              if (rule.contenido.length < 50) continue;

              const { error } = await supabase.from('steve_knowledge').insert({
                categoria: rule.categoria,
                titulo: rule.titulo.slice(0, 80),
                contenido: rule.contenido.slice(0, 600),
                activo: true,
                orden: 2, // PENDING - needs JM approval
                approval_status: 'pending',
                source_url: content.url,
                industria: 'general',
              });

              if (!error) rulesExtracted++;
            }
          } catch (err: any) {
            await logSourceFail(source.name, source.source_type, 'content_exception', `${err?.message?.slice(0, 200) || 'unknown'} url=${content.url}`);
            console.error(`[content-hunter] Error processing ${content.url}:`, err);
          }
        }

        // Update source. last_checked_at always advances (don't re-process every 20 min).
        // last_content_id ONLY advances when we extracted rules — otherwise we'd silently skip
        // failing sources forever and lose the chance to fix them by improving the extractor.
        const updatePayload: Record<string, any> = { last_checked_at: now.toISOString() };
        if (rulesExtracted > 0) {
          const latestContentId = newContentUrls[0]?.url?.match(/v=([a-zA-Z0-9_-]{11})/)?.[1] || newContentUrls[0]?.url || '';
          updatePayload.last_content_id = latestContentId;
          updatePayload.total_rules_extracted = (source.total_rules_extracted || 0) + rulesExtracted;
        }
        await supabase.from('steve_sources').update(updatePayload).eq('id', source.id);

        totalExtracted += rulesExtracted;
        results.push({ source: source.name, newContent: newContentUrls.length, rulesExtracted });
      } catch (err: any) {
        await logSourceFail(source.name, source.source_type, 'outer_exception', err?.message?.slice(0, 200) || 'unknown');
        console.error(`[content-hunter] Error with source ${source.name}:`, err);
      }
    }

    if (totalExtracted > 0) {
      await supabase.from('qa_log').insert({
        check_type: 'content_hunt',
        status: 'pass',
        details: JSON.stringify({ totalExtracted, results }),
        detected_by: 'steve-content-hunter',
      });
    }

    return c.json({ success: true, totalExtracted, results });
  } catch (err: any) {
    console.error('[content-hunter]', err);
    return c.json({ error: err.message }, 500);
  }
}
