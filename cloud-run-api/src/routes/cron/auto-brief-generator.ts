import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

export async function autoBriefGenerator(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  let briefsGenerated = 0;

  try {
    // Find Shopify connections
    const connections = await safeQuery<{
      id: string;
      client_id: string;
      credentials: any;
      clients: any;
    }>(
      supabase
        .from('platform_connections')
        .select('id, client_id, credentials, clients!inner(id, name)')
        .eq('platform', 'shopify')
        .eq('status', 'active'),
      'autoBriefGenerator.fetchShopifyConnections',
    );

    if (connections.length === 0) {
      return c.json({ success: true, briefsGenerated: 0, message: 'No Shopify connections' });
    }

    for (const conn of connections) {
      try {
        // Check if client already has a brief
        const existingBrief = await safeQuery<{ id: string }>(
          supabase
            .from('steve_knowledge')
            .select('id')
            .eq('client_id', conn.client_id)
            .eq('categoria', 'brief')
            .eq('activo', true)
            .is('purged_at', null)
            .limit(1),
          'autoBriefGenerator.checkExistingBrief',
        );

        if (existingBrief.length > 0) continue;

        // Get Shopify credentials
        const creds = typeof conn.credentials === 'string' ? JSON.parse(conn.credentials) : conn.credentials;
        const shopDomain = creds?.shop_domain || creds?.shop;
        const accessToken = creds?.access_token;

        if (!shopDomain || !accessToken) continue;

        // Query Shopify for products
        const shopifyRes = await fetch(`https://${shopDomain}/admin/api/2024-01/products.json?limit=20&status=active`, {
          headers: { 'X-Shopify-Access-Token': accessToken },
        });

        if (!shopifyRes.ok) continue;

        const shopifyData: any = await shopifyRes.json();
        const products = shopifyData.products || [];

        if (products.length === 0) continue;

        // Extract key data
        const prices = products.flatMap((p: any) =>
          (p.variants || []).map((v: any) => parseFloat(v.price)).filter((n: number) => n > 0)
        );
        const avgPrice = prices.length > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : 0;
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
        const categories = [...new Set(products.map((p: any) => p.product_type).filter(Boolean))];
        const productNames = products.slice(0, 10).map((p: any) => p.title);

        const clientName = (conn.clients as any)?.name || 'Cliente';

        // Generate brief with Haiku
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            messages: [{
              role: 'user',
              content: `Genera un brief de marca para "${clientName}" basado en su catálogo Shopify.

Datos del catálogo:
- ${products.length} productos activos
- Categorías: ${categories.join(', ') || 'No especificadas'}
- Rango de precios: $${minPrice.toFixed(0)} - $${maxPrice.toFixed(0)}
- Precio promedio: $${avgPrice.toFixed(0)}
- Productos destacados: ${productNames.join(', ')}

Genera un brief conciso en formato:
MARCA: [nombre y tipo de negocio]
PRODUCTOS: [qué venden, ticket promedio]
AUDIENCIA PROBABLE: [quién compra esto]
TONO SUGERIDO: [cómo debería comunicar]
DIFERENCIADORES: [qué los hace únicos basado en catálogo]

Máximo 500 caracteres. Solo el brief, sin explicaciones.`,
            }],
          }),
        });

        if (!aiRes.ok) continue;

        const aiData: any = await aiRes.json();
        const briefText = (aiData.content?.[0]?.text || '').trim();
        if (!briefText || briefText.length < 50) continue;

        // Save as client-specific knowledge
        await supabase.from('steve_knowledge').insert({
          categoria: 'brief',
          titulo: `Brief automático - ${clientName}`.slice(0, 80),
          contenido: briefText,
          client_id: conn.client_id,
          activo: true,
          orden: 95,
          industria: 'general',
        });

        briefsGenerated++;
        console.log(`[auto-brief] Generated brief for ${clientName}`);
      } catch (err) {
        console.error(`[auto-brief] Error for connection ${conn.id}:`, err);
      }
    }

    return c.json({ success: true, briefsGenerated });
  } catch (err: any) {
    console.error('[auto-brief] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
