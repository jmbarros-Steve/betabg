import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { decryptPlatformToken } from '../../lib/decrypt-token.js';

/**
 * POST /api/fetch-shopify-discounts
 * Returns all discount codes (GraphQL + REST fallback) for a client's Shopify store.
 * Body: { client_id, connection_id? }
 */
export async function fetchShopifyDiscounts(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const { client_id, connection_id } = await c.req.json();

    if (!client_id) return c.json({ error: 'client_id required' }, 400);

    // Find Shopify connection
    let query = supabase
      .from('platform_connections')
      .select('id, store_url, access_token_encrypted')
      .eq('client_id', client_id)
      .eq('platform', 'shopify')
      .eq('is_active', true);

    if (connection_id) query = query.eq('id', connection_id);

    const { data: conn } = await query.limit(1).single();
    if (!conn?.store_url || !conn?.access_token_encrypted) {
      return c.json({ error: 'No active Shopify connection' }, 404);
    }

    const token = await decryptPlatformToken(supabase, conn.access_token_encrypted);
    if (!token) return c.json({ error: 'Token decryption failed' }, 500);

    const storeUrl = conn.store_url.replace(/^https?:\/\//, '');
    const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
    const API_VERSION = '2025-01';

    // Use GraphQL to fetch ALL discount types (basic, free shipping, buy X get Y)
    const graphqlUrl = `https://${storeUrl}/admin/api/${API_VERSION}/graphql.json`;

    const discountQuery = `
      {
        codeDiscountNodes(first: 100, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                status
                startsAt
                endsAt
                usageLimit
                asyncUsageCount
                codes(first: 5) {
                  nodes {
                    code
                    id
                    asyncUsageCount
                  }
                }
                customerGets {
                  value {
                    ... on DiscountPercentage {
                      percentage
                    }
                    ... on DiscountAmount {
                      amount {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
                combinesWith {
                  orderDiscounts
                  productDiscounts
                  shippingDiscounts
                }
              }
              ... on DiscountCodeFreeShipping {
                title
                status
                startsAt
                endsAt
                usageLimit
                asyncUsageCount
                codes(first: 5) {
                  nodes {
                    code
                    id
                    asyncUsageCount
                  }
                }
                combinesWith {
                  orderDiscounts
                  productDiscounts
                  shippingDiscounts
                }
              }
              ... on DiscountCodeBxgy {
                title
                status
                startsAt
                endsAt
                usageLimit
                asyncUsageCount
                codes(first: 5) {
                  nodes {
                    code
                    id
                    asyncUsageCount
                  }
                }
                combinesWith {
                  orderDiscounts
                  productDiscounts
                  shippingDiscounts
                }
              }
            }
          }
        }
      }
    `;

    const gqlRes = await fetch(graphqlUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: discountQuery }),
    });

    if (!gqlRes.ok) {
      const errText = await gqlRes.text();
      console.error('[fetch-shopify-discounts] GraphQL error:', gqlRes.status, errText);
      // Fallback to REST Price Rules API
      return await fetchDiscountsRest(c, storeUrl, headers, API_VERSION);
    }

    const gqlData: any = await gqlRes.json();

    if (gqlData.errors?.length > 0) {
      console.error('[fetch-shopify-discounts] GraphQL errors:', gqlData.errors);
      // Fallback to REST
      return await fetchDiscountsRest(c, storeUrl, headers, API_VERSION);
    }

    const nodes = gqlData?.data?.codeDiscountNodes?.nodes || [];
    const discounts: any[] = [];

    for (const node of nodes) {
      const cd = node.codeDiscount;
      if (!cd?.title) continue;

      // Determine value type and value
      let valueType = 'percentage';
      let value = '0';

      if (cd.customerGets?.value?.percentage !== undefined) {
        valueType = 'percentage';
        value = String(-(cd.customerGets.value.percentage * 100));
      } else if (cd.customerGets?.value?.amount?.amount !== undefined) {
        valueType = 'fixed_amount';
        value = String(-parseFloat(cd.customerGets.value.amount.amount));
      } else if (!cd.customerGets) {
        // Free shipping or BxGy
        valueType = 'free_shipping';
        value = 'Envío gratis';
      }

      const codes = (cd.codes?.nodes || []).map((c: any) => ({
        id: c.id,
        code: c.code,
        usage_count: c.asyncUsageCount || 0,
      }));

      const status = (cd.status || '').toLowerCase();

      discounts.push({
        id: node.id,
        title: cd.title,
        value_type: valueType,
        value,
        usage_limit: cd.usageLimit || null,
        times_used: cd.asyncUsageCount || 0,
        starts_at: cd.startsAt || null,
        ends_at: cd.endsAt || null,
        status: status === 'active' ? 'active' : status === 'expired' ? 'expired' : status === 'scheduled' ? 'scheduled' : status,
        codes,
      });
    }

    console.log(`[fetch-shopify-discounts] GraphQL: ${discounts.length} discounts found`);

    return c.json({
      discounts,
      total: discounts.length,
      active: discounts.filter((d) => d.status === 'active').length,
      expired: discounts.filter((d) => d.status === 'expired').length,
    });
  } catch (err: any) {
    console.error('[fetch-shopify-discounts] Error:', err);
    return c.json({ error: err.message }, 500);
  }
}

/** Fallback: REST Price Rules API (legacy) */
async function fetchDiscountsRest(c: Context, storeUrl: string, headers: Record<string, string>, apiVersion: string) {
  const prRes = await fetch(
    `https://${storeUrl}/admin/api/${apiVersion}/price_rules.json?limit=50`,
    { headers }
  );

  if (!prRes.ok) {
    return c.json({ error: `Shopify API error: ${prRes.status}` }, 502);
  }

  const { price_rules } = await prRes.json() as any;
  const discounts: any[] = [];

  for (const pr of (price_rules || [])) {
    const codesRes = await fetch(
      `https://${storeUrl}/admin/api/${apiVersion}/price_rules/${pr.id}/discount_codes.json?limit=10`,
      { headers }
    );

    let codes: any[] = [];
    if (codesRes.ok) {
      const data = await codesRes.json() as any;
      codes = data.discount_codes || [];
    }

    const now = new Date();
    const endsAt = pr.ends_at ? new Date(pr.ends_at) : null;
    const startsAt = pr.starts_at ? new Date(pr.starts_at) : null;
    const isExpired = endsAt ? endsAt < now : false;
    const isActive = !isExpired && (startsAt ? startsAt <= now : true);

    discounts.push({
      id: pr.id,
      title: pr.title,
      value_type: pr.value_type,
      value: pr.value,
      usage_limit: pr.usage_limit,
      times_used: codes.reduce((s: number, c: any) => s + (c.usage_count || 0), 0),
      starts_at: pr.starts_at,
      ends_at: pr.ends_at,
      status: isExpired ? 'expired' : isActive ? 'active' : 'scheduled',
      codes: codes.map((c: any) => ({
        id: c.id,
        code: c.code,
        usage_count: c.usage_count,
      })),
    });
  }

  console.log(`[fetch-shopify-discounts] REST fallback: ${discounts.length} discounts found`);

  return c.json({
    discounts,
    total: discounts.length,
    active: discounts.filter((d) => d.status === 'active').length,
    expired: discounts.filter((d) => d.status === 'expired').length,
  });
}
