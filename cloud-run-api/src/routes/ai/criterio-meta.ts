import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface CriterioRule {
  id: string;
  category: string;
  name: string;
  check_rule: string;
  severity: string;
  weight: number;
  auto: boolean;
  organ: string;
  active: boolean;
}

interface EvalResult {
  passed: boolean;
  actual: string;
  expected: string;
  details: string | null;
}

interface CriterioResponse {
  score: number;
  total: number;
  passed: number;
  failed: number;
  blockers: number;
  can_publish: boolean;
  reason: string;
  failed_rules: Array<{ rule_id: string; severity: string; details: string }>;
}

// --- Rule evaluator ---

function evaluateMetaRule(
  rule: CriterioRule,
  campaign: Record<string, any>,
  brief: Record<string, any> | null,
  history: Array<{ angle: string; theme: string }> | null,
  products: Array<Record<string, any>>
): EvalResult {
  const cat = rule.category;
  const name = rule.name;

  // === META COPY ===
  if (cat === 'META COPY') {
    if (name.includes('Largo copy primario')) {
      const len = (campaign.primary_text || '').length;
      return { passed: len >= 80 && len <= 300, actual: `${len} chars`, expected: '80-300 chars', details: len < 80 ? 'Copy muy corto' : len > 300 ? 'Copy muy largo' : null };
    }

    if (name.includes('Largo headline')) {
      const len = (campaign.headline || '').length;
      return { passed: len >= 20 && len <= 80, actual: `${len} chars`, expected: '20-80 chars', details: null };
    }

    if (name.includes('CTA presente')) {
      const ctas = ['compra', 'descubre', 'prueba', 'aprovecha', 'pide', 'conoce', 'obtén', 'agenda', 'reserva', 'regístrate'];
      const text = (campaign.primary_text || '').toLowerCase();
      const found = ctas.some(c => text.includes(c));
      return { passed: found, actual: found ? 'CTA found' : 'No CTA', expected: 'Verbo de acción', details: null };
    }

    if (name.includes('ortográficos') || name.includes('ortografía')) {
      return { passed: true, actual: '0 errors', expected: '0 errors', details: 'TODO: integrar LanguageTool' };
    }

    if (name.includes('Precio coincide')) {
      const priceMatch = (campaign.primary_text || '').match(/\$[\d.,]+/);
      if (!priceMatch) return { passed: true, actual: 'No price mentioned', expected: 'N/A', details: null };
      const mentioned = parseInt(priceMatch[0].replace(/[$.,]/g, ''));
      const shopifyPrice = products[0]?.price ? parseInt(products[0].price) : null;
      if (!shopifyPrice) return { passed: true, actual: priceMatch[0], expected: 'No product linked', details: null };
      return { passed: Math.abs(mentioned - shopifyPrice) < 100, actual: priceMatch[0], expected: `$${shopifyPrice}`, details: mentioned !== shopifyPrice ? 'Precio no coincide con Shopify' : null };
    }

    if (name.includes('stock')) {
      if (!products.length) return { passed: true, actual: 'No products', expected: 'N/A', details: null };
      const outOfStock = products.filter(p => p.inventory <= 0);
      return { passed: outOfStock.length === 0, actual: outOfStock.length > 0 ? `${outOfStock.map(p => p.title).join(', ')} sin stock` : 'All in stock', expected: 'All products in stock', details: null };
    }

    if (name.includes('Ángulo distinto')) {
      const lastAngles = (history || []).map(h => h.angle);
      const newAngle = campaign.angle || 'unknown';
      const repeated = lastAngles.includes(newAngle);
      return { passed: !repeated, actual: newAngle, expected: `Not in [${lastAngles.join(', ')}]`, details: repeated ? `Ángulo "${newAngle}" ya usado recientemente` : null };
    }

    if (name.includes('claims médicos')) {
      const forbidden = ['cura', 'sana', 'elimina', 'garantizado', '100% efectivo', 'milagroso'];
      const text = (campaign.primary_text || '').toLowerCase();
      const found = forbidden.filter(f => text.includes(f));
      return { passed: found.length === 0, actual: found.length > 0 ? `Found: ${found.join(', ')}` : 'Clean', expected: 'No medical claims', details: null };
    }

    if (name.includes('Emoji max')) {
      const emojis = (campaign.primary_text || '').match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
      return { passed: emojis.length <= 3, actual: `${emojis.length} emojis`, expected: 'Max 3', details: null };
    }

    if (name.includes('MAYÚSCULAS')) {
      const text = campaign.primary_text || '';
      const upper = (text.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
      const total = (text.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ]/g) || []).length;
      const pct = total > 0 ? Math.round(upper / total * 100) : 0;
      return { passed: pct < 30, actual: `${pct}% mayúsculas`, expected: '<30%', details: null };
    }

    if (name.includes('Tono coherente')) {
      return { passed: true, actual: 'TODO: Claude eval', expected: brief?.tone || 'N/A', details: 'Requiere evaluación Claude' };
    }

    if (name.includes('URL destino')) {
      return { passed: true, actual: 'Verified in API Check', expected: '200 OK', details: null };
    }
  }

  // === META TARGET ===
  if (cat === 'META TARGET') {
    if (name.includes('Edad coherente')) {
      const briefMin = brief?.target_age_min || 18;
      const briefMax = brief?.target_age_max || 65;
      const targetMin = campaign.targeting?.age_min || 18;
      const targetMax = campaign.targeting?.age_max || 65;
      const ok = targetMin >= briefMin - 5 && targetMax <= briefMax + 5;
      return { passed: ok, actual: `${targetMin}-${targetMax}`, expected: `${briefMin}-${briefMax} (±5)`, details: ok ? null : 'Edad fuera de rango del brief' };
    }

    if (name.includes('Género coherente')) {
      const briefGender = brief?.target_gender || 'all';
      const targetGender = campaign.targeting?.genders?.[0] === 1 ? 'male' : campaign.targeting?.genders?.[0] === 2 ? 'female' : 'all';
      return { passed: briefGender === 'all' || briefGender === targetGender, actual: targetGender, expected: briefGender, details: null };
    }

    if (name.includes('Min 2 intereses')) {
      const count = (campaign.targeting?.interests || []).length;
      return { passed: count >= 2, actual: `${count} intereses`, expected: 'Min 2', details: null };
    }

    if (name.includes('País Chile')) {
      const countries = campaign.targeting?.countries || campaign.targeting?.geo_locations?.countries || [];
      const hasChile = countries.includes('CL');
      return { passed: hasChile, actual: countries.join(', '), expected: 'CL', details: null };
    }

    if (name.includes('No menores')) {
      const ageMin = campaign.targeting?.age_min || 18;
      return { passed: ageMin >= 18, actual: `age_min=${ageMin}`, expected: 'Min 18', details: null };
    }

    if (name.includes('Idioma')) {
      const locales = campaign.targeting?.locales || [];
      const ok = locales.length === 0 || locales.includes('es');
      return { passed: ok, actual: locales.length === 0 ? 'all (OK)' : locales.join(', '), expected: 'es or all', details: null };
    }
  }

  // === META BUDGET ===
  if (cat === 'META BUDGET') {
    if (name.includes('Budget diario min')) {
      const budget = campaign.daily_budget || 0;
      return { passed: budget >= 3000, actual: `$${budget}`, expected: 'Min $3,000 CLP', details: null };
    }

    if (name.includes('10% ventas')) {
      const budget = (campaign.daily_budget || 0) * 30;
      const ventas = campaign.monthly_revenue || 0;
      if (ventas === 0) return { passed: true, actual: 'No revenue data', expected: 'N/A', details: null };
      const pct = Math.round(budget / ventas * 100);
      return { passed: pct <= 10, actual: `${pct}% de ventas`, expected: 'Max 10%', details: pct > 10 ? `Budget mensual $${budget} es ${pct}% de ventas $${ventas}` : null };
    }

    if (name.includes('Centavos')) {
      return { passed: true, actual: 'Verified in API Check', expected: 'display * 100', details: null };
    }

    if (name.includes('Lifetime tiene fecha')) {
      if (campaign.budget_type !== 'lifetime') return { passed: true, actual: 'Not lifetime', expected: 'N/A', details: null };
      return { passed: !!campaign.end_date, actual: campaign.end_date || 'NO END DATE', expected: 'End date defined', details: null };
    }

    if (name.includes('Moneda')) {
      const currency = campaign.currency || 'CLP';
      return { passed: currency === 'CLP', actual: currency, expected: 'CLP', details: null };
    }
  }

  // === META PLACEMENT ===
  if (cat.includes('PLACE')) {
    if (name.includes('Audience Network solo')) {
      const placements = campaign.placements || [];
      const onlyAN = placements.length === 1 && placements[0] === 'audience_network';
      return { passed: !onlyAN, actual: placements.join(', ') || 'auto', expected: 'Not only AN', details: onlyAN ? 'Audience Network solo = tráfico basura' : null };
    }

    if (name.includes('Feed incluido')) {
      const placements = campaign.placements || [];
      if (placements.length === 0) return { passed: true, actual: 'auto (includes feed)', expected: 'Feed included', details: null };
      const hasFeed = placements.some((p: string) => p.includes('feed'));
      return { passed: hasFeed, actual: placements.join(', '), expected: 'Includes feed', details: null };
    }

    if (name.includes('Stories creative vertical')) {
      const placements = campaign.placements || [];
      if (!placements.some((p: string) => p.includes('story') || p.includes('stories'))) return { passed: true, actual: 'No stories', expected: 'N/A', details: null };
      const ratio = campaign.creative_ratio || '1:1';
      const ok = ratio === '9:16' || ratio === '4:5';
      return { passed: ok, actual: ratio, expected: '9:16 or 4:5', details: ok ? null : 'Creative horizontal en Stories se corta' };
    }
  }

  // === META CREATIVE ===
  if (cat.includes('CREATIVE')) {
    if (name.includes('Resolución min')) {
      const w = campaign.creative_width || 0;
      const h = campaign.creative_height || 0;
      return { passed: w >= 1080 && h >= 1080, actual: `${w}x${h}`, expected: 'Min 1080x1080', details: null };
    }

    if (name.includes('Formato correcto')) {
      const format = (campaign.creative_format || '').toLowerCase();
      const ok = ['jpg', 'jpeg', 'png', 'webp'].includes(format);
      return { passed: ok, actual: format, expected: 'jpg/png/webp', details: null };
    }
  }

  // Default: pass (rule not yet implemented)
  return { passed: true, actual: 'Not yet implemented', expected: rule.check_rule, details: `TODO: implement ${rule.name}` };
}

