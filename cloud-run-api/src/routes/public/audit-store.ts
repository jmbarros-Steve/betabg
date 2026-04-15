import { Context } from 'hono';
import { loadKnowledge } from '../../lib/knowledge-loader.js';

// In-memory rate limit: 5 requests per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 });
    return true;
  }

  if (entry.count >= 5) return false;

  entry.count++;
  return true;
}

export async function auditStore(c: Context) {
  try {
    // Rate limit by IP
    // WARNING: IP detection via X-Forwarded-For and CF-Connecting-IP headers is spoofable.
    // An attacker can bypass this rate limit by setting arbitrary X-Forwarded-For values.
    // For production hardening, rely on the first IP set by a trusted reverse proxy
    // (e.g., Cloud Run's own X-Forwarded-For entry) or use a WAF/CDN-level rate limiter.
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('cf-connecting-ip')
      || 'unknown';

    if (!checkRateLimit(ip)) {
      return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo en 1 hora.' }, 429);
    }

    const { url } = await c.req.json();
    if (!url || typeof url !== 'string') {
      return c.json({ error: 'Debes enviar una URL válida' }, 400);
    }

    // Clean URL
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const apifyToken = process.env.APIFY_TOKEN;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (!apifyToken || !anthropicApiKey) {
      return c.json({ error: 'Servicio no configurado' }, 500);
    }

    // 1. Scrape with Apify (cheerio crawler, max 3 pages, sync)
    const scrapeResp = await fetch(
      `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: cleanUrl }],
          maxCrawlPages: 3,
          crawlerType: 'cheerio',
          outputFormats: ['markdown'],
        }),
      }
    );

    if (!scrapeResp.ok) {
      console.error('[audit-store] Apify error:', scrapeResp.status, await scrapeResp.text().catch(() => ''));
      return c.json({ error: 'No pudimos acceder a la tienda. Verifica la URL.' }, 422);
    }

    const items = (await scrapeResp.json()) as any[];
    const markdown = items
      .map((item: any) => item.text || item.markdown || '')
      .filter(Boolean)
      .join('\n\n---\n\n')
      .slice(0, 8000);

    if (!markdown || markdown.length < 50) {
      return c.json({ error: 'No pudimos extraer contenido de esa URL. Intenta con otra.' }, 422);
    }

    // 2. Load Steve Brain knowledge
    const { knowledgeBlock } = await loadKnowledge(['shopify', 'seo', 'analisis'], { limit: 10, label: 'BEST PRACTICES APRENDIDAS POR STEVE', audit: { source: 'audit-store' } });

    // 3. Analyze with Claude Haiku
    const prompt = `Eres Steve, experto en marketing para e-commerce. Analiza esta tienda y dame exactamente 3 acciones concretas que haría HOY para mejorar su marketing digital.
${knowledgeBlock}

Cada acción debe ser:
- Específica a esta tienda (no genérica)
- Accionable inmediatamente
- Con impacto estimado

Responde SOLO en JSON válido, sin markdown ni backticks:
{
  "store_name": "nombre detectado de la tienda",
  "actions": [
    { "title": "Acción corta", "detail": "Explicación de 1-2 líneas con datos específicos", "impact": "alto|medio" },
    { "title": "Acción corta", "detail": "Explicación de 1-2 líneas con datos específicos", "impact": "alto|medio" },
    { "title": "Acción corta", "detail": "Explicación de 1-2 líneas con datos específicos", "impact": "alto|medio" }
  ]
}

Contenido de la tienda (${cleanUrl}):
${markdown}`;

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      console.error('[audit-store] Anthropic error:', aiResp.status, await aiResp.text().catch(() => ''));
      return c.json({ error: 'Error al analizar la tienda' }, 500);
    }

    const aiData: any = await aiResp.json();
    const aiText = aiData.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[audit-store] Could not parse AI response:', aiText.slice(0, 500));
      return c.json({ error: 'Error al procesar el análisis' }, 500);
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!result.actions || !Array.isArray(result.actions) || result.actions.length < 1) {
      return c.json({ error: 'Análisis incompleto, intenta de nuevo' }, 500);
    }

    return c.json({
      store_name: result.store_name || cleanUrl,
      actions: result.actions.slice(0, 3),
    });
  } catch (err: any) {
    console.error('[audit-store]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
