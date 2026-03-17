import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Handle Shopify webhooks for email flow triggers.
 * POST /api/email-flow-webhooks
 *
 * Receives: checkouts/create, customers/create, orders/create
 * Verifies HMAC, identifies subscriber, enrolls in matching flows.
 */
export async function emailFlowWebhooks(c: Context) {
  // Verify Shopify HMAC
  const hmacHeader = c.req.header('x-shopify-hmac-sha256');
  const shopDomain = c.req.header('x-shopify-shop-domain');
  const topic = c.req.header('x-shopify-topic');

  if (!hmacHeader || !topic) {
    return c.json({ error: 'Missing required Shopify headers' }, 401);
  }

  const rawBody = await c.req.text();

  // Verify HMAC with shared Shopify secret
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error('SHOPIFY_WEBHOOK_SECRET and SHOPIFY_CLIENT_SECRET are not set — rejecting webhook');
    return c.json({ error: 'Webhook secret not configured' }, 500);
  }
  const hash = createHmac('sha256', secret).update(rawBody).digest('base64');
  const hashBuffer = Buffer.from(hash);
  const hmacBuffer = Buffer.from(hmacHeader);
  if (hashBuffer.length !== hmacBuffer.length || !timingSafeEqual(hashBuffer, hmacBuffer)) {
    return c.json({ error: 'Invalid HMAC' }, 401);
  }

  const payload = JSON.parse(rawBody);
  const supabase = getSupabaseAdmin();

  // Find client by shop domain
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('client_id')
    .eq('platform', 'shopify')
    .eq('is_active', true)
    .or(`connection_data->>shop_domain.eq.${shopDomain},connection_data->>shop.eq.${shopDomain}`)
    .single();

  if (!connection) {
    console.log(`No client found for shop ${shopDomain}`);
    return c.json({ received: true, skipped: 'no client found' });
  }

  const clientId = connection.client_id;

  console.log(`Email flow webhook: ${topic} from ${shopDomain} (client: ${clientId})`);

  switch (topic) {
    case 'checkouts/create':
      await handleCheckoutCreated(supabase, clientId, payload);
      break;

    case 'customers/create':
      await handleCustomerCreated(supabase, clientId, payload);
      break;

    case 'orders/create':
      await handleOrderCreated(supabase, clientId, payload);
      break;

    case 'products/update':
      await handleProductUpdate(supabase, clientId, payload);
      break;

    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }

  return c.json({ received: true });
}

/**
 * Handle checkouts/create — trigger abandoned cart flow.
 * We wait before enrolling because the customer might complete the purchase.
 */
