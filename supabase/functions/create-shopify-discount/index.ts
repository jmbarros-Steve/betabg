import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    } = await req.json() as DiscountRequest;

    if (!clientId || !code || !discountType || !discountValue) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Shopify connection for this client
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .eq('is_active', true)
      .maybeSingle();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No Shopify connection found for this client' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    const result = await shopifyResponse.json();
    
    if (result.data?.discountCodeBasicCreate?.userErrors?.length > 0) {
      const errors = result.data.discountCodeBasicCreate.userErrors;
      console.error('Shopify discount errors:', errors);
      return new Response(
        JSON.stringify({ error: errors[0].message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const discountNode = result.data?.discountCodeBasicCreate?.codeDiscountNode;

    return new Response(
      JSON.stringify({
        success: true,
        discountId: discountNode?.id,
        code: discountNode?.codeDiscount?.codes?.nodes?.[0]?.code || code,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Create discount error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
