/**
 * Lobo Nocturno — Night Mode
 *
 * Runs at 3am Chile (6am UTC): re-scrapes prospect stores and competitor ads.
 * Detects changes (new products, price changes, new competitor ads) and
 * stores findings in wolf_findings JSONB for morning delivery.
 *
 * Cron: 0 6 * * * (6am UTC = 3am Chile)
 * Auth: X-Cron-Secret header
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery, safeQueryOrDefault } from '../../lib/safe-supabase.js';

export async function wolfNightMode(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret')?.trim();
  const expected = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return c.json({ error: 'APIFY_TOKEN not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const results = { prospects_checked: 0, findings_created: 0, errors: 0 };

  try {
    // Find active prospects with store URLs
    const prospects = await safeQuery<{
      id: string;
      phone: string;
      what_they_sell: string | null;
      audit_data: any;
      investigation_data: any;
    }>(
      supabase
        .from('wa_prospects')
        .select('id, phone, what_they_sell, audit_data, investigation_data')
        .not('stage', 'in', '("lost","converted")')
        .not('audit_data', 'is', null)
        .order('updated_at', { ascending: true })
        .limit(20),
      'wolfNightMode.fetchActiveProspects',
    );

    if (!prospects.length) {
      return c.json({ success: true, message: 'No prospects to check', ...results });
    }

    for (const prospect of prospects) {
      try {
        results.prospects_checked++;
        const findings: string[] = [];
        const storeUrl = prospect.audit_data?.url;
        const prevInv = prospect.investigation_data || {};

        // 1. Re-scrape store: detect new products / price changes
        if (storeUrl) {
          try {
            const runRes = await fetch('https://api.apify.com/v2/acts/apify~website-content-crawler/runs', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${APIFY_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                startUrls: [{ url: storeUrl }],
                maxCrawlPages: 3,
                maxCrawlDepth: 1,
                crawlerType: 'cheerio',
              }),
            });

            if (runRes.ok) {
              const runData: any = await runRes.json();
              const runId = runData.data?.id;

              if (runId) {
                // Wait for completion (max 45s)
                let attempts = 0;
                let status = 'RUNNING';
                while (status === 'RUNNING' && attempts < 9) {
                  await new Promise(r => setTimeout(r, 5000));
                  const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
                  const statusData: any = await statusRes.json();
                  status = statusData.data?.status || 'FAILED';
                  attempts++;
                }

                if (status === 'SUCCEEDED') {
                  const datasetId = runData.data?.defaultDatasetId;
                  const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=5`);
                  const items = (await itemsRes.json()) as any[];

                  if (items?.length) {
                    // Count product images
                    const allHtml = items.map((i: any) => i.html || '').join('\n');
                    const imgRegex = /https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)/gi;
                    const newImages = [...new Set(allHtml.match(imgRegex) || [])];
                    const prevImages = prevInv.store?.product_images || [];

                    // Detect new products (images not in previous scrape)
                    const newProductImages = newImages.filter(img => !prevImages.includes(img));
                    if (newProductImages.length > 0) {
                      findings.push(`Subió ${newProductImages.length} producto(s) nuevo(s) a su tienda`);

                      // Update investigation_data with new images
                      const updatedInv = {
                        ...prevInv,
                        store: {
                          ...prevInv.store,
                          product_images: [...new Set([...prevImages, ...newProductImages])].slice(0, 20),
                        },
                      };
                      await supabase
                        .from('wa_prospects')
                        .update({ investigation_data: updatedInv })
                        .eq('id', prospect.id);
                    }

                    // Detect price changes
                    const allText = items.map((i: any) => i.text || '').join('\n');
                    const priceRegex = /\$[\d.,]+/g;
                    const newPrices = (allText.match(priceRegex) || []).map(p => p.replace(/[$.]/g, '').replace(',', ''));
                    const prevPriceRange = prevInv.store?.price_range || '';
                    const newPriceRange = newPrices.length >= 2
                      ? `$${Math.min(...newPrices.map(Number).filter(n => n > 0))} - $${Math.max(...newPrices.map(Number).filter(n => n > 0))}`
                      : '';

                    if (newPriceRange && prevPriceRange && newPriceRange !== prevPriceRange) {
                      findings.push(`Cambio de precios detectado: ${prevPriceRange} → ${newPriceRange}`);
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error(`[wolf-night] Store scrape error for ${prospect.phone}:`, err);
          }
        }

        // 2. Check new competitor ads for their industry (last 24h)
        if (prospect.what_they_sell) {
          const keywords = prospect.what_they_sell.toLowerCase().split(/[\s,;]+/).filter((w: string) => w.length >= 3);
          if (keywords.length > 0) {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const newAds = await safeQueryOrDefault<{ ad_headline: string | null; ad_text: string | null }>(
              supabase
                .from('competitor_ads')
                .select('ad_headline, ad_text')
                .ilike('ad_text', `%${keywords[0]}%`)
                .gte('created_at', yesterday)
                .limit(5),
              [],
              'wolfNightMode.fetchCompetitorAds',
            );

            if (newAds.length) {
              findings.push(`${newAds.length} anuncio(s) nuevo(s) de competencia en ${prospect.what_they_sell}`);
            }
          }
        }

        // Save findings if any
        if (findings.length > 0) {
          await supabase
            .from('wa_prospects')
            .update({
              wolf_findings: {
                findings,
                checked_at: new Date().toISOString(),
              },
              wolf_checked_at: new Date().toISOString(),
            })
            .eq('id', prospect.id);

          results.findings_created++;
          console.log(`[wolf-night] ${prospect.phone}: ${findings.length} findings`);
        }
      } catch (err) {
        console.error(`[wolf-night] Error for ${prospect.phone}:`, err);
        results.errors++;
      }
    }

    console.log('[wolf-night] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[wolf-night] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