async function handleCheckoutCreated(supabase: any, clientId: string, payload: any) {
  // WA abandoned cart: save checkout for WhatsApp reminder cron (abandoned-cart-wa.ts)
  const customerPhone = payload.phone
    || payload.shipping_address?.phone
    || payload.billing_address?.phone
    || payload.customer?.phone;
  if (customerPhone) {
    try {
      const cleanPhone = customerPhone.replace(/[\s\-()]/g, '');
      const lineItems = (payload.line_items || []).slice(0, 5).map((item: any) => ({
        title: item.title, price: item.price, quantity: item.quantity, image_url: item.image_url || null,
      }));
      await supabase.from('shopify_abandoned_checkouts').upsert({
        client_id: clientId,
        checkout_id: String(payload.id || payload.token),
        customer_phone: cleanPhone,
        customer_name: payload.shipping_address?.name || payload.billing_address?.name
          || (payload.customer?.first_name ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim() : null),
        customer_email: payload.email || null,
        line_items: lineItems,
        total_price: parseFloat(payload.total_price || '0'),
        currency: payload.currency || 'CLP',
        abandoned_checkout_url: payload.abandoned_checkout_url || null,
        wa_reminder_sent: false,
        order_completed: false,
      }, { onConflict: 'client_id,checkout_id' });
    } catch (waErr) {
      console.error('[flow-webhooks] WA abandoned checkout save error (non-blocking):', waErr);
    }
  }

  const email = payload.email?.toLowerCase();
  if (!email) {
    console.log('Checkout webhook: no email, skipping');
    return;
  }

  // Upsert subscriber from checkout data
  const subscriber = await upsertSubscriber(supabase, clientId, {
    email,
    first_name: payload.billing_address?.first_name || payload.shipping_address?.first_name,
    last_name: payload.billing_address?.last_name || payload.shipping_address?.last_name,
    source: 'shopify_abandoned',
  });

  if (!subscriber) return;

  // Find active abandoned_cart flows for this client
  const { data: flows } = await supabase
    .from('email_flows')
    .select('*')
    .eq('client_id', clientId)
    .eq('trigger_type', 'abandoned_cart')
    .eq('status', 'active');

  if (!flows || flows.length === 0) return;

  for (const flow of flows) {
    // Check if already enrolled in this flow
    const { count } = await supabase
      .from('email_flow_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('flow_id', flow.id)
      .eq('subscriber_id', subscriber.id)
      .eq('status', 'active');

    if (count && count > 0) {
      console.log(`Subscriber ${subscriber.id} already enrolled in flow ${flow.id}`);
      continue;
    }

    // The first step delay acts as the "wait to see if they purchase" window
    const steps = flow.steps as any[];
    const firstStepDelay = steps[0]?.delay_seconds || 3600; // Default 1 hour

    // Create enrollment
    const nextSendAt = new Date(Date.now() + firstStepDelay * 1000);
    const { data: enrollment, error } = await supabase
      .from('email_flow_enrollments')
      .insert({
        flow_id: flow.id,
        subscriber_id: subscriber.id,
        client_id: clientId,
        status: 'active',
        current_step: 0,
        next_send_at: nextSendAt.toISOString(),
        metadata: {
          checkout_id: payload.id || payload.token,
          total_price: payload.total_price,
          abandoned_checkout_url: payload.abandoned_checkout_url,
          line_items: (payload.line_items || []).slice(0, 5).map((item: any) => ({
            title: item.title,
            image: item.image_url || item.featured_image?.url,
            price: item.price,
            quantity: item.quantity,
            product_id: item.product_id ? String(item.product_id) : null,
            variant_id: item.variant_id ? String(item.variant_id) : null,
          })),
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create enrollment:', error);
      continue;
    }

    // Schedule first step via Cloud Tasks
    try {
      await scheduleFlowStepViaCloudTasks(enrollment!.id, 0, nextSendAt, clientId);
      console.log(`Enrolled subscriber ${subscriber.id} in abandoned cart flow ${flow.id}`);
    } catch (err) {
      console.error('Failed to schedule flow step:', err);
    }
  }
}

/**
 * Handle customers/create — trigger welcome flow.
 */
async function handleCustomerCreated(supabase: any, clientId: string, payload: any) {
  const email = payload.email?.toLowerCase();
  if (!email) return;

  // Upsert subscriber
  const subscriber = await upsertSubscriber(supabase, clientId, {
    email,
    first_name: payload.first_name,
    last_name: payload.last_name,
    source: 'shopify_customer',
    shopify_customer_id: String(payload.id),
  });

  if (!subscriber) return;

  // Find active welcome flows
  const { data: flows } = await supabase
    .from('email_flows')
    .select('*')
    .eq('client_id', clientId)
    .eq('trigger_type', 'welcome')
    .eq('status', 'active');

  if (!flows || flows.length === 0) return;

  for (const flow of flows) {
    // Check if already enrolled
    const { count } = await supabase
      .from('email_flow_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('flow_id', flow.id)
      .eq('subscriber_id', subscriber.id);

    if (count && count > 0) continue; // Already been through welcome

    const steps = flow.steps as any[];
    const firstStepDelay = steps[0]?.delay_seconds || 0; // Welcome is usually immediate
    const nextSendAt = new Date(Date.now() + firstStepDelay * 1000);

    const { data: enrollment, error } = await supabase
      .from('email_flow_enrollments')
      .insert({
        flow_id: flow.id,
        subscriber_id: subscriber.id,
        client_id: clientId,
        status: 'active',
        current_step: 0,
        next_send_at: nextSendAt.toISOString(),
        metadata: { shopify_customer_id: String(payload.id) },
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create welcome enrollment:', error);
      continue;
    }

    try {
      await scheduleFlowStepViaCloudTasks(enrollment!.id, 0, nextSendAt, clientId);
      console.log(`Enrolled subscriber ${subscriber.id} in welcome flow ${flow.id}`);
    } catch (err) {
      console.error('Failed to schedule welcome step:', err);
    }
  }
}

/**
 * Handle orders/create — trigger post-purchase flow + cancel abandoned cart flows.
 * Also marks WA abandoned checkouts as completed so the cron doesn't send reminders.
 */
async function handleOrderCreated(supabase: any, clientId: string, payload: any) {
  // WA: mark any matching abandoned checkouts as completed
  const checkoutId = payload.checkout_id || payload.checkout_token;
  if (checkoutId) {
    try {
      await supabase.from('shopify_abandoned_checkouts')
        .update({ order_completed: true })
        .eq('client_id', clientId)
        .eq('checkout_id', String(checkoutId));
    } catch (waErr) {
      console.error('[flow-webhooks] WA checkout completion update error (non-blocking):', waErr);
    }
  }
  const email = payload.email?.toLowerCase();
  if (!email) return;

  // Update subscriber with order data
  const { data: subscriber } = await supabase
    .from('email_subscribers')
    .select('id, total_orders, total_spent')
    .eq('client_id', clientId)
    .eq('email', email)
    .single();

  if (subscriber) {
    const orderTotal = parseFloat(payload.total_price || '0');
    await supabase
      .from('email_subscribers')
      .update({
        total_orders: (subscriber.total_orders || 0) + 1,
        total_spent: (subscriber.total_spent || 0) + orderTotal,
        last_order_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriber.id);

    // Cancel any active abandoned_cart enrollments for this subscriber
    const { data: activeEnrollments } = await supabase
      .from('email_flow_enrollments')
      .select('id, flow_id, cloud_task_name')
      .eq('subscriber_id', subscriber.id)
      .eq('client_id', clientId)
      .eq('status', 'active');

    for (const enrollment of activeEnrollments || []) {
      // Check if this enrollment belongs to an abandoned_cart flow
      const { data: flow } = await supabase
        .from('email_flows')
        .select('trigger_type')
        .eq('id', enrollment.flow_id)
        .single();

      if (flow?.trigger_type === 'abandoned_cart') {
        await supabase
          .from('email_flow_enrollments')
          .update({ status: 'converted', completed_at: new Date().toISOString() })
          .eq('id', enrollment.id);

        // Try to cancel the Cloud Task
        if (enrollment.cloud_task_name) {
          try {
            const { CloudTasksClient } = await import('@google-cloud/tasks');
            const client = new CloudTasksClient();
            await client.deleteTask({ name: enrollment.cloud_task_name });
          } catch (err) {
            // Task may have already executed
            console.log(`Could not cancel task ${enrollment.cloud_task_name}:`, err);
          }
        }

        console.log(`Cancelled abandoned cart enrollment ${enrollment.id} — subscriber purchased`);
      }
    }

    // Record conversion event — attribute to most recent campaign/flow email
    const { data: recentEvent } = await supabase
      .from('email_events')
      .select('campaign_id, flow_id')
      .eq('subscriber_id', subscriber.id)
      .eq('event_type', 'clicked')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Also check UTM attribution
    const landingSite = payload.landing_site || '';
    const utmMatch = landingSite.match(/utm_campaign=([^&]+)/);

    await supabase.from('email_events').insert({
      client_id: clientId,
      subscriber_id: subscriber.id,
      campaign_id: recentEvent?.campaign_id || null,
      flow_id: recentEvent?.flow_id || null,
      event_type: 'converted',
      metadata: {
        order_id: payload.id,
        order_number: payload.order_number,
        revenue: parseFloat(payload.total_price || '0'),
        utm_campaign: utmMatch?.[1] || null,
        landing_site: landingSite,
      },
    });

    // Trigger post-purchase flows
    const { data: postPurchaseFlows } = await supabase
      .from('email_flows')
      .select('*')
      .eq('client_id', clientId)
      .eq('trigger_type', 'post_purchase')
      .eq('status', 'active');

    for (const flow of postPurchaseFlows || []) {
      const { count } = await supabase
        .from('email_flow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('flow_id', flow.id)
        .eq('subscriber_id', subscriber.id)
        .eq('status', 'active');

      if (count && count > 0) continue;

      const steps = flow.steps as any[];
      const firstStepDelay = steps[0]?.delay_seconds || 86400; // Default 24h for post-purchase
      const nextSendAt = new Date(Date.now() + firstStepDelay * 1000);

      const { data: enrollment, error } = await supabase
        .from('email_flow_enrollments')
        .insert({
          flow_id: flow.id,
          subscriber_id: subscriber.id,
          client_id: clientId,
          status: 'active',
          current_step: 0,
          next_send_at: nextSendAt.toISOString(),
          metadata: {
            order_id: payload.id,
            order_number: payload.order_number,
            total_price: payload.total_price,
            line_items: (payload.line_items || []).slice(0, 5).map((item: any) => ({
              title: item.title,
              image: item.image_url || item.featured_image?.url || null,
              price: item.price,
              quantity: item.quantity,
              product_id: item.product_id ? String(item.product_id) : null,
              variant_id: item.variant_id ? String(item.variant_id) : null,
            })),
          },
        })
        .select('id')
        .single();

      if (error) continue;

      try {
        await scheduleFlowStepViaCloudTasks(enrollment!.id, 0, nextSendAt, clientId);
        console.log(`Enrolled subscriber ${subscriber.id} in post-purchase flow ${flow.id}`);
      } catch (err) {
        console.error('Failed to schedule post-purchase step:', err);
      }
    }
  }
}

/**
 * Upsert a subscriber from webhook data.
 */
async function upsertSubscriber(
  supabase: any,
  clientId: string,
  data: {
    email: string;
    first_name?: string;
    last_name?: string;
    source: string;
    shopify_customer_id?: string;
  }
) {
  const { data: subscriber, error } = await supabase
    .from('email_subscribers')
    .upsert({
      client_id: clientId,
      email: data.email,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      source: data.source,
      shopify_customer_id: data.shopify_customer_id || null,
      status: 'subscribed',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,email' })
    .select('id, email, status')
    .single();

  if (error) {
    console.error('Failed to upsert subscriber:', error);
    return null;
  }

  // Don't enroll unsubscribed/bounced subscribers
  if (subscriber.status !== 'subscribed') {
    return null;
  }

  return subscriber;
}

/**
 * Handle products/update — trigger back-in-stock and price-drop alerts.
 */
async function handleProductUpdate(supabase: any, clientId: string, payload: any) {
  const productId = String(payload.id || '');
  if (!productId) return;

  // Check for back-in-stock: only trigger if there are active alerts for this product
  // (avoids false positives on every product edit when product has inventory)
  const variants = payload.variants || [];
  const hasInventory = variants.some((v: any) => (v.inventory_quantity || 0) > 0);

  if (hasInventory) {
    // Check active back-in-stock alerts — only proceed if someone is actually waiting
    const { data: bisAlerts } = await supabase
      .from('product_alerts')
      .select('id')
      .eq('client_id', clientId)
      .eq('product_id', productId)
      .eq('alert_type', 'back_in_stock')
      .eq('status', 'active')
      .limit(1);

    if (bisAlerts && bisAlerts.length > 0) {
      console.log(`Product ${productId} back in stock — triggering alerts for client ${clientId}`);
      const { productAlerts } = await import('./product-alerts.js');
      const fakeContext = {
        req: {
          json: async () => ({
            action: 'trigger_check',
            client_id: clientId,
            product_id: productId,
          }),
        },
        json: (data: any, status?: number) => ({ data, status }),
      } as any;
      await productAlerts(fakeContext);

      // Also enroll in back_in_stock flows (only when alerts exist)
      await enrollInFlows(supabase, clientId, 'back_in_stock', productId, payload);
    }
  }

  // Check for price drops
  for (const variant of variants) {
    const currentPrice = parseFloat(variant.price || '0');
    if (currentPrice <= 0) continue;

    const { data: priceAlerts } = await supabase
      .from('product_alerts')
      .select('id, original_price')
      .eq('client_id', clientId)
      .eq('product_id', productId)
      .eq('alert_type', 'price_drop')
      .eq('status', 'active');

    const triggeredAlerts = (priceAlerts || []).filter(
      (a: any) => a.original_price && currentPrice < parseFloat(a.original_price)
    );

    if (triggeredAlerts.length > 0) {
      console.log(`Product ${productId} price dropped — triggering ${triggeredAlerts.length} alerts`);
      const { productAlerts } = await import('./product-alerts.js');
      const fakeContext = {
        req: {
          json: async () => ({
            action: 'trigger_check',
            client_id: clientId,
            product_id: productId,
          }),
        },
        json: (data: any, status?: number) => ({ data, status }),
      } as any;
      await productAlerts(fakeContext);

      // Enroll in price_drop flows
      await enrollInFlows(supabase, clientId, 'price_drop', productId, payload);
    }
    break; // Only check first variant for price
  }
}

/**
 * Enroll subscribers with alerts into matching flows.
 */
async function enrollInFlows(
  supabase: any,
  clientId: string,
  triggerType: string,
  productId: string,
  payload: any,
) {
  const { data: flows } = await supabase
    .from('email_flows')
    .select('*')
    .eq('client_id', clientId)
    .eq('trigger_type', triggerType)
    .eq('status', 'active');

  if (!flows || flows.length === 0) return;

  // Get subscribers who had alerts for this product
  const { data: alerts } = await supabase
    .from('product_alerts')
    .select('subscriber_id')
    .eq('client_id', clientId)
    .eq('product_id', productId)
    .eq('status', 'active')
    .not('subscriber_id', 'is', null);

  const subscriberIds = [...new Set((alerts || []).map((a: any) => a.subscriber_id).filter(Boolean))];
  if (subscriberIds.length === 0) return;

  for (const flow of flows) {
    for (const subscriberId of subscriberIds) {
      const { count } = await supabase
        .from('email_flow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('flow_id', flow.id)
        .eq('subscriber_id', subscriberId)
        .eq('status', 'active');

      if (count && count > 0) continue;

      const steps = flow.steps as any[];
      const firstStepDelay = steps[0]?.delay_seconds || 0;
      const nextSendAt = new Date(Date.now() + firstStepDelay * 1000);

      const { data: enrollment, error } = await supabase
        .from('email_flow_enrollments')
        .insert({
          flow_id: flow.id,
          subscriber_id: subscriberId,
          client_id: clientId,
          status: 'active',
          current_step: 0,
          next_send_at: nextSendAt.toISOString(),
          metadata: {
            product_id: productId,
            product_title: payload.title,
            trigger: triggerType,
          },
        })
        .select('id')
        .single();

      if (error) continue;

      try {
        await scheduleFlowStepViaCloudTasks(enrollment!.id, 0, nextSendAt, clientId);
        console.log(`Enrolled subscriber ${subscriberId} in ${triggerType} flow ${flow.id}`);
      } catch (err) {
        console.error(`Failed to schedule ${triggerType} flow step:`, err);
      }
    }
  }
}

/**
 * Cron: Winback trigger — finds customers who haven't ordered in N days and enrolls them.
 * POST /api/email-flow-cron-winback (called by Cloud Scheduler)
 */
export async function emailFlowCronWinback(c: Context) {
  const supabase = getSupabaseAdmin();

  // Get all active winback flows
  const { data: flows } = await supabase
    .from('email_flows')
    .select('*')
    .eq('trigger_type', 'winback')
    .eq('status', 'active');

  if (!flows || flows.length === 0) {
    return c.json({ processed: 0, message: 'No active winback flows' });
  }

  let totalEnrolled = 0;

  for (const flow of flows) {
    const inactivityDays = parseInt(flow.settings?.trigger_config?.inactivity_days || '90', 10);
    const cutoffDate = new Date(Date.now() - inactivityDays * 86400 * 1000).toISOString();

    // Find subscribers with Shopify customer IDs who ordered before the cutoff
    // and haven't ordered since
    const { data: candidates } = await supabase
      .from('email_subscribers')
      .select('id, email, shopify_customer_id')
      .eq('client_id', flow.client_id)
      .eq('status', 'subscribed')
      .not('shopify_customer_id', 'is', null)
      .not('last_order_at', 'is', null)
      .lt('last_order_at', cutoffDate)
      .limit(100);

    if (!candidates || candidates.length === 0) continue;

    for (const subscriber of candidates) {
      // Check not already enrolled
      const { count } = await supabase
        .from('email_flow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('flow_id', flow.id)
        .eq('subscriber_id', subscriber.id)
        .in('status', ['active', 'completed']);

      if (count && count > 0) continue;

      const steps = flow.steps as any[];
      const firstStepDelay = steps[0]?.delay_seconds || 0;
      const nextSendAt = new Date(Date.now() + firstStepDelay * 1000);

      const { data: enrollment, error } = await supabase
        .from('email_flow_enrollments')
        .insert({
          flow_id: flow.id,
          subscriber_id: subscriber.id,
          client_id: flow.client_id,
          status: 'active',
          current_step: 0,
          next_send_at: nextSendAt.toISOString(),
          metadata: { trigger: 'winback', inactivity_days: inactivityDays },
        })
        .select('id')
        .single();

      if (error) continue;

      try {
        await scheduleFlowStepViaCloudTasks(enrollment!.id, 0, nextSendAt, flow.client_id);
        totalEnrolled++;
      } catch (err) {
        console.error('Failed to schedule winback step:', err);
      }
    }
  }

  console.log(`Winback cron: enrolled ${totalEnrolled} subscribers`);
  return c.json({ processed: totalEnrolled });
}

/**
 * Cron: Birthday trigger — finds subscribers with birthday today (or N days ahead).
 * POST /api/email-flow-cron-birthday (called by Cloud Scheduler)
 */
export async function emailFlowCronBirthday(c: Context) {
  const supabase = getSupabaseAdmin();

  const { data: flows } = await supabase
    .from('email_flows')
    .select('*')
    .eq('trigger_type', 'birthday')
    .eq('status', 'active');

  if (!flows || flows.length === 0) {
    return c.json({ processed: 0, message: 'No active birthday flows' });
  }

  let totalEnrolled = 0;

  for (const flow of flows) {
    const daysBefore = parseInt(flow.settings?.trigger_config?.days_before || '0', 10);
    const targetDate = new Date(Date.now() + daysBefore * 86400 * 1000);
    const targetMonth = targetDate.getMonth() + 1;
    const targetDay = targetDate.getDate();

    // Find subscribers whose birthday matches target date
    // birthday stored as metadata field (month-day) or custom_fields.birthday
    const { data: subscribers } = await supabase
      .from('email_subscribers')
      .select('id, email, custom_fields')
      .eq('client_id', flow.client_id)
      .eq('status', 'subscribed')
      .limit(500);

    if (!subscribers) continue;

    // Filter by birthday match
    const matches = subscribers.filter((sub: any) => {
      const bd = sub.custom_fields?.birthday || sub.custom_fields?.birthdate;
      if (!bd) return false;
      try {
        const bdDate = new Date(bd);
        return bdDate.getMonth() + 1 === targetMonth && bdDate.getDate() === targetDay;
      } catch { return false; }
    });

    for (const subscriber of matches) {
      const { count } = await supabase
        .from('email_flow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('flow_id', flow.id)
        .eq('subscriber_id', subscriber.id)
        .eq('status', 'active');

      if (count && count > 0) continue;

      // Prevent re-enrollment within same year
      const { count: yearCount } = await supabase
        .from('email_flow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('flow_id', flow.id)
        .eq('subscriber_id', subscriber.id)
        .gte('created_at', new Date(new Date().getFullYear(), 0, 1).toISOString());

      if (yearCount && yearCount > 0) continue;

      const steps = flow.steps as any[];
      const firstStepDelay = steps[0]?.delay_seconds || 0;
      const nextSendAt = new Date(Date.now() + firstStepDelay * 1000);

      const { data: enrollment, error } = await supabase
        .from('email_flow_enrollments')
        .insert({
          flow_id: flow.id,
          subscriber_id: subscriber.id,
          client_id: flow.client_id,
          status: 'active',
          current_step: 0,
          next_send_at: nextSendAt.toISOString(),
          metadata: {
            trigger: 'birthday',
            birthday: subscriber.custom_fields?.birthday || subscriber.custom_fields?.birthdate,
            include_discount: flow.settings?.trigger_config?.include_discount || 'none',
          },
        })
        .select('id')
        .single();

      if (error) continue;

      try {
        await scheduleFlowStepViaCloudTasks(enrollment!.id, 0, nextSendAt, flow.client_id);
        totalEnrolled++;
      } catch (err) {
        console.error('Failed to schedule birthday step:', err);
      }
    }
  }

  console.log(`Birthday cron: enrolled ${totalEnrolled} subscribers`);
  return c.json({ processed: totalEnrolled });
}

/**
 * Track browse events — called from storefront tracking pixel.
 * POST /api/email-flow-track-browse
 * Body: { client_id, email, product_id, product_title, product_url, product_image }
 */
export async function emailFlowTrackBrowse(c: Context) {
  const body = await c.req.json();
  const { client_id, email, product_id, product_title, product_url, product_image } = body;

  if (!client_id || !email || !product_id) {
    return c.json({ error: 'Missing client_id, email, or product_id' }, 400);
  }

  const supabase = getSupabaseAdmin();

  // Find or create subscriber
  const { data: subscriber } = await supabase
    .from('email_subscribers')
    .select('id, email, status')
    .eq('client_id', client_id)
    .eq('email', email.toLowerCase())
    .single();

  if (!subscriber || subscriber.status !== 'subscribed') {
    return c.json({ tracked: false, reason: 'not_subscribed' });
  }

  // Store browse event in subscriber's metadata
  const { data: existing } = await supabase
    .from('email_subscribers')
    .select('custom_fields')
    .eq('id', subscriber.id)
    .single();

  const customFields = existing?.custom_fields || {};
  const browseHistory = customFields.browse_history || [];

  // Add to browse history (max 20 items, dedup by product_id)
  const filtered = browseHistory.filter((b: any) => b.product_id !== product_id);
  filtered.unshift({
    product_id,
    product_title,
    product_url,
    product_image,
    viewed_at: new Date().toISOString(),
  });
  customFields.browse_history = filtered.slice(0, 20);

  await supabase
    .from('email_subscribers')
    .update({ custom_fields: customFields })
    .eq('id', subscriber.id);

  // Check if we should trigger browse_abandonment flow
  // (viewed enough products in the last hour, no cart created)
  const recentBrowses = customFields.browse_history.filter((b: any) => {
    const viewedAt = new Date(b.viewed_at).getTime();
    return Date.now() - viewedAt < 3600 * 1000; // last hour
  });

  const { data: flows } = await supabase
    .from('email_flows')
    .select('*')
    .eq('client_id', client_id)
    .eq('trigger_type', 'browse_abandonment')
    .eq('status', 'active');

  if (flows && flows.length > 0) {
    for (const flow of flows) {
      const minViewed = parseInt(flow.settings?.trigger_config?.min_products_viewed || '2', 10);
      if (recentBrowses.length < minViewed) continue;

      // Check not already enrolled recently (within 24h)
      const { count } = await supabase
        .from('email_flow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('flow_id', flow.id)
        .eq('subscriber_id', subscriber.id)
        .gte('created_at', new Date(Date.now() - 86400 * 1000).toISOString());

      if (count && count > 0) continue;

      const waitMinutes = parseInt(flow.settings?.trigger_config?.wait_minutes || '60', 10);
      const steps = flow.steps as any[];
      const firstStepDelay = steps[0]?.delay_seconds || waitMinutes * 60;
      const nextSendAt = new Date(Date.now() + firstStepDelay * 1000);

      const { data: enrollment, error } = await supabase
        .from('email_flow_enrollments')
        .insert({
          flow_id: flow.id,
          subscriber_id: subscriber.id,
          client_id: client_id,
          status: 'active',
          current_step: 0,
          next_send_at: nextSendAt.toISOString(),
          metadata: {
            trigger: 'browse_abandonment',
            browsed_products: recentBrowses.slice(0, 5),
          },
        })
        .select('id')
        .single();

      if (error) continue;

      try {
        await scheduleFlowStepViaCloudTasks(enrollment!.id, 0, nextSendAt, client_id);
        console.log(`Enrolled ${subscriber.email} in browse abandonment flow ${flow.id}`);
      } catch (err) {
        console.error('Failed to schedule browse abandonment step:', err);
      }
    }
  }

  return c.json({ tracked: true });
}

/**
 * Schedule a flow step via Cloud Tasks.
 */
async function scheduleFlowStepViaCloudTasks(
  enrollmentId: string,
  step: number,
  scheduledAt: Date,
  clientId: string
) {
  const { CloudTasksClient } = await import('@google-cloud/tasks');
  const client = new CloudTasksClient();

  const project = process.env.GCP_PROJECT_ID || 'steveapp-agency';
  const location = process.env.GCP_LOCATION || 'us-central1';
  const queue = process.env.CLOUD_TASKS_QUEUE || 'steve-mail';
  const apiBaseUrl = process.env.API_BASE_URL || 'https://steve-api-850416724643.us-central1.run.app';

  const parent = client.queuePath(project, location, queue);

  const [task] = await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: `${apiBaseUrl}/api/email-flow-execute`,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: Buffer.from(JSON.stringify({
          enrollment_id: enrollmentId,
          step,
        })).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor(scheduledAt.getTime() / 1000),
      },
    },
  });

  // Store task name for cancellation
  if (task?.name) {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('email_flow_enrollments')
      .update({ cloud_task_name: task.name })
      .eq('id', enrollmentId);
  }
}
