import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';

/**
 * Generate SEO-optimized product description using Gemini
 * POST /api/generate-product-description
 * Body: { connectionId, productId, title, body_html?, brand_brief? }
 */
export async function generateProductDescription(c: Context) {
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

    const { connectionId, productId, title, body_html, brand_brief } = await c.req.json();

    if (!connectionId || !productId || !title) {
      return c.json({ error: 'connectionId, productId, and title required' }, 400);
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
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Clean existing description
    const cleanHtml = (body_html || '').replace(/<[^>]*>/g, '').trim();

    // Load product/SEO knowledge
    const { knowledgeBlock } = await loadKnowledge(
      ['shopify', 'seo', 'ecommerce', 'productos'],
      { clientId: connection.client_id, limit: 8 }
    );

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return c.json({ error: 'GEMINI_API_KEY not configured' }, 500);
    }

    const prompt = `Eres un experto en copywriting para e-commerce en español de Chile. Genera una descripción de producto optimizada para SEO.

PRODUCTO: ${title}
${cleanHtml ? `DESCRIPCIÓN ACTUAL: ${cleanHtml}` : ''}
${brand_brief ? `BRIEF DE MARCA: ${brand_brief}` : ''}

${knowledgeBlock}
REGLAS:
1. Escribe en español de Chile (no uses vosotros)
2. Mínimo 200 caracteres, máximo 800
3. Incluye beneficios, materiales, medidas si aplica
4. Usa palabras clave naturales para SEO
5. Estructura con párrafos cortos
6. Tono profesional pero cercano
7. NO uses markdown. Usa HTML simple: <p>, <strong>, <ul>, <li>
8. NO inventes datos que no estén en la descripción original

Responde SOLO con el HTML de la descripción, sin explicaciones.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[generate-product-description] Gemini error:', geminiRes.status, errText);
      return c.json({ error: 'Gemini API error' }, 500);
    }

    const geminiData: any = await geminiRes.json();
    const generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!generatedText) {
      return c.json({ error: 'No description generated' }, 500);
    }

    console.log(`[generate-product-description] Generated description for product ${productId}: ${generatedText.length} chars`);

    return c.json({
      productId,
      title,
      original_html: body_html || '',
      generated_html: generatedText.trim(),
    });
  } catch (error: any) {
    console.error('[generate-product-description] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
