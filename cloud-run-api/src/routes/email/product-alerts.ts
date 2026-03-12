import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendSingleEmail } from './send-email.js';

/**
 * Product alert management for Steve Mail.
 * Handles back-in-stock and price-drop notifications.
 * POST /api/email-product-alerts
 */
export async function productAlerts(c: Context) {
  const body = await c.req.json();
  const { action } = body;

  const supabase = getSupabaseAdmin();

  switch (action) {
    // ------------------------------------------------------------------
    // SUBSCRIBE — Public endpoint, no auth required
    // ------------------------------------------------------------------
    case 'subscribe': {
      const {
        client_id,
        email,
        product_id,
        variant_id,
        product_title,
        product_image,
        alert_type,
        original_price,
      } = body;

      if (!client_id || !email || !product_id || !alert_type) {
        return c.json(
          { error: 'Missing required fields: client_id, email, product_id, alert_type' },
          400,
        );
      }

      if (!['back_in_stock', 'price_drop'].includes(alert_type)) {
        return c.json({ error: 'alert_type must be back_in_stock or price_drop' }, 400);
      }

      // Upsert subscriber
      const { data: subscriber, error: subErr } = await supabase
        .from('email_subscribers')
        .upsert(
          {
            client_id,
            email: email.toLowerCase().trim(),
            source: 'product_alert',
            status: 'subscribed',
          },
          { onConflict: 'client_id,email' },
        )
        .select('id')
        .single();

      if (subErr) {
        console.error('Failed to upsert subscriber:', subErr);
        return c.json({ error: 'Failed to register subscriber' }, 500);
      }

      // Check for existing active alert for same product + email + type
      const { data: existing } = await supabase
        .from('product_alerts')
        .select('id')
        .eq('client_id', client_id)
        .eq('subscriber_id', subscriber.id)
        .eq('product_id', product_id)
        .eq('alert_type', alert_type)
        .eq('status', 'active')
        .maybeSingle();

      if (existing) {
        return c.json({ success: true, alert_id: existing.id, message: 'Alert already active' });
      }

      // Insert product alert
      const { data: alert, error: alertErr } = await supabase
        .from('product_alerts')
        .insert({
          client_id,
          subscriber_id: subscriber.id,
          email: email.toLowerCase().trim(),
          product_id,
          variant_id: variant_id || null,
          product_title: product_title || null,
          product_image: product_image || null,
          alert_type,
          original_price: original_price != null ? original_price : null,
          status: 'active',
        })
        .select('id')
        .single();

      if (alertErr) {
        console.error('Failed to create product alert:', alertErr);
        return c.json({ error: 'Failed to create alert' }, 500);
      }

      return c.json({ success: true, alert_id: alert.id });
    }

    // ------------------------------------------------------------------
    // LIST — Returns product alerts for a client with pagination
    // ------------------------------------------------------------------
    case 'list': {
      const { client_id, limit = 50, offset = 0, status, alert_type, product_id } = body;

      if (!client_id) {
        return c.json({ error: 'client_id is required' }, 400);
      }

      let query = supabase
        .from('product_alerts')
        .select('*', { count: 'exact' })
        .eq('client_id', client_id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);
      if (alert_type) query = query.eq('alert_type', alert_type);
      if (product_id) query = query.eq('product_id', product_id);

      const { data, error, count } = await query;

      if (error) {
        return c.json({ error: error.message }, 500);
      }

      return c.json({ alerts: data, total: count });
    }

    // ------------------------------------------------------------------
    // GET_STATS — Aggregate counts grouped by alert_type and status
    // ------------------------------------------------------------------
    case 'get_stats': {
      const { client_id } = body;

      if (!client_id) {
        return c.json({ error: 'client_id is required' }, 400);
      }

      // Fetch all alerts for the client and compute stats in-memory
      const { data: alerts, error } = await supabase
        .from('product_alerts')
        .select('alert_type, status')
        .eq('client_id', client_id);

      if (error) {
        return c.json({ error: error.message }, 500);
      }

      const stats: Record<string, Record<string, number>> = {};
      let total = 0;

      for (const alert of alerts || []) {
        const type = alert.alert_type || 'unknown';
        const st = alert.status || 'unknown';

        if (!stats[type]) stats[type] = {};
        stats[type][st] = (stats[type][st] || 0) + 1;
        total++;
      }

      // Also compute flat status counts
      const byStatus: Record<string, number> = {};
      for (const alert of alerts || []) {
        const st = alert.status || 'unknown';
        byStatus[st] = (byStatus[st] || 0) + 1;
      }

      return c.json({ stats, by_status: byStatus, total });
    }

    // ------------------------------------------------------------------
    // DELETE — Remove a specific alert
    // ------------------------------------------------------------------
    case 'delete': {
      const { client_id, alert_id } = body;

      if (!client_id || !alert_id) {
        return c.json({ error: 'client_id and alert_id are required' }, 400);
      }

      const { error } = await supabase
        .from('product_alerts')
        .delete()
        .eq('id', alert_id)
        .eq('client_id', client_id);

      if (error) {
        return c.json({ error: error.message }, 500);
      }

      return c.json({ success: true });
    }

    // ------------------------------------------------------------------
    // TRIGGER_CHECK — Manually trigger alerts for a specific product
    // ------------------------------------------------------------------
    case 'trigger_check': {
      const { client_id, product_id } = body;

      if (!client_id || !product_id) {
        return c.json({ error: 'client_id and product_id are required' }, 400);
      }

      // Find all active alerts for this product
      const { data: activeAlerts, error: fetchErr } = await supabase
        .from('product_alerts')
        .select('*')
        .eq('client_id', client_id)
        .eq('product_id', product_id)
        .eq('status', 'active');

      if (fetchErr) {
        return c.json({ error: fetchErr.message }, 500);
      }

      if (!activeAlerts || activeAlerts.length === 0) {
        return c.json({ success: true, triggered: 0, message: 'No active alerts for this product' });
      }

      // Get client's email settings for from address
      const { data: clientData } = await supabase
        .from('clients')
        .select('company_name')
        .eq('id', client_id)
        .single();

      const { data: domainData } = await supabase
        .from('email_domains')
        .select('domain, from_name')
        .eq('client_id', client_id)
        .eq('status', 'verified')
        .limit(1)
        .maybeSingle();

      const fromDomain = domainData?.domain || process.env.DEFAULT_FROM_DOMAIN || 'steve.cl';
      const fromName = domainData?.from_name || clientData?.company_name || 'Store';
      const fromEmail = `noreply@${fromDomain}`;

      const results: Array<{ alert_id: string; email: string; success: boolean; error?: string }> = [];

      for (const alert of activeAlerts) {
        const alertTypeName = alert.alert_type === 'back_in_stock' ? 'Back in Stock' : 'Price Drop';
        const productTitle = alert.product_title || 'Product';
        const subject = `${alertTypeName}: ${productTitle} is now available!`;

        const imageBlock = alert.product_image
          ? `<div style="text-align:center;margin:20px 0;"><img src="${alert.product_image}" alt="${productTitle}" style="max-width:300px;border-radius:8px;" /></div>`
          : '';

        const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f4;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:40px 30px;">
    <h1 style="color:#333;font-size:24px;margin:0 0 20px;">${alertTypeName}!</h1>
    <p style="color:#555;font-size:16px;line-height:1.6;">
      Great news! <strong>${productTitle}</strong> is now available.
    </p>
    ${imageBlock}
    <p style="color:#555;font-size:16px;line-height:1.6;">
      Don't miss out — grab yours before it's gone again.
    </p>
    <div style="text-align:center;margin:30px 0;">
      <a href="#" style="background-color:#333;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-size:16px;display:inline-block;">Shop Now</a>
    </div>
  </div>
</body>
</html>`;

        try {
          const sendResult = await sendSingleEmail({
            to: alert.email,
            subject,
            htmlContent,
            fromEmail,
            fromName,
            subscriberId: alert.subscriber_id,
            clientId: client_id,
          });

          if (sendResult.success) {
            // Mark alert as triggered
            await supabase
              .from('product_alerts')
              .update({ status: 'triggered', triggered_at: new Date().toISOString() })
              .eq('id', alert.id);
          }

          results.push({
            alert_id: alert.id,
            email: alert.email,
            success: sendResult.success,
            error: sendResult.error,
          });
        } catch (err: any) {
          console.error(`Failed to send alert ${alert.id}:`, err);
          results.push({
            alert_id: alert.id,
            email: alert.email,
            success: false,
            error: err.message,
          });
        }
      }

      const triggered = results.filter((r) => r.success).length;

      return c.json({ success: true, triggered, total: activeAlerts.length, results });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
