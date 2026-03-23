import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Strip HTML tags and decode entities for ML descriptions
function htmlToPlainText(html: string): string {
  if (!html) return '';
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
  text = text.replace(/<li>/gi, '• ');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const {
      connectionId,
      productId,
      variantId,
      categoryId,
      title,
      price,
      condition = 'new',
      listingTypeId = 'gold_special',
      attributes = [],
      shippingMode = 'me2',
      freeShipping = false,
      description: customDescription,
    } = body;

    if (!connectionId || !productId || !categoryId || !title || !price) {
      return new Response(JSON.stringify({ error: 'Missing required fields: connectionId, productId, categoryId, title, price' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get ML connection
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('*, clients!inner(id, user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'mercadolibre')
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'ML connection not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const clientData = connection.clients as { id: string; user_id: string; client_user_id: string | null };

    // Check ownership or super admin
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Decrypt ML token
    const { data: mlToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });
    if (decryptError || !mlToken) {
      return new Response(JSON.stringify({ error: 'Token decryption failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get product + variants from DB
    const { data: product } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .eq('id', productId)
      .single();

    if (!product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const variants = product.product_variants || [];
    const targetVariants = variantId
      ? variants.filter((v: any) => v.id === variantId)
      : variants;

    if (targetVariants.length === 0) {
      return new Response(JSON.stringify({ error: 'No variants found' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build pictures from product images
    const pictures = (product.images || [])
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
      .slice(0, 10)
      .map((img: any) => ({ source: img.src }));

    // Build ML item payload
    const totalStock = targetVariants.reduce((sum: number, v: any) => sum + (v.stock || 0), 0);

    const mlItem: any = {
      title: title.substring(0, 60),
      category_id: categoryId,
      price,
      currency_id: 'CLP',
      available_quantity: totalStock,
      condition,
      buying_mode: 'buy_it_now',
      listing_type_id: listingTypeId,
      pictures,
      attributes: attributes.map((a: any) => ({
        id: a.id,
        value_name: a.valueName || a.value_name,
      })),
      shipping: {
        mode: shippingMode,
        free_shipping: freeShipping,
      },
    };

    // If multiple variants, use ML variations
    if (targetVariants.length > 1) {
      mlItem.variations = targetVariants.map((v: any) => {
        const attrCombinations = Object.entries(v.attributes || {}).map(([key, value]) => ({
          id: key,
          value_name: value as string,
        }));
        return {
          attribute_combinations: attrCombinations,
          available_quantity: v.stock || 0,
          price,
          seller_custom_field: v.sku || undefined,
        };
      });
      delete mlItem.available_quantity;
    }

    console.log('[ml-create-item] Creating item:', JSON.stringify(mlItem).substring(0, 500));

    // POST to ML
    const createRes = await fetch('https://api.mercadolibre.com/items', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mlToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mlItem),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error('[ml-create-item] ML API error:', JSON.stringify(createData));
      const errorMsg = createData.message || createData.error || 'Error creating item';
      const cause = (createData.cause || []).map((c: any) => c.message || c.code).join(', ');
      return new Response(
        JSON.stringify({ error: errorMsg, cause, details: createData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mlItemId = createData.id;
    const permalink = createData.permalink;

    // POST description separately
    const descriptionText = customDescription || htmlToPlainText(product.description || '');
    if (descriptionText) {
      await fetch(`https://api.mercadolibre.com/items/${mlItemId}/description`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mlToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plain_text: descriptionText }),
      });
    }

    // Update product_platform_listings in DB
    for (const variant of targetVariants) {
      await supabase
        .from('product_platform_listings')
        .upsert({
          variant_id: variant.id,
          platform: 'mercadolibre',
          platform_item_id: mlItemId,
          platform_sku: variant.sku || null,
          platform_price: price,
          platform_stock: variant.stock || 0,
          platform_url: permalink || null,
          sync_status: 'synced',
          is_published: true,
          last_synced_at: new Date().toISOString(),
          metadata: body.markupConfig ? { markup_type: body.markupConfig.type, markup_value: body.markupConfig.value } : {},
        }, { onConflict: 'variant_id,platform' });
    }

    // Save category mapping for future use
    if (product.category) {
      await supabase
        .from('ml_category_mappings')
        .upsert({
          client_id: clientData.id,
          product_type: product.category,
          ml_category_id: categoryId,
          ml_category_name: body.categoryName || null,
          default_condition: condition,
          default_listing_type: listingTypeId,
          default_markup_type: body.markupConfig?.type || 'manual',
          default_markup_value: body.markupConfig?.value || price,
        }, { onConflict: 'client_id,product_type' });
    }

    console.log(`[ml-create-item] Success: ${mlItemId} - ${permalink}`);

    return new Response(
      JSON.stringify({ success: true, mlItemId, permalink }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[ml-create-item] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
