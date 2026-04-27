import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

interface ShopifyCheckout {
  id: number;
  token: string;
  email: string | null;
  phone: string | null;
  customer: { id?: number; first_name?: string; last_name?: string; email?: string; phone?: string } | null;
  shipping_address: { name?: string; phone?: string } | null;
  billing_address: { phone?: string } | null;
  total_price: string;
  currency: string;
  abandoned_checkout_url: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  line_items: Array<{ title: string; price: string; quantity: number; image_url?: string | null }>;
}

const SHOPIFY_API_VERSION = '2026-04';

/**
 * Pull-mode sync of Shopify abandoned checkouts.
 * Endpoint: POST /api/sync-shopify-abandoned-checkouts
 *   Body: { connectionId: string }
 *   Auth: X-Cron-Secret (cron) | internal | JWT user owner
 *
 * Iterates Shopify Admin API GET /admin/api/{ver}/checkouts.json
 * (returns only abandoned/incomplete checkouts) and upserts into
 * `shopify_abandoned_checkouts`. Unlike the webhook flow, this does NOT
 * require a phone — saves every abandoned checkout regardless.
 */
export async function syncShopifyAbandonedCheckouts(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const isCron = isValidCronSecret(c.req.header('X-Cron-Secret'));
    const isInternal = c.get('isInternal') === true;
    const user = c.get('user');

    if (!isCron && !isInternal && !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { connectionId } = await c.req.json();
    if (!connectionId) {
      return c.json({ error: 'connectionId is required' }, 400);
    }

    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    if (connection.platform !== 'shopify') {
      return c.json({ error: 'Connection is not a Shopify connection' }, 400);
    }

    // Auth check for non-cron callers
    if (!isCron && !isInternal) {
      const clientData = connection.clients as { user_id: string; client_user_id: string | null };
      const userId = user?.id;
      if (clientData.user_id !== userId && clientData.client_user_id !== userId) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    const { store_url, access_token_encrypted, client_id } = connection;
    if (!store_url || !access_token_encrypted) {
      return c.json({ error: 'Connection missing store_url or token' }, 400);
    }

    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });
    if (decryptError || !decryptedToken) {
      console.error('[sync-abandoned] Decrypt error:', decryptError);
      return c.json({ error: 'Failed to decrypt token' }, 500);
    }

    const cleanStoreUrl = store_url.replace(/^https?:\/\//, '');
    const headers = {
      'X-Shopify-Access-Token': decryptedToken,
      'Content-Type': 'application/json',
    };

    // GET /checkouts.json returns only abandoned/incomplete checkouts.
    // Default range is last 90 days. Paginate via Link header.
    async function fetchAllCheckouts(initialUrl: string): Promise<ShopifyCheckout[]> {
      const out: ShopifyCheckout[] = [];
      let url: string | null = initialUrl;
      let pages = 0;
      while (url && pages < 20) {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error('[sync-abandoned] Shopify API error:', res.status, text.slice(0, 300));
          throw new Error(`Shopify API ${res.status}`);
        }
        const json: any = await res.json();
        out.push(...(json.checkouts || []));
        const linkHeader = res.headers.get('Link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;
        pages++;
      }
      return out;
    }

    const initialUrl = `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/checkouts.json?limit=250`;
    const checkouts = await fetchAllCheckouts(initialUrl);
    console.log(`[sync-abandoned] ${cleanStoreUrl}: fetched ${checkouts.length} abandoned checkouts`);

    if (checkouts.length === 0) {
      return c.json({ ok: true, fetched: 0, upserted: 0 });
    }

    // Map to DB rows
    const rows = checkouts.map((co) => {
      const phone = co.phone
        || co.customer?.phone
        || co.shipping_address?.phone
        || co.billing_address?.phone
        || null;
      const cleanPhone = phone ? String(phone).replace(/[\s\-()]/g, '') : null;
      const customerName = co.customer?.first_name
        ? `${co.customer.first_name} ${co.customer.last_name || ''}`.trim()
        : co.shipping_address?.name || null;
      const lineItems = (co.line_items || []).slice(0, 10).map((li) => ({
        title: li.title,
        price: li.price,
        quantity: li.quantity,
        image_url: li.image_url || null,
      }));
      return {
        client_id,
        checkout_id: String(co.id),
        customer_phone: cleanPhone,
        customer_name: customerName,
        customer_email: co.email || co.customer?.email || null,
        line_items: lineItems,
        total_price: parseFloat(co.total_price) || 0,
        currency: co.currency || 'CLP',
        abandoned_checkout_url: co.abandoned_checkout_url,
        order_completed: !!co.completed_at,
      };
    });

    const { error: upsertError } = await supabase
      .from('shopify_abandoned_checkouts')
      .upsert(rows, { onConflict: 'client_id,checkout_id' });

    if (upsertError) {
      console.error('[sync-abandoned] Upsert error:', upsertError);
      return c.json({ error: 'Failed to upsert', details: upsertError.message }, 500);
    }

    // Update last_sync_at on the connection (non-blocking)
    supabase.from('platform_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connectionId)
      .then(() => {});

    return c.json({ ok: true, fetched: checkouts.length, upserted: rows.length });
  } catch (err: any) {
    console.error('[sync-abandoned] Unhandled error:', err);
    return c.json({ error: 'Internal error', details: err?.message?.slice(0, 200) }, 500);
  }
}

/**
 * Cron-friendly bulk sync — iterates ALL active Shopify connections.
 * Endpoint: POST /api/cron/sync-all-abandoned-checkouts
 * Auth: X-Cron-Secret only.
 */
export async function syncAllAbandonedCheckouts(c: Context) {
  try {
    if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseAdmin();
    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('id, client_id, store_url')
      .eq('platform', 'shopify')
      .eq('is_active', true);

    if (error || !connections) {
      return c.json({ error: 'Failed to fetch connections' }, 500);
    }

    const results: Array<{ connection_id: string; status: string; error?: string; fetched?: number }> = [];
    const baseUrl = process.env.SELF_URL || 'https://steve-api-850416724643.us-central1.run.app';

    for (const conn of connections) {
      try {
        const res = await fetch(`${baseUrl}/api/sync-shopify-abandoned-checkouts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Cron-Secret': process.env.CRON_SECRET || 'steve-cron-secret-2024',
          },
          body: JSON.stringify({ connectionId: conn.id }),
        });
        const body: any = await res.json().catch(() => ({}));
        results.push({
          connection_id: conn.id,
          status: res.ok ? 'ok' : 'error',
          fetched: body?.fetched,
          error: res.ok ? undefined : (body?.error || `HTTP ${res.status}`),
        });
      } catch (err: any) {
        results.push({ connection_id: conn.id, status: 'error', error: err?.message?.slice(0, 200) });
      }
    }

    const succeeded = results.filter((r) => r.status === 'ok').length;
    const totalFetched = results.reduce((acc, r) => acc + (r.fetched || 0), 0);
    console.log(`[cron-abandoned] ${succeeded}/${connections.length} connections synced, ${totalFetched} checkouts total`);

    return c.json({ total: connections.length, succeeded, totalFetched, results });
  } catch (err: any) {
    console.error('[cron-abandoned] Unhandled error:', err);
    return c.json({ error: 'Internal error', details: err?.message?.slice(0, 200) }, 500);
  }
}
