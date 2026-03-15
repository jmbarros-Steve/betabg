import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface AdLibraryAd {
  id: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  page_id?: string;
  page_name?: string;
  publisher_platforms?: string[];
  estimated_audience_size?: { lower_bound?: number; upper_bound?: number };
  impressions?: { lower_bound?: number; upper_bound?: number };
  spend?: { lower_bound?: number; upper_bound?: number };
  bylines?: string;
  collation_count?: number;
  collation_id?: string;
  currency?: string;
  languages?: string[];
}

export async function syncCompetitorAds(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Auth — user is set by authMiddleware
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Missing authorization' }, 401);
    }

    const { client_id, ig_handles } = await c.req.json();
    if (!client_id || !ig_handles || !Array.isArray(ig_handles) || ig_handles.length === 0) {
      return c.json({ error: 'client_id and ig_handles[] required' }, 400);
    }

    // Verify ownership
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id, client_user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    if (client.user_id !== user.id && client.client_user_id !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Limit to 5 handles
    const handles = ig_handles.slice(0, 5).map((h: string) =>
      h.trim().replace(/^@/, '').toLowerCase()
    );

    console.log(`[sync-competitor-ads] Processing ${handles.length} handles for client ${client_id}`);

    // Get Meta access token — PRIORITIZE the client's user token (already has ads_read)
    const { data: metaConn } = await supabase
      .from('platform_connections')
      .select('access_token_encrypted')
      .eq('client_id', client_id)
      .eq('platform', 'meta')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    let accessToken = '';
    let tokenSource = '';

    // Priority 1: Client's own Meta OAuth token (already approved with ads_read)
    if (metaConn?.access_token_encrypted) {
      const { data: decrypted } = await supabase
        .rpc('decrypt_platform_token', { encrypted_token: metaConn.access_token_encrypted });
      if (decrypted) {
        accessToken = decrypted;
        tokenSource = 'user_token';
      }
    }

    // Priority 2: App access token (requires Marketing API approval on Meta App)
    if (!accessToken) {
      const metaAppId = process.env.META_APP_ID;
      const metaAppSecret = process.env.META_APP_SECRET;
      if (metaAppId && metaAppSecret) {
        try {
          const tokenRes = await fetch('https://graph.facebook.com/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: metaAppId,
              client_secret: metaAppSecret,
              grant_type: 'client_credentials',
            }),
          });
          const tokenData: any = await tokenRes.json();
          if (tokenData.access_token) {
            accessToken = tokenData.access_token;
            tokenSource = 'app_token';
          }
        } catch (e) {
          console.error('[sync-competitor-ads] App token fetch failed:', e);
        }
      }
    }

    if (!accessToken) {
      return c.json({
        error: 'meta_not_connected',
        message: 'Debes conectar tu cuenta de Meta Ads primero para poder rastrear competidores.'
      }, 400);
    }

    console.log(`[sync-competitor-ads] Using ${tokenSource} for Ad Library queries`);

    const results: { handle: string; ads_found: number; status: string }[] = [];

    for (const handle of handles) {
      try {
        // Step 1: Upsert competitor tracking record
        const { data: tracking, error: trackError } = await supabase
          .from('competitor_tracking')
          .upsert({
            client_id,
            ig_handle: handle,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'client_id,ig_handle' })
          .select('id, meta_page_id, last_sync_at')
          .single();

        if (trackError) {
          console.error(`Error upserting tracking for ${handle}:`, trackError);
          results.push({ handle, ads_found: 0, status: 'error: ' + trackError.message });
          continue;
        }

        // Check if synced recently (< 24h)
        if (tracking.last_sync_at) {
          const lastSync = new Date(tracking.last_sync_at);
          const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            console.log(`[sync-competitor-ads] ${handle} synced ${hoursSince.toFixed(1)}h ago, skipping`);
            // Count existing ads
            const { count } = await supabase
              .from('competitor_ads')
              .select('id', { count: 'exact', head: true })
              .eq('tracking_id', tracking.id);
            results.push({ handle, ads_found: count || 0, status: 'cached' });
            continue;
          }
        }

        // Step 2: Search Ad Library with multi-strategy approach
        const AD_LIBRARY_FIELDS = 'id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_delivery_start_time,ad_delivery_stop_time,page_id,page_name,publisher_platforms,ad_snapshot_url,bylines,collation_count,languages';
        const AD_LIBRARY_COUNTRIES = '["CL","MX","CO","AR","PE","US"]';

        // Helper: fetch Ad Library with given params
        async function fetchAdLibrary(params: Record<string, string>): Promise<{ ads: AdLibraryAd[]; error?: string }> {
          const url = new URL('https://graph.facebook.com/v21.0/ads_archive');
          url.searchParams.set('access_token', accessToken);
          url.searchParams.set('ad_type', 'ALL');
          url.searchParams.set('ad_reached_countries', AD_LIBRARY_COUNTRIES);
          url.searchParams.set('ad_active_status', 'ALL');
          url.searchParams.set('fields', AD_LIBRARY_FIELDS);
          // Use higher limit when querying by page_id (more relevant results)
          url.searchParams.set('limit', params.search_page_ids ? '50' : '25');
          for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

          console.log(`[sync-competitor-ads] Ad Library query:`, url.toString().replace(accessToken, '***'));
          const res = await fetch(url.toString());
          const text = await res.text();
          let json: any;
          try { json = JSON.parse(text); } catch {
            return { ads: [], error: 'Non-JSON response from Meta' };
          }
          if (!res.ok || json.error) {
            const code = json.error?.code || 0;
            const msg = json.error?.message || 'Unknown error';
            if (code === 190) return { ads: [], error: 'token_expired: El token de Meta expiró. Reconecta Meta Ads en Conexiones.' };
            if (code === 10 || code === 200) return { ads: [], error: 'permission_denied: La app necesita permisos de Ad Library.' };
            return { ads: [], error: `api_error: ${msg}` };
          }
          return { ads: json.data || [] };
        }

        // Helper: try to resolve IG handle -> Facebook page ID via Pages Search API
        async function resolvePageId(searchQuery: string): Promise<{ pageId: string; pageName: string } | null> {
          try {
            const url = new URL('https://graph.facebook.com/v21.0/pages/search');
            url.searchParams.set('q', searchQuery);
            url.searchParams.set('fields', 'id,name,verification_status');
            url.searchParams.set('access_token', accessToken);
            const res = await fetch(url.toString());
            const json: any = await res.json();
            if (json.data && json.data.length > 0) {
              console.log(`[sync-competitor-ads] Page search for "${searchQuery}" found: ${json.data[0].name} (${json.data[0].id})`);
              return { pageId: json.data[0].id, pageName: json.data[0].name };
            }
          } catch (e) {
            console.error(`[sync-competitor-ads] Page search failed for "${searchQuery}":`, e);
          }
          return null;
        }

        let ads: AdLibraryAd[] = [];
        let searchMethod = '';
        let resolvedPageId = tracking.meta_page_id || null;
        let resolvedPageName = '';

        // Strategy 1: Use cached page_id if available
        if (resolvedPageId) {
          console.log(`[sync-competitor-ads] ${handle}: Using cached page_id ${resolvedPageId}`);
          const result = await fetchAdLibrary({ search_page_ids: resolvedPageId });
          if (result.error) {
            results.push({ handle, ads_found: 0, status: result.error });
            continue;
          }
          ads = result.ads;
          searchMethod = 'cached_page_id';
        }

        // Strategy 2: Try to resolve handle -> page_id via Pages Search API
        if (ads.length === 0 && !resolvedPageId) {
          // Generate search variations from handle
          const variations = [
            handle,
            handle.replace(/_/g, ' '),
            handle.replace(/([a-z])([A-Z])/g, '$1 $2'),
            handle.replace(/(\d+)/g, ' $1 ').trim(),
          ];
          // Deduplicate
          const uniqueVariations = [...new Set(variations)];

          for (const variation of uniqueVariations) {
            const page = await resolvePageId(variation);
            if (page) {
              resolvedPageId = page.pageId;
              resolvedPageName = page.pageName;
              console.log(`[sync-competitor-ads] ${handle}: Resolved to page "${page.pageName}" (${page.pageId}) via "${variation}"`);
              const result = await fetchAdLibrary({ search_page_ids: page.pageId });
              if (result.error) {
                results.push({ handle, ads_found: 0, status: result.error });
                break;
              }
              ads = result.ads;
              searchMethod = `resolved_page_id:${variation}`;
              break;
            }
          }
        }

        // Strategy 3: Fallback — use search_terms to DISCOVER the page_id, then
        // re-query with search_page_ids to get only THEIR ads (not ads that mention them)
        if (ads.length === 0 && !results.find(r => r.handle === handle)) {
          const searchVariations = [
            handle,
            handle.replace(/_/g, ' '),
          ];
          const uniqueSearches = [...new Set(searchVariations)];

          for (const term of uniqueSearches) {
            console.log(`[sync-competitor-ads] ${handle}: Discovery search_terms="${term}" to find page_id`);
            const result = await fetchAdLibrary({ search_terms: term });
            if (result.error) {
              results.push({ handle, ads_found: 0, status: result.error });
              break;
            }
            if (result.ads.length > 0) {
              // Look for the best matching page among results
              const termLower = term.toLowerCase().replace(/[^a-z0-9]/g, '');
              const handleLower = handle.toLowerCase().replace(/[^a-z0-9]/g, '');

              // Count ads per page_id and find the best match
              const pageAdCounts: Record<string, { count: number; name: string; id: string }> = {};
              for (const ad of result.ads) {
                if (ad.page_id && ad.page_name) {
                  if (!pageAdCounts[ad.page_id]) {
                    pageAdCounts[ad.page_id] = { count: 0, name: ad.page_name, id: ad.page_id };
                  }
                  pageAdCounts[ad.page_id].count++;
                }
              }

              // Score pages: prefer name match over count
              let bestPage: { id: string; name: string; score: number } | null = null;
              for (const [pageId, info] of Object.entries(pageAdCounts)) {
                const nameLower = info.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                let score = 0;
                // Exact match
                if (nameLower === termLower || nameLower === handleLower) score = 100;
                // Name contains search term or vice versa
                else if (nameLower.includes(termLower) || termLower.includes(nameLower)) score = 80;
                else if (nameLower.includes(handleLower) || handleLower.includes(nameLower)) score = 70;
                // Partial word match
                else {
                  const termWords = term.toLowerCase().split(/[\s_-]+/);
                  const nameWords = info.name.toLowerCase().split(/[\s_-]+/);
                  const matchingWords = termWords.filter(tw => nameWords.some(nw => nw.includes(tw) || tw.includes(nw)));
                  if (matchingWords.length > 0) score = 30 + (matchingWords.length / termWords.length) * 30;
                }
                // Tiebreak by ad count
                score += Math.min(info.count, 10) * 0.1;

                if (!bestPage || score > bestPage.score) {
                  bestPage = { id: pageId, name: info.name, score };
                }
              }

              if (bestPage && bestPage.score >= 30) {
                console.log(`[sync-competitor-ads] ${handle}: Discovered page "${bestPage.name}" (${bestPage.id}) score=${bestPage.score} via search_terms, re-querying with search_page_ids`);
                resolvedPageId = bestPage.id;
                resolvedPageName = bestPage.name;

                // Re-query using search_page_ids to get ONLY their ads
                const pageResult = await fetchAdLibrary({ search_page_ids: bestPage.id });
                if (pageResult.error) {
                  results.push({ handle, ads_found: 0, status: pageResult.error });
                  break;
                }
                ads = pageResult.ads;
                searchMethod = `discovered_page_id:${bestPage.name}`;
              } else {
                // No good page match — filter results to only ads FROM pages whose name matches
                console.log(`[sync-competitor-ads] ${handle}: No strong page match found, filtering search_terms results by page_name similarity`);
                const filtered = result.ads.filter(ad => {
                  if (!ad.page_name) return false;
                  const adPageLower = ad.page_name.toLowerCase().replace(/[^a-z0-9]/g, '');
                  return adPageLower.includes(termLower) || termLower.includes(adPageLower)
                    || adPageLower.includes(handleLower) || handleLower.includes(adPageLower);
                });
                if (filtered.length > 0) {
                  ads = filtered;
                  searchMethod = `search_terms_filtered:${term}`;
                  // Cache the page_id from the first filtered result
                  if (filtered[0].page_id) {
                    resolvedPageId = filtered[0].page_id;
                    resolvedPageName = filtered[0].page_name || '';
                  }
                } else {
                  console.log(`[sync-competitor-ads] ${handle}: search_terms returned ${result.ads.length} ads but none matched page name. Skipping to avoid showing irrelevant ads.`);
                  // Do NOT use these ads — they are ads that MENTION the competitor, not BY the competitor
                }
              }
              break;
            }
          }
        }

        // Skip if already pushed an error result
        if (results.find(r => r.handle === handle)) continue;

        console.log(`[sync-competitor-ads] ${handle}: Found ${ads.length} ads via ${searchMethod || 'none'}`);

        // Update tracking record with page info and sync timestamp
        const updateData: Record<string, any> = { last_sync_at: new Date().toISOString() };
        if (ads.length > 0 && ads[0].page_id) {
          updateData.meta_page_id = ads[0].page_id;
          updateData.display_name = ads[0].page_name || handle;
        } else if (resolvedPageId && !tracking.meta_page_id) {
          updateData.meta_page_id = resolvedPageId;
          if (resolvedPageName) updateData.display_name = resolvedPageName;
        }
        await supabase
          .from('competitor_tracking')
          .update(updateData)
          .eq('id', tracking.id);

        // Step 3: Clear old ads and insert fresh ones (removes stale "mentioned" ads from previous bad syncs)
        if (ads.length > 0) {
          const { error: deleteError } = await supabase
            .from('competitor_ads')
            .delete()
            .eq('tracking_id', tracking.id);
          if (deleteError) {
            console.error(`[sync-competitor-ads] Delete old ads for ${handle}:`, deleteError);
          }
        }

        const adsToUpsert = ads.map((ad) => {
          const startDate = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time) : null;
          const endDate = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time) : null;
          const isActive = !endDate || endDate > new Date();
          const daysRunning = startDate
            ? Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          // Determine ad type from content
          let adType = 'image';
          if (ad.collation_count && ad.collation_count > 1) adType = 'carousel';

          // Extract CTA from link titles
          const ctaMap: Record<string, string> = {
            'comprar': 'SHOP_NOW',
            'shop': 'SHOP_NOW',
            'learn more': 'LEARN_MORE',
            'más información': 'LEARN_MORE',
            'sign up': 'SIGN_UP',
            'registrarse': 'SIGN_UP',
            'descargar': 'DOWNLOAD',
            'download': 'DOWNLOAD',
          };
          let ctaType = 'OTHER';
          const linkTitle = (ad.ad_creative_link_titles?.[0] || '').toLowerCase();
          for (const [key, value] of Object.entries(ctaMap)) {
            if (linkTitle.includes(key)) { ctaType = value; break; }
          }

          return {
            tracking_id: tracking.id,
            client_id,
            ad_library_id: ad.id,
            ad_text: ad.ad_creative_bodies?.[0] || null,
            ad_headline: ad.ad_creative_link_titles?.[0] || null,
            ad_description: ad.ad_creative_link_descriptions?.[0] || null,
            image_url: ad.ad_snapshot_url || null,
            ad_type: adType,
            cta_type: ctaType,
            started_at: ad.ad_delivery_start_time || null,
            is_active: isActive,
            days_running: daysRunning,
          };
        });

        if (adsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from('competitor_ads')
            .upsert(adsToUpsert, { onConflict: 'tracking_id,ad_library_id', ignoreDuplicates: false });

          if (upsertError) {
            console.error(`Upsert error for ${handle}:`, upsertError);
            results.push({ handle, ads_found: 0, status: 'upsert_error: ' + upsertError.message });
            continue;
          }
        }

        results.push({ handle, ads_found: adsToUpsert.length, status: 'synced' });
      } catch (err: any) {
        console.error(`Error processing ${handle}:`, err);
        results.push({ handle, ads_found: 0, status: 'error: ' + err.message });
      }
    }

    console.log('[sync-competitor-ads] Complete:', results);

    return c.json({ success: true, results });

  } catch (error) {
    console.error('Sync error:', error);
    return c.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      500
    );
  }
}