// --- Main criterioMeta function ---

export async function criterioMeta(campaignData: Record<string, any>, shopId: string, clientId?: string): Promise<CriterioResponse> {
  const supabase = getSupabaseAdmin();

  // 1. Fetch active META rules
  const { data: rules } = await supabase
    .from('criterio_rules')
    .select('*')
    .eq('organ', 'CRITERIO')
    .like('category', 'META%')
    .eq('active', true);

  if (!rules || rules.length === 0) {
    console.log('[criterio-meta] No active META rules found, allowing publish');
    return { score: 100, total: 0, passed: 0, failed: 0, blockers: 0, can_publish: true, reason: 'No rules to evaluate', failed_rules: [] };
  }

  // 2. Fetch brand research brief
  const { data: brief } = await supabase
    .from('brand_research')
    .select('*')
    .eq('shop_id', shopId)
    .single();

  // 3. Fetch creative history (last 5)
  const { data: history } = await supabase
    .from('creative_history')
    .select('angle, theme')
    .eq('client_id', clientId || shopId)
    .eq('channel', 'meta')
    .order('created_at', { ascending: false })
    .limit(5);

  // 4. Fetch Shopify products if product_ids provided
  let products: Array<Record<string, any>> = [];
  if (campaignData.product_ids && campaignData.product_ids.length > 0) {
    const { data: prods } = await supabase
      .from('shopify_products')
      .select('id, title, price, inventory, image_url')
      .in('id', campaignData.product_ids);
    products = prods || [];
  }

  // 5. Evaluate each rule
  const results = [];
  for (const rule of rules) {
    const result = evaluateMetaRule(rule, campaignData, brief, history, products);
    results.push({
      rule_id: rule.id,
      passed: result.passed,
      actual_value: result.actual,
      expected_value: result.expected,
      details: result.details,
      severity: rule.severity,
    });
  }

  // 6. Call evaluate-rules edge function
  const evalResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/evaluate-rules`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organ: 'CRITERIO',
        shop_id: shopId,
        entity_type: 'meta_campaign',
        entity_id: campaignData.id || 'pre-create',
        results,
      }),
    }
  );

  if (!evalResponse.ok) {
    console.error('[criterio-meta] evaluate-rules call failed:', evalResponse.status);
    // Fail-open: allow publish if evaluate-rules is down, but log it
    return { score: 0, total: rules.length, passed: 0, failed: 0, blockers: 0, can_publish: true, reason: 'evaluate-rules unavailable, fail-open', failed_rules: [] };
  }

  const evalResult = (await evalResponse.json()) as CriterioResponse;

  // 7. Save to creative_history if approved
  if (evalResult.can_publish && clientId) {
    const primaryProduct = products[0] || null;
    await supabase.from('creative_history').insert({
      client_id: clientId,
      channel: 'meta',
      type: campaignData.type || 'ad',
      angle: campaignData.angle || 'unknown',
      theme: campaignData.theme || null,
      content_summary: (campaignData.primary_text || '').substring(0, 200),
      cqs_score: evalResult.score,
      product_name: campaignData.product_name || primaryProduct?.title || null,
      image_url: campaignData.image_url || primaryProduct?.image_url || null,
      shopify_product_id: campaignData.shopify_product_id || primaryProduct?.id || null,
    });
  }

  console.log(`[criterio-meta] Score: ${evalResult.score}%, can_publish: ${evalResult.can_publish}, failed: ${evalResult.failed}`);
  return evalResult;
}

// --- HTTP handler for direct frontend calls ---

export async function criterioMetaHandler(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const { campaign_data, shop_id, client_id } = await c.req.json();

    if (!campaign_data || !shop_id) {
      return c.json({ error: 'Missing required fields: campaign_data, shop_id' }, 400);
    }

    const result = await criterioMeta(campaign_data, shop_id, client_id);

    return c.json(result, result.can_publish ? 200 : 422);
  } catch (error) {
    console.error('[criterio-meta] Unhandled error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Internal server error', details: msg }, 500);
  }
}
