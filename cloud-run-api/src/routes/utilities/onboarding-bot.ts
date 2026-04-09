/**
 * Onboarding Bot API — generates OAuth install URLs for platform connections.
 *
 * Shopify: uses the existing OAuth flow (GET /api/shopify-install).
 *   Merchant clicks URL → Shopify asks permission → callback saves token.
 *   No browser automation, no credentials needed.
 *
 * Endpoints:
 *   POST /api/onboarding-bot { action: "start" | "status" }
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

export async function onboardingBot(c: Context) {
  try {
    // User already validated by authMiddleware
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const supabase = getSupabaseAdmin();

    const body = await c.req.json();
    const { action } = body;

    // Derive API origin for building install URLs
    const rawUrl = new URL(c.req.url);
    const proto = c.req.header('x-forwarded-proto') || rawUrl.protocol.replace(':', '');
    const host = c.req.header('host') || rawUrl.host;
    const apiOrigin = `${proto}://${host}`;

    switch (action) {
      case 'start': {
        const { client_id, shop_domain } = body;

        if (!client_id) {
          return c.json({ error: 'client_id is required' }, 400);
        }

        // Create onboarding job
        const { data: job, error: jobErr } = await supabase
          .from('onboarding_jobs')
          .insert({
            client_id,
            status: 'running',
            shopify_status: shop_domain ? 'waiting_oauth' : 'skipped',
            meta_status: 'skipped',
            klaviyo_status: 'skipped',
          })
          .select('id')
          .single();

        if (jobErr || !job) {
          return c.json({ error: 'Failed to create onboarding job' }, 500);
        }

        const result: Record<string, any> = { job_id: job.id, install_urls: {} };

        // Generate Shopify OAuth install URL
        if (shop_domain) {
          const domain = shop_domain.includes('.myshopify.com')
            ? shop_domain
            : `${shop_domain}.myshopify.com`;

          const installUrl = `${apiOrigin}/api/shopify-install?shop=${encodeURIComponent(domain)}&client_id=${encodeURIComponent(client_id)}`;

          // Store the install URL in the job
          await supabase
            .from('onboarding_jobs')
            .update({
              shopify_step: 'Esperando autorizacion...',
              shopify_install_url: installUrl,
            })
            .eq('id', job.id);

          result.install_urls.shopify = installUrl;
        }

        return c.json(result);
      }

      case 'status': {
        const { job_id } = body;

        if (!job_id) {
          return c.json({ error: 'job_id is required' }, 400);
        }

        const job = await safeQuerySingleOrDefault<any>(
          supabase
            .from('onboarding_jobs')
            .select('*')
            .eq('id', job_id)
            .single(),
          null,
          'onboardingBot.getJob',
        );

        if (!job) {
          return c.json({ error: 'Job not found' }, 404);
        }

        // Check if Shopify OAuth completed (token appeared in platform_connections)
        if (job.shopify_status === 'waiting_oauth' && job.client_id) {
          const conn = await safeQuerySingleOrDefault<any>(
            supabase
              .from('platform_connections')
              .select('is_active, store_name')
              .eq('client_id', job.client_id)
              .eq('platform', 'shopify')
              .eq('is_active', true)
              .single(),
            null,
            'onboardingBot.getShopifyConn',
          );

          if (conn) {
            // OAuth completed! Update job
            await supabase
              .from('onboarding_jobs')
              .update({
                shopify_status: 'completed',
                shopify_step: `Conectado — ${conn.store_name || 'Shopify'}`,
                status: 'completed',
                completed_at: new Date().toISOString(),
              })
              .eq('id', job_id);

            job.shopify_status = 'completed';
            job.shopify_step = `Conectado — ${conn.store_name || 'Shopify'}`;
            job.status = 'completed';
          }
        }

        return c.json({
          status: job.status,
          platforms: {
            shopify: {
              status: job.shopify_status,
              step: job.shopify_step,
              install_url: job.shopify_install_url || null,
            },
            meta: { status: job.meta_status, step: job.meta_step },
            klaviyo: { status: job.klaviyo_status, step: job.klaviyo_step },
          },
          error: job.error,
        });
      }

      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('onboarding-bot error:', err.message);
    return c.json({ error: err.message }, 500);
  }
}
