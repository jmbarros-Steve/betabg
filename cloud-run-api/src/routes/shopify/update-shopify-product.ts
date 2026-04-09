import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Update Shopify Product — Task #101
 * POST /api/update-shopify-product
 * Body: { connectionId, productId, title?, price?, inventory_quantity?, variant_id?, inventory_item_id? }
 *
 * Updates product title/price via Products API, stock via Inventory Levels API.
 */
export async function updateShopifyProduct(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Auth
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { connectionId, productId, title, price, inventory_quantity, variant_id, inventory_item_id, body_html, images } = body;

    if (!connectionId || !productId) {
      return c.json({ error: 'connectionId and productId required' }, 400);
    }

    // Get connection with ownership check
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'shopify')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };

    // Super admin check
    const roleRow = await safeQuerySingleOrDefault<{ is_super_admin: boolean }>(
      supabase
        .from('user_roles')
        .select('is_super_admin')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle(),
      null,
      'updateShopifyProduct.getRoleRow',
    );
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { store_url, access_token_encrypted } = connection;
    if (!store_url || !access_token_encrypted) {
      return c.json({ error: 'Missing store credentials' }, 400);
    }

    // Decrypt token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return c.json({ error: 'Token decryption failed' }, 500);
    }

    const cleanStoreUrl = store_url.replace(/^https?:\/\//, '');
    const headers = {
      'X-Shopify-Access-Token': decryptedToken,
      'Content-Type': 'application/json',
    };

    const updates: string[] = [];

    // === Update product title, variant price, body_html, images ===
    if (title !== undefined || price !== undefined || body_html !== undefined || images !== undefined) {
      const productPayload: any = { product: { id: productId } };

      if (title !== undefined) {
        productPayload.product.title = title;
      }

      if (body_html !== undefined) {
        productPayload.product.body_html = body_html;
      }

      if (images !== undefined && Array.isArray(images)) {
        productPayload.product.images = images;
      }

      if (price !== undefined) {
        const numPrice = Number(price);
        if (isNaN(numPrice) || numPrice < 0) return c.json({ error: 'price must be a non-negative number' }, 400);
      }

      // Price is on the variant, not the product
      if (price !== undefined && variant_id) {
        productPayload.product.variants = [{ id: variant_id, price: String(price) }];
      }

      const productUrl = `https://${cleanStoreUrl}/admin/api/2024-01/products/${productId}.json`;
      const productRes = await fetch(productUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(productPayload),
      });

      if (!productRes.ok) {
        const errorText = await productRes.text();
        console.error('[update-shopify-product] Product update failed:', productRes.status, errorText);
        return c.json({ error: `Failed to update product: ${productRes.status}` }, 500);
      }

      if (title !== undefined) updates.push('título');
      if (price !== undefined) updates.push('precio');
      if (body_html !== undefined) updates.push('descripción');
      if (images !== undefined) updates.push('imágenes');
    }

    // === Update inventory quantity ===
    if (inventory_quantity !== undefined && inventory_item_id) {
      // First, get available locations
      const locationsUrl = `https://${cleanStoreUrl}/admin/api/2024-01/locations.json`;
      const locationsRes = await fetch(locationsUrl, { headers });

      if (!locationsRes.ok) {
        return c.json({ error: 'Failed to fetch locations' }, 500);
      }

      const { locations } = await locationsRes.json() as { locations: any[] };
      const primaryLocation = locations?.[0];

      if (!primaryLocation) {
        return c.json({ error: 'No locations found' }, 500);
      }

      const inventoryUrl = `https://${cleanStoreUrl}/admin/api/2024-01/inventory_levels/set.json`;
      const inventoryRes = await fetch(inventoryUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          location_id: primaryLocation.id,
          inventory_item_id,
          available: inventory_quantity,
        }),
      });

      if (!inventoryRes.ok) {
        const errorText = await inventoryRes.text();
        console.error('[update-shopify-product] Inventory update failed:', inventoryRes.status, errorText);
        return c.json({ error: `Failed to update inventory: ${inventoryRes.status}` }, 500);
      }

      updates.push('stock');
    }

    console.log(`[update-shopify-product] Updated product ${productId}: ${updates.join(', ')}`);
    return c.json({ success: true, updated: updates });
  } catch (error: any) {
    console.error('[update-shopify-product] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
