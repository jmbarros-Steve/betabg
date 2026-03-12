import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function fetchShopifyAnalytics(c: Context) {
  try {
    const serviceClient = getSupabaseAdmin();

    // Auth
    const authHeader = c.req.header('Authorization');
    const shopifySessionToken = c.req.header('X-Shopify-Session-Token');
    let userId: string | null = null;

    if (shopifySessionToken) {
      const [, payloadB64] = shopifySessionToken.split('.');
      if (!payloadB64) {
        return c.json({ error: 'Invalid token' }, 401);
      }
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
      const shopDomain = payload.dest?.replace('https://', '').replace('http://', '');
      const { data: client } = await serviceClient.from('clients').select('client_user_id, user_id').eq('shop_domain', shopDomain).single();
      if (!client) {
        return c.json({ error: 'Shop not found' }, 401);
      }
      userId = client.client_user_id || client.user_id;
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
      if (authError || !user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      userId = user.id;
    } else {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { connectionId, daysBack = 30 } = await c.req.json();
    if (!connectionId) {
      return c.json({ error: 'connectionId required' }, 400);
    }

    // Get connection with ownership check
    const { data: connection, error: connError } = await serviceClient
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'shopify')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };

    // Check super admin access
    const { data: roleRow } = await serviceClient
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', userId!)
      .eq('role', 'admin')
      .maybeSingle();
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && clientData.user_id !== userId && clientData.client_user_id !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { store_url, access_token_encrypted } = connection;
    if (!store_url || !access_token_encrypted) {
      return c.json({ error: 'Missing store credentials' }, 400);
    }

    // Decrypt token
    const { data: decryptedToken, error: decryptError } = await serviceClient
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return c.json({ error: 'Token decryption failed' }, 500);
    }

    const cleanStoreUrl = store_url.replace(/^https?:\/\//, '');
    const shopifyHeaders = {
      'X-Shopify-Access-Token': decryptedToken,
      'Content-Type': 'application/json',
    };

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    const SHOPIFY_API_VERSION = '2025-01';

    // Paginated fetch helper — follows Shopify's Link header pagination
    async function fetchAllPages<T>(initialUrl: string, key: string): Promise<T[]> {
      const results: T[] = [];
      let url: string | null = initialUrl;
      while (url) {
        const res = await fetch(url, { headers: shopifyHeaders });
        if (!res.ok) {
          const errText = await res.text();
          console.warn(`[fetch-shopify-analytics] Paginated fetch failed: ${res.status}`, errText);
          break;
        }
        const json: any = await res.json();
        results.push(...(json[key] || []));
        // Parse Link header for next page
        const linkHeader = res.headers.get('Link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;
      }
      return results;
    }

    const ordersUrl = `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&created_at_min=${sinceDate.toISOString()}&limit=250&fields=id,line_items,created_at,currency,source_name,landing_site,referring_site,total_price,customer,financial_status`;
    const checkoutsUrl = `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/checkouts.json?limit=250&created_at_min=${sinceDate.toISOString()}`;

    console.log('[fetch-shopify-analytics] Fetching orders and checkouts from:', cleanStoreUrl);

    const [orders, checkouts] = await Promise.all([
      fetchAllPages<any>(ordersUrl, 'orders'),
      fetchAllPages<any>(checkoutsUrl, 'checkouts'),
    ]);

    // --- TOP SKUs + Channel + UTM ---
    const skuMap = new Map<string, { sku: string; name: string; quantity: number; revenue: number }>();
    const channelMap = new Map<string, { channel: string; orders: number; revenue: number }>();
    const utmMap = new Map<string, { utm: string; source: string; medium: string; campaign: string; orders: number; revenue: number }>();

    // Customer metrics tracking — accumulate revenue from orders (not customer.total_spent)
    const customerMap = new Map<number, { orders_count: number; total_spent: number; created_at: string }>();
    let totalOrderCount = 0;
    let paidOrderCount = 0;
    const orderDates: { customerId: number; orderDate: string }[] = [];

    // Daily breakdown for charts
    const dailyMap = new Map<string, { revenue: number; orders: number }>();

    // Track customers who had abandoned checkouts for real conversion rate
    const checkoutCustomerEmails = new Set<string>();

    // Totals for summary
    let totalRevenue = 0;

    console.log(`[fetch-shopify-analytics] Fetched ${orders.length} orders (paginated)`);

    for (const order of orders) {
      const orderRevenue = parseFloat(order.total_price || '0');
      totalRevenue += orderRevenue;

      // Daily breakdown for charts
      const dateKey = (order.created_at || '').split('T')[0];
      if (dateKey) {
        const dayEntry = dailyMap.get(dateKey) || { revenue: 0, orders: 0 };
        dayEntry.revenue += orderRevenue;
        dayEntry.orders += 1;
        dailyMap.set(dateKey, dayEntry);
      }

      // SKU tracking
      for (const item of (order.line_items || [])) {
        const sku = item.sku || item.variant_title || `ID-${item.variant_id || item.product_id}`;
        const existing = skuMap.get(sku) || { sku, name: item.title || item.name || sku, quantity: 0, revenue: 0 };
        existing.quantity += item.quantity || 0;
        existing.revenue += parseFloat(item.price || '0') * (item.quantity || 0);
        skuMap.set(sku, existing);
      }

      // Channel tracking
      const channel = order.source_name || 'direct';
      const channelEntry = channelMap.get(channel) || { channel, orders: 0, revenue: 0 };
      channelEntry.orders += 1;
      channelEntry.revenue += orderRevenue;
      channelMap.set(channel, channelEntry);

      // UTM tracking from landing_site
      const landingSite = order.landing_site || '';
      if (landingSite.includes('utm_')) {
        try {
          const url = new URL(landingSite.startsWith('http') ? landingSite : `https://example.com${landingSite}`);
          const source = url.searchParams.get('utm_source') || '';
          const medium = url.searchParams.get('utm_medium') || '';
          const campaign = url.searchParams.get('utm_campaign') || '';
          if (source || campaign) {
            const utmKey = `${source}|${medium}|${campaign}`;
            const utmEntry = utmMap.get(utmKey) || { utm: utmKey, source, medium, campaign, orders: 0, revenue: 0 };
            utmEntry.orders += 1;
            utmEntry.revenue += orderRevenue;
            utmMap.set(utmKey, utmEntry);
          }
        } catch { /* ignore invalid URLs */ }
      }

      // Customer tracking
      totalOrderCount++;
      if (order.financial_status === 'paid' || order.financial_status === 'partially_paid') {
        paidOrderCount++;
      }
      const cust = order.customer;
      if (cust?.id) {
        const existing = customerMap.get(cust.id);
        if (existing) {
          existing.orders_count += 1;
          existing.total_spent += orderRevenue;
        } else {
          customerMap.set(cust.id, {
            orders_count: 1,
            total_spent: orderRevenue,
            created_at: cust.created_at || order.created_at,
          });
        }
        orderDates.push({ customerId: cust.id, orderDate: order.created_at });
      }
    }

    const topSkus = Array.from(skuMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const salesByChannel = Array.from(channelMap.values())
      .sort((a, b) => b.revenue - a.revenue);

    const utmPerformance = Array.from(utmMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    // --- CUSTOMER METRICS ---
    const uniqueCustomers = customerMap.size;
    // Conversion rate: customers who bought / (customers who bought + customers who only abandoned checkout)
    // checkoutCustomerEmails is populated after checkouts are fetched — will be computed below
    const totalLtv = Array.from(customerMap.values()).reduce((sum, c) => sum + c.total_spent, 0);
    const averageLtv = uniqueCustomers > 0 ? totalLtv / uniqueCustomers : 0;
    const repeatCustomers = Array.from(customerMap.values()).filter(c => c.orders_count > 1).length;
    const repeatCustomerRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;

    // --- COHORT ANALYSIS ---
    const cohortMap = new Map<string, { total: number; months: Map<number, Set<number>> }>();
    for (const [custId, custData] of customerMap) {
      const createdDate = new Date(custData.created_at);
      const cohortKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
      if (!cohortMap.has(cohortKey)) {
        cohortMap.set(cohortKey, { total: 0, months: new Map() });
      }
      const cohort = cohortMap.get(cohortKey)!;
      cohort.total++;
      if (!cohort.months.has(0)) cohort.months.set(0, new Set());
      cohort.months.get(0)!.add(custId);
    }

    for (const { customerId, orderDate } of orderDates) {
      const custData = customerMap.get(customerId);
      if (!custData) continue;
      const createdDate = new Date(custData.created_at);
      const cohortKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
      const cohort = cohortMap.get(cohortKey);
      if (!cohort) continue;

      const oDate = new Date(orderDate);
      const monthOffset = (oDate.getFullYear() - createdDate.getFullYear()) * 12 + (oDate.getMonth() - createdDate.getMonth());
      if (monthOffset >= 0 && monthOffset <= 5) {
        if (!cohort.months.has(monthOffset)) cohort.months.set(monthOffset, new Set());
        cohort.months.get(monthOffset)!.add(customerId);
      }
    }

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const cohorts = Array.from(cohortMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, data]) => {
        const [year, month] = key.split('-');
        const label = `${monthNames[parseInt(month) - 1]} ${year}`;
        const result: any = { cohort: label, month0: data.months.get(0)?.size || 0 };
        for (let i = 1; i <= 5; i++) {
          const count = data.months.get(i)?.size;
          if (count !== undefined) result[`month${i}`] = count;
        }
        return result;
      });

    // --- ABANDONED CHECKOUTS ---
    let abandonedCarts: any[] = [];

    console.log(`[fetch-shopify-analytics] Fetched ${checkouts.length} abandoned checkouts (paginated)`);

    abandonedCarts = checkouts.map((c: any) => {
      const email = c.email || c.customer?.email || '';
      if (email) checkoutCustomerEmails.add(email.toLowerCase());
      return {
        id: String(c.id),
        customerEmail: email,
        customerName: c.customer
          ? `${c.customer.first_name || ''} ${c.customer.last_name || ''}`.trim()
          : (c.email || 'Sin nombre'),
        phone: c.shipping_address?.phone || c.billing_address?.phone || c.customer?.phone || null,
        totalValue: parseFloat(c.total_price || '0'),
        itemCount: (c.line_items || []).reduce((sum: number, li: any) => sum + (li.quantity || 0), 0),
        lineItems: (c.line_items || []).map((li: any) => ({
          title: li.title || '',
          quantity: li.quantity || 1,
          price: parseFloat(li.price || '0'),
          variantTitle: li.variant_title || '',
        })),
        abandonedAt: c.created_at,
        contacted: false,
      };
    });

    // --- REAL CONVERSION RATE (checkout → purchase) ---
    // Completed orders / (completed orders + abandoned checkouts) as checkout-to-purchase ratio
    const totalCheckoutAttempts = paidOrderCount + abandonedCarts.length;
    const conversionRate = totalCheckoutAttempts > 0 ? (paidOrderCount / totalCheckoutAttempts) * 100 : 0;

    const customerMetrics = {
      conversionRate: Math.round(conversionRate * 100) / 100,
      averageLtv: Math.round(averageLtv * 100) / 100,
      totalCustomers: uniqueCustomers,
      repeatCustomerRate: Math.round(repeatCustomerRate * 100) / 100,
    };

    // Daily breakdown for charts
    const dailyBreakdown = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, revenue: Math.round(data.revenue), orders: data.orders }));

    // Summary totals
    const summary = {
      totalRevenue: Math.round(totalRevenue),
      totalOrders: totalOrderCount,
      averageOrderValue: totalOrderCount > 0 ? Math.round(totalRevenue / totalOrderCount) : 0,
    };

    console.log(`[fetch-shopify-analytics] Done: ${topSkus.length} SKUs, ${abandonedCarts.length} carts, ${salesByChannel.length} channels, ${utmPerformance.length} UTMs, ${uniqueCustomers} customers, ${cohorts.length} cohorts, revenue=${summary.totalRevenue}`);

    return c.json({ topSkus, abandonedCarts, salesByChannel, utmPerformance, customerMetrics, cohorts, dailyBreakdown, summary });

  } catch (error: any) {
    console.error('[fetch-shopify-analytics] Error:', error);
    return c.json({ error: error.message }, 500);
  }
}
