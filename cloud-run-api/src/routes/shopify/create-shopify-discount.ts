import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface DiscountRequest {
  clientId: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping';
  discountValue: number;
  minimumPurchase?: number;
  usageLimit?: number;
  startsAt?: string;
  endsAt?: string;
  title?: string;
  currencyCode?: string;
}

export async function createShopifyDiscount(c: Context) {
  try {
    const {
      clientId,
      code,
      discountType,
      discountValue,
      minimumPurchase,
      usageLimit,
      startsAt,
      endsAt,
      title,
      currencyCode = 'CLP',
    } = await c.req.json() as DiscountRequest;

    if (!clientId || !code || !discountType) {
      return c.json({ error: 'Missing required fields: clientId, code, discountType' }, 400);
    }
    if (discountType !== 'free_shipping' && (!discountValue || discountValue <= 0)) {
      return c.json({ error: 'discountValue required for percentage/fixed_amount' }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Get Shopify connection for this client
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .eq('is_active', true)
      .maybeSingle();

    if (connError || !connection) {
      return c.json({ error: 'No Shopify connection found for this client' }, 404);
    }

    // Decrypt access token
    const { data: tokenData, error: tokenError } = await supabase.rpc(
      'decrypt_platform_token',
      { encrypted_token: connection.access_token_encrypted }
    );

    if (tokenError || !tokenData) {
      throw new Error('Failed to decrypt access token');
    }

    const shopDomain = connection.store_url || `${connection.store_name}.myshopify.com`;

    // Free shipping uses a different Shopify mutation
    if (discountType === 'free_shipping') {
      const freeShippingMutation = `
        mutation discountCodeFreeShippingCreate($freeShippingCodeDiscount: DiscountCodeFreeShippingInput!) {
          discountCodeFreeShippingCreate(freeShippingCodeDiscount: $freeShippingCodeDiscount) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeFreeShipping {
                  title
                  codes(first: 1) {
                    nodes { code }
                  }
                }
              }
            }
            userErrors { field message }
          }
        }
      `;

      const freeShippingVars = {
        freeShippingCodeDiscount: {
          title: title || `Envio gratis - ${code}`,
          code,
          startsAt: startsAt || new Date().toISOString(),
          endsAt: endsAt || null,
          customerSelection: { all: true },
          destination: { all: true },
          usageLimit: usageLimit || null,
          appliesOncePerCustomer: true,
          combinesWith: {
            orderDiscounts: true,
            productDiscounts: true,
            shippingDiscounts: false,
          },
        },
      };

      console.log(`[create-shopify-discount] Creating free_shipping discount "${code}" for ${shopDomain}`);

      const res = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': tokenData, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: freeShippingMutation, variables: freeShippingVars }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[create-shopify-discount] Shopify free shipping API error:', res.status, errorText);
        throw new Error(`Shopify API error ${res.status}: ${errorText.substring(0, 200)}`);
      }

      const result: any = await res.json();

      if (result.errors) {
        console.error('[create-shopify-discount] GraphQL errors:', JSON.stringify(result.errors));
        return c.json({ error: result.errors[0]?.message || 'GraphQL error', details: result.errors }, 400);
      }

      if (result.data?.discountCodeFreeShippingCreate?.userErrors?.length > 0) {
        const errors = result.data.discountCodeFreeShippingCreate.userErrors;
        console.error('[create-shopify-discount] Free shipping user errors:', JSON.stringify(errors));
        return c.json({ error: errors[0].message, details: errors }, 400);
      }

      const node = result.data?.discountCodeFreeShippingCreate?.codeDiscountNode;
      console.log(`[create-shopify-discount] Created free shipping discount: ${node?.id}`);

      return c.json({
        success: true,
        discountId: node?.id,
        code: node?.codeDiscount?.codes?.nodes?.[0]?.code || code,
      }, 200);
    }

    // Percentage / Fixed amount discount
    const mutation = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) {
                  nodes { code }
                }
              }
            }
          }
          userErrors { field message }
        }
      }
    `;

    const customerGets = discountType === 'percentage'
      ? { value: { percentage: discountValue / 100 }, items: { all: true } }
      : { value: { discountAmount: { amount: String(discountValue), currencyCode } }, items: { all: true } };

    let minimumRequirement = null;
    if (minimumPurchase && minimumPurchase > 0) {
      minimumRequirement = { subtotal: { greaterThanOrEqualToSubtotal: String(minimumPurchase) } };
    }

    const variables = {
      basicCodeDiscount: {
        title: title || `Descuento ${code}`,
        code,
        startsAt: startsAt || new Date().toISOString(),
        endsAt: endsAt || null,
        customerSelection: { all: true },
        customerGets,
        minimumRequirement,
        usageLimit: usageLimit || null,
        appliesOncePerCustomer: true,
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
      },
    };

    console.log(`[create-shopify-discount] Creating ${discountType} discount "${code}" for ${shopDomain}`);

    const shopifyResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': tokenData, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('[create-shopify-discount] Shopify API error:', shopifyResponse.status, errorText);
      throw new Error(`Shopify API error ${shopifyResponse.status}: ${errorText.substring(0, 200)}`);
    }

    const result: any = await shopifyResponse.json();

    if (result.errors) {
      console.error('[create-shopify-discount] GraphQL errors:', JSON.stringify(result.errors));
      return c.json({ error: result.errors[0]?.message || 'GraphQL error', details: result.errors }, 400);
    }

    if (result.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
      const errors = result.data.discountCodeBasicCreate.userErrors;
      console.error('[create-shopify-discount] User errors:', JSON.stringify(errors));
      return c.json({ error: errors[0].message, details: errors }, 400);
    }

    const discountNode = result.data?.discountCodeBasicCreate?.codeDiscountNode;
    console.log(`[create-shopify-discount] Created discount: ${discountNode?.id}`);

    return c.json({
      success: true,
      discountId: discountNode?.id,
      code: discountNode?.codeDiscount?.codes?.nodes?.[0]?.code || code,
    }, 200);
  } catch (error: unknown) {
    console.error('Create discount error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
}
