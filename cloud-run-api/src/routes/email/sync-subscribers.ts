import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Decrypt Shopify access token from the platform_connections table.
 * Follows the same pattern used in fetch-shopify-analytics.ts.
 */
async function getShopifyCredentials(supabase: any, clientId: string) {
  const { data, error } = await supabase
    .from('platform_connections')
    .select('shop_domain, access_token_encrypted')
    .eq('client_id', clientId)
    .eq('platform', 'shopify')
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  const shopDomain = data.shop_domain;
  let accessToken = '';

  if (data.access_token_encrypted) {
    const { data: decrypted } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: data.access_token_encrypted,
    });
    if (decrypted) accessToken = decrypted;
  }

  if (!shopDomain || !accessToken) return null;

  return { shopDomain, accessToken };
}

/**
 * Fetch all customers from Shopify with pagination.
 */
async function fetchAllShopifyCustomers(shopDomain: string, accessToken: string) {
  const customers: any[] = [];
  let nextPageUrl: string | null = `https://${shopDomain}/admin/api/2024-10/customers.json?limit=250`;

  while (nextPageUrl) {
    const res = await fetch(nextPageUrl, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Shopify API error ${res.status}: ${errText}`);
    }

    const data: any = await res.json();
    customers.push(...(data.customers || []));

    // Check for next page via Link header
    const linkHeader = res.headers.get('link');
    nextPageUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextPageUrl = nextMatch[1];
    }
  }

  return customers;
}

/**
 * Sync Shopify customers to email_subscribers table.
 */
export async function syncSubscribers(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) {
    return c.json({ error: 'client_id is required' }, 400);
  }

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'sync': {
      // Full sync: fetch all Shopify customers and upsert
      const creds = await getShopifyCredentials(supabase, client_id);
      if (!creds) {
        return c.json({ error: 'No active Shopify connection found for this client' }, 404);
      }

      console.log(`Syncing subscribers for client ${client_id} from ${creds.shopDomain}`);

      const customers = await fetchAllShopifyCustomers(creds.shopDomain, creds.accessToken);
      console.log(`Fetched ${customers.length} customers from Shopify`);

      let synced = 0;
      let skipped = 0;
      const errors: string[] = [];

      // Process in batches of 50
      for (let i = 0; i < customers.length; i += 50) {
        const batch = customers.slice(i, i + 50);
        const records = batch
          .filter((c: any) => c.email) // Skip customers without email
          .map((cust: any) => ({
            client_id,
            email: cust.email.toLowerCase().trim(),
            first_name: cust.first_name || null,
            last_name: cust.last_name || null,
            source: 'shopify_customer',
            shopify_customer_id: String(cust.id),
            status: cust.email_marketing_consent?.state === 'subscribed' ? 'subscribed' :
                    cust.email_marketing_consent?.state === 'unsubscribed' ? 'unsubscribed' : 'subscribed',
            tags: cust.tags ? cust.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
            total_orders: cust.orders_count || 0,
            total_spent: parseFloat(cust.total_spent || '0'),
            last_order_at: cust.last_order_name ? new Date().toISOString() : null,
            subscribed_at: cust.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));

        if (records.length === 0) {
          skipped += batch.length;
          continue;
        }

        const { error: upsertErr, count } = await supabase
          .from('email_subscribers')
          .upsert(records, {
            onConflict: 'client_id,email',
            ignoreDuplicates: false,
          });

        if (upsertErr) {
          console.error(`Batch upsert error:`, upsertErr);
          errors.push(upsertErr.message);
        } else {
          synced += records.length;
        }
        skipped += batch.length - records.length;
      }

      return c.json({
        success: true,
        total_shopify_customers: customers.length,
        synced,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    case 'add': {
      // Manually add a subscriber
      const { email, first_name, last_name, tags } = body;
      if (!email) return c.json({ error: 'email is required' }, 400);

      const { data, error } = await supabase
        .from('email_subscribers')
        .upsert({
          client_id,
          email: email.toLowerCase().trim(),
          first_name: first_name || null,
          last_name: last_name || null,
          source: 'manual',
          tags: tags || [],
          status: 'subscribed',
          subscribed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'client_id,email' })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, subscriber: data });
    }

    case 'update': {
      // Update subscriber fields
      const { subscriber_id, ...updates } = body;
      if (!subscriber_id) return c.json({ error: 'subscriber_id is required' }, 400);

      const allowedFields = ['first_name', 'last_name', 'tags', 'custom_fields', 'status'];
      const cleanUpdates: any = { updated_at: new Date().toISOString() };
      for (const field of allowedFields) {
        if (updates[field] !== undefined) cleanUpdates[field] = updates[field];
      }
      if (cleanUpdates.status === 'unsubscribed') {
        cleanUpdates.unsubscribed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('email_subscribers')
        .update(cleanUpdates)
        .eq('id', subscriber_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, subscriber: data });
    }

    case 'delete': {
      const { subscriber_id } = body;
      if (!subscriber_id) return c.json({ error: 'subscriber_id is required' }, 400);

      const { error } = await supabase
        .from('email_subscribers')
        .delete()
        .eq('id', subscriber_id)
        .eq('client_id', client_id);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    case 'stats': {
      // Get subscriber counts by status
      const { data, error } = await supabase
        .from('email_subscribers')
        .select('status', { count: 'exact' })
        .eq('client_id', client_id);

      if (error) return c.json({ error: error.message }, 500);

      // Count by status
      const { data: counts } = await supabase.rpc('exec_sql', {
        query: `
          SELECT status, count(*) as count
          FROM email_subscribers
          WHERE client_id = '${client_id}'
          GROUP BY status
        `,
      });

      // Simple count approach
      const { count: total } = await supabase
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id);

      const { count: subscribed } = await supabase
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('status', 'subscribed');

      const { count: unsubscribed } = await supabase
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('status', 'unsubscribed');

      return c.json({
        total: total || 0,
        subscribed: subscribed || 0,
        unsubscribed: unsubscribed || 0,
        bounced: (total || 0) - (subscribed || 0) - (unsubscribed || 0),
      });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
