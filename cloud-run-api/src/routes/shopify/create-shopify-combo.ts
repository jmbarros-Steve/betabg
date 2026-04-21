import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * POST /api/create-shopify-combo
 * Creates a combo/bundle product in Shopify from selected products.
 * Body: {
 *   connectionId: string,
 *   products: Array<{ id: number, title: string, price: number, image?: string }>,
 *   comboTitle?: string,
 *   discountPercent?: number (default 10)
 * }
 */
export async function createShopifyCombo(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { connectionId, products, comboTitle, discountPercent = 10 } = await c.req.json();

    if (!connectionId || !products || products.length < 2) {
      return c.json({ error: 'connectionId and at least 2 products required' }, 400);
    }

    // Validate discount percentage is within bounds
    if (typeof discountPercent !== 'number' || discountPercent < 0 || discountPercent > 100) {
      return c.json({ error: 'discountPercent must be a number between 0 and 100' }, 400);
    }

    // Validate product prices are non-negative numbers
    for (const p of products) {
      if (typeof p.price !== 'number' || p.price < 0) {
        return c.json({ error: `Invalid price for product "${p.title || 'unknown'}": price must be a non-negative number` }, 400);
      }
    }

    // Ownership check
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
    const roleRow = await safeQuerySingleOrDefault<{ is_super_admin: boolean }>(
      supabase
        .from('user_roles')
        .select('is_super_admin')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle(),
      null,
      'createShopifyCombo.getRoleRow',
    );
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { store_url, access_token_encrypted } = connection;
    if (!store_url || !access_token_encrypted) {
      return c.json({ error: 'Missing store credentials' }, 400);
    }

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

    // Calculate combo pricing
    const totalPrice = products.reduce((sum: number, p: any) => sum + (p.price || 0), 0);
    const comboPrice = Math.round(totalPrice * (1 - discountPercent / 100));
    const productNames = products.map((p: any) => p.title).join(' + ');
    const title = comboTitle || `Combo: ${productNames}`;

    // Build description HTML
    const descHtml = `
<h3>Este combo incluye:</h3>
<ul>
${products.map((p: any) => `  <li><strong>${p.title}</strong> — $${Math.round(p.price).toLocaleString('es-CL')}</li>`).join('\n')}
</ul>
<p><strong>Precio normal:</strong> <s>$${Math.round(totalPrice).toLocaleString('es-CL')}</s></p>
<p><strong>Precio combo:</strong> $${comboPrice.toLocaleString('es-CL')} <em>(${discountPercent}% descuento)</em></p>`.trim();

    // Collect images from component products
    const images = products
      .filter((p: any) => p.image)
      .map((p: any) => ({ src: p.image }));

    // Create product in Shopify
    const productPayload = {
      product: {
        title,
        body_html: descHtml,
        product_type: 'Combo',
        status: 'draft', // Create as draft so merchant can review
        tags: 'combo, bundle, steve-combo',
        variants: [{
          price: String(comboPrice),
          compare_at_price: String(Math.round(totalPrice)),
          inventory_management: null, // No inventory tracking for combo
          requires_shipping: true,
        }],
        images: images.length > 0 ? images : undefined,
      },
    };

    const createUrl = `https://${cleanStoreUrl}/admin/api/2026-04/products.json`;
    const res = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(productPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[create-shopify-combo] Shopify error:', res.status, errText);
      return c.json({ error: `Shopify API error: ${res.status}` }, 500);
    }

    const data: any = await res.json();
    const newProduct = data.product;

    console.log(`[create-shopify-combo] Created combo product ${newProduct.id}: "${title}" at $${comboPrice}`);

    return c.json({
      success: true,
      product: {
        id: newProduct.id,
        title: newProduct.title,
        price: comboPrice,
        compareAtPrice: Math.round(totalPrice),
        status: 'draft',
        url: `https://${cleanStoreUrl}/admin/products/${newProduct.id}`,
      },
    });
  } catch (error: any) {
    console.error('[create-shopify-combo] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
