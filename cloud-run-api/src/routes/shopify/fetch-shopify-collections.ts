import { Context } from 'hono';
import { getSupabaseAdmin, getSupabaseWithUserToken } from '../../lib/supabase.js';

export async function fetchShopifyCollections(c: Context) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseWithUserToken(authHeader.replace('Bearer ', ''));

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError }: any = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { connectionId, collectionId } = await c.req.json();
    if (!connectionId) {
      return c.json({ error: 'connectionId is required' }, 400);
    }

    const serviceSupabase = getSupabaseAdmin();

    // Fetch and decrypt Shopify connection
    const { data: connection, error: connError } = await serviceSupabase
      .from('platform_connections')
      .select('store_url, access_token_encrypted')
      .eq('id', connectionId)
      .eq('platform', 'shopify')
      .single();

    if (connError || !connection?.access_token_encrypted || !connection?.store_url) {
      return c.json({ error: 'Shopify connection not found or missing credentials' }, 404);
    }

    const { data: decryptedToken, error: decryptError } = await serviceSupabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return c.json({ error: 'Failed to decrypt Shopify token' }, 500);
    }

    const shopDomain = connection.store_url.replace(/^https?:\/\//, '');
    const shopifyHeaders = {
      'X-Shopify-Access-Token': decryptedToken,
      'Content-Type': 'application/json',
    };

    // If collectionId provided, fetch products in that collection
    if (collectionId) {
      const productsUrl = `https://${shopDomain}/admin/api/2024-01/collections/${collectionId}/products.json?limit=250&fields=id,title,handle,images,variants`;
      const res = await fetch(productsUrl, { headers: shopifyHeaders });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Shopify collection products error:', res.status, errText);
        return c.json({ error: `Shopify API error: ${res.status}` }, 500);
      }

      const { products }: any = await res.json();
      const mapped = (products || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        image_url: p.images?.[0]?.src || '',
        price: p.variants?.[0]?.price || '',
        url: `https://${shopDomain}/products/${p.handle}`,
      }));

      return c.json({ products: mapped });
    }

    // Otherwise, list all collections (custom + smart)
    const [customRes, smartRes] = await Promise.all([
      fetch(`https://${shopDomain}/admin/api/2024-01/custom_collections.json?limit=250&fields=id,title,handle,image,products_count`, { headers: shopifyHeaders }),
      fetch(`https://${shopDomain}/admin/api/2024-01/smart_collections.json?limit=250&fields=id,title,handle,image,products_count`, { headers: shopifyHeaders }),
    ]);

    const customData: any = customRes.ok ? await customRes.json() : { custom_collections: [] };
    const smartData: any = smartRes.ok ? await smartRes.json() : { smart_collections: [] };

    const collections = [
      ...(customData.custom_collections || []).map((col: any) => ({
        id: col.id, title: col.title, handle: col.handle,
        image: col.image?.src || '', products_count: col.products_count || 0, type: 'custom',
      })),
      ...(smartData.smart_collections || []).map((col: any) => ({
        id: col.id, title: col.title, handle: col.handle,
        image: col.image?.src || '', products_count: col.products_count || 0, type: 'smart',
      })),
    ];

    return c.json({ collections });
  } catch (error: unknown) {
    console.error('Error in fetch-shopify-collections:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
}
