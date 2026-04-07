import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { safeQuery } from '../../lib/safe-supabase.js';

/**
 * Merchant Upsell — Steve Post-Venta
 *
 * Runs weekly (Sunday 11am UTC). Analyzes merchant metrics and identifies
 * upsell opportunities:
 * - Revenue growing → suggest plan upgrade
 * - No Klaviyo → suggest email marketing
 * - Low credits → suggest top-up
 * - No Meta → suggest ads
 *
 * Cron: 0 11 * * 0 (Sunday 11am UTC)
 * Auth: X-Cron-Secret header
 */
export async function merchantUpsell(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const results = { opportunities_found: 0, wa_sent: 0, errors: 0 };

  try {
    // Load active clients with their connections
    const clients = await safeQuery<{ id: string; name: string | null; email: string | null; whatsapp_phone: string | null; plan: string | null }>(
      supabase
        .from('clients')
        .select('id, name, email, whatsapp_phone, plan')
        .not('whatsapp_phone', 'is', null)
        .order('created_at', { ascending: true })
        .limit(50),
      'merchantUpsell.fetchClients',
    );

    if (clients.length === 0) {
      return c.json({ success: true, message: 'No clients', ...results });
    }

    for (const client of clients) {
      try {
        if (!client.whatsapp_phone) continue;
        const phone = client.whatsapp_phone.replace(/^\+/, '');

        // Check existing connections
        const connections = await safeQuery<{ id?: string; platform: string; is_active: boolean }>(
          supabase
            .from('platform_connections')
            .select('platform, is_active')
            .eq('client_id', client.id),
          'merchantUpsell.fetchConnections',
        );

        const activePlatforms = connections.filter((c: any) => c.is_active).map((c: any) => c.platform);
        const hasKlaviyo = activePlatforms.includes('klaviyo');
        const hasMeta = activePlatforms.includes('meta');
        const hasShopify = activePlatforms.includes('shopify');

        // Check recent metrics (revenue growth)
        const metrics = await safeQuery<{ metric_type: string; metric_value: number | string }>(
          supabase
            .from('platform_metrics')
            .select('metric_type, metric_value')
            .in('connection_id', connections.map((c: any) => c.id).filter(Boolean))
            .eq('metric_type', 'revenue')
            .gte('metric_date', thirtyDaysAgo),
          'merchantUpsell.fetchMetrics',
        );

        const totalRevenue = metrics.reduce((sum: number, m: any) => sum + (Number(m.metric_value) || 0), 0);

        // Determine upsell opportunity
        let opportunity: { type: string; reason: string; metric_data: any } | null = null;

        if (!hasKlaviyo && hasShopify) {
          opportunity = {
            type: 'add_klaviyo',
            reason: 'No tiene Klaviyo conectado — email marketing puede generar 20-30% revenue extra',
            metric_data: { missing_platform: 'klaviyo', has_shopify: true },
          };
        } else if (!hasMeta && hasShopify) {
          opportunity = {
            type: 'add_meta',
            reason: 'No tiene Meta Ads conectado — podría escalar con campañas automatizadas',
            metric_data: { missing_platform: 'meta', has_shopify: true },
          };
        } else if (totalRevenue > 5000000 && (client.plan === 'visual' || client.plan === 'starter')) {
          opportunity = {
            type: 'upgrade_plan',
            reason: `Revenue de $${Math.round(totalRevenue).toLocaleString()} en 30d — plan actual (${client.plan}) limita crecimiento`,
            metric_data: { revenue_30d: totalRevenue, current_plan: client.plan },
          };
        }

        if (!opportunity) continue;

        // Check if we already suggested this type recently (avoid spam)
        const recentUpsell = await safeQuery<{ id: string }>(
          supabase
            .from('merchant_upsell_opportunities')
            .select('id')
            .eq('client_id', client.id)
            .eq('type', opportunity.type)
            .gte('created_at', new Date(now.getTime() - 30 * 86400000).toISOString())
            .limit(1),
          'merchantUpsell.fetchRecentUpsell',
        );

        if (recentUpsell.length > 0) continue;

        // Insert opportunity
        await supabase.from('merchant_upsell_opportunities').insert({
          client_id: client.id,
          type: opportunity.type,
          reason: opportunity.reason,
          metric_data: opportunity.metric_data,
          outcome: 'pending',
        });

        results.opportunities_found++;

        // Generate and send WA message
        const clientName = client.name || client.email?.split('@')[0] || '';
        const prompt = `Genera un mensaje de WhatsApp corto (max 4 líneas) para "${clientName}", un cliente existente de Steve. Oportunidad detectada: ${opportunity.reason}. Tono: consultivo, profesional, en español neutro (usar tú). NO vendas agresivamente, sugiere con datos. Responde SOLO con el mensaje.`;

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!aiRes.ok) {
          results.errors++;
          continue;
        }

        const aiData: any = await aiRes.json();
        let msg = (aiData.content?.[0]?.text || '').trim();
        if (!msg) continue;
        if (msg.length > 400) msg = msg.slice(0, 397) + '...';

        await sendWhatsApp(`+${phone}`, msg);

        // Mark as sent
        await supabase
          .from('merchant_upsell_opportunities')
          .update({ wa_sent: true, wa_sent_at: now.toISOString() })
          .eq('client_id', client.id)
          .eq('type', opportunity.type)
          .eq('outcome', 'pending');

        // Save message
        await supabase.from('wa_messages').insert({
          client_id: client.id,
          channel: 'steve_chat',
          direction: 'outbound',
          from_number: process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '',
          to_number: phone,
          body: msg,
          contact_name: clientName,
          contact_phone: phone,
        });

        results.wa_sent++;
        console.log(`[merchant-upsell] ${opportunity.type} sent to ${phone}`);

      } catch (err) {
        console.error(`[merchant-upsell] Error for client ${client.id}:`, err);
        results.errors++;
      }
    }

    console.log('[merchant-upsell] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });

  } catch (err: any) {
    console.error('[merchant-upsell] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
