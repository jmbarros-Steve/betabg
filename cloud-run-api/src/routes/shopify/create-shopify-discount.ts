import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface DiscountRequest {
  clientId: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  minimumPurchase?: number;
  usageLimit?: number;
  startsAt?: string;
  endsAt?: string;
  title?: string;
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
      title
    } = await c.req.json() as DiscountRequest;

    if (!clientId || !code || !discountType || !discountValue) {
      return c.json({ error: 'Missing required fields' }, 400);
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

    // Create discount code via Shopify Admin API (GraphQL)
    const mutation = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) {
                  nodes {
                    code
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Build discount value
    const customerGets = discountType === 'percentage'
      ? {
          value: {
            percentage: discountValue / 100
          },
          items: {
            all: true
          }
        }
      : {
          value: {
            discountAmount: {
              amount: discountValue,
              appliesOnEachItem: false
            }
          },
          items: {
            all: true
          }
        };

    // Build minimum requirements
    let minimumRequirement = null;
    if (minimumPurchase && minimumPurchase > 0) {
      minimumRequirement = {
        subtotal: {
          greaterThanOrEqualToSubtotal: minimumPurchase
        }
      };
    }

    const variables = {
      basicCodeDiscount: {
        title: title || `Descuento ${code}`,
        code,
        startsAt: startsAt || new Date().toISOString(),
        endsAt: endsAt || null,
        customerSelection: {
          all: true
        },
        customerGets,
        minimumRequirement,
        usageLimit: usageLimit || null,
        appliesOncePerCustomer: true,
        combinesWith: {
          orderDiscounts: false,
          productDiscounts: false,
          shippingDiscounts: true
        }
      }
    };

    const shopifyResponse = await fetch(
      `https://${shopDomain}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': tokenData,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: mutation, variables }),
      }
    );

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Shopify API error:', errorText);
      throw new Error('Failed to create discount in Shopify');
    }

    const result: any = await shopifyResponse.json();

    if (result.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
      const errors = result.data.discountCodeBasicCreate.userErrors;
      console.error('Shopify discount errors:', errors);
      return c.json({ error: errors[0].message }, 400);
    }

    const discountNode = result.data?.discountCodeBasicCreate?.codeDiscountNode;

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
