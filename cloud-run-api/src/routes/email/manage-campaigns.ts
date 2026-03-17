import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendSingleEmail } from './send-email.js';
import { renderEmailTemplate, buildTemplateContext } from '../../lib/template-engine.js';
import { processEmailHtml } from '../../lib/email-html-processor.js';
import { espejoEmail } from '../ai/espejo.js';
import { detectAngle } from '../../lib/angle-detector.js';

/**
 * Campaign management: CRUD + send + schedule.
 * POST /api/manage-email-campaigns
 */
export async function manageEmailCampaigns(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'list': {
      const { status, limit = 50, offset = 0 } = body;
      let query = supabase
        .from('email_campaigns')
        .select('*', { count: 'exact' })
        .eq('client_id', client_id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);

      const { data, error, count } = await query;
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ campaigns: data, total: count });
    }

    case 'get': {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      const { data, error } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ campaign: data });
    }

    case 'create': {
      const { name, subject, preview_text, html_content, from_name, from_email, reply_to, audience_filter, design_json, recommendation_config } = body;
      if (!name) return c.json({ error: 'name is required' }, 400);

      const { data, error } = await supabase
        .from('email_campaigns')
        .insert({
          client_id,
          name,
          subject: subject || null,
          preview_text: preview_text || null,
          from_name: from_name || null,
          from_email: from_email || null,
          reply_to: reply_to || null,
          html_content: html_content || null,
          design_json: design_json || null,
          audience_filter: audience_filter || {},
          recommendation_config: recommendation_config || null,
          status: 'draft',
        })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);

      // D.6: Save to creative_history with detected angle
      if (data) {
        try {
          const copyForAngle = subject || name || '';
          const angle = await detectAngle(copyForAngle);
          await supabase.from('creative_history').insert({
            client_id,
            channel: 'email',
            entity_type: 'email_campaign',
            entity_id: data.id,
            angle,
            copy_text: copyForAngle.substring(0, 2000),
          });
        } catch (chErr) { console.error('[manage-campaigns] creative_history insert error:', chErr); }
      }

      return c.json({ success: true, campaign: data });
    }

    case 'update': {
      const { campaign_id, ...updates } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      // Only allow updates on draft/scheduled campaigns
      const { data: existing } = await supabase
        .from('email_campaigns')
        .select('status')
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .single();

      if (!existing || !['draft', 'scheduled'].includes(existing.status)) {
        return c.json({ error: 'Can only update draft or scheduled campaigns' }, 400);
      }

      const allowedFields = ['name', 'subject', 'preview_text', 'html_content', 'from_name', 'from_email', 'reply_to', 'audience_filter', 'design_json', 'recommendation_config'];
      const cleanUpdates: any = { updated_at: new Date().toISOString() };
      for (const field of allowedFields) {
        if (updates[field] !== undefined) cleanUpdates[field] = updates[field];
      }

      const { data, error } = await supabase
        .from('email_campaigns')
        .update(cleanUpdates)
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, campaign: data });
    }

    case 'delete': {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      const { error } = await supabase
        .from('email_campaigns')
        .delete()
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .in('status', ['draft', 'cancelled']);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    case 'send': {
      // Send campaign immediately to matched audience (with A/B test support)
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      const { data: campaign, error: campErr } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .single();

      if (campErr || !campaign) return c.json({ error: 'Campaign not found' }, 404);
      if (!campaign.subject || !campaign.html_content) {
        return c.json({ error: 'Campaign must have subject and HTML content' }, 400);
      }
      if (!['draft', 'scheduled'].includes(campaign.status)) {
        return c.json({ error: 'Campaign is not in a sendable state' }, 400);
      }

      // ── ESPEJO visual check for email HTML ──
      if (campaign.html_content) {
        try {
          const { data: brandInfo } = await supabase
            .from('brand_research')
            .select('brand_name, colors')
            .eq('shop_id', client_id)
            .maybeSingle();

          const espejoResult = await espejoEmail(
            campaign.html_content,
            client_id,
            campaign_id,
            brandInfo?.colors || '#000000',
            brandInfo?.brand_name || 'Brand'
          );

          if (!espejoResult.pass) {
            console.log(`[manage-campaigns] ESPEJO rejected email: score=${espejoResult.score}`);
            return c.json({
              error: 'ESPEJO rechazó el email',
              score: espejoResult.score,
              issues: espejoResult.issues,
              details: espejoResult.details,
            }, 422);
          }

          console.log(`[manage-campaigns] ESPEJO approved email: score=${espejoResult.score}`);
        } catch (espejoErr: any) {
          // ESPEJO failure should not block email sending — log and continue
          console.warn(`[manage-campaigns] ESPEJO evaluation failed (non-blocking): ${espejoErr?.message}`);
        }
      }

      // Check for A/B test — create from request body if provided
      let abTest: any = null;
      const abConfig = body.ab_test;
      if (abConfig && abConfig.variant_b_subject) {
        // Create A/B test record from frontend config
        const { data: newTest } = await supabase
          .from('email_ab_tests')
          .upsert({
            client_id,
            campaign_id,
            variant_b_subject: abConfig.variant_b_subject,
            test_percentage: abConfig.test_percentage || 20,
            winning_metric: abConfig.winning_metric || 'open_rate',
            test_duration_hours: abConfig.test_duration_hours || 4,
            status: 'pending',
          }, { onConflict: 'campaign_id' })
          .select()
          .single();
        abTest = newTest;
      } else {
        // Check for existing A/B test
        const { data: existingTest } = await supabase
          .from('email_ab_tests')
          .select('*')
          .eq('campaign_id', campaign_id)
          .eq('client_id', client_id)
          .eq('status', 'pending')
          .maybeSingle();
        abTest = existingTest;
      }

      // Mark as sending
      await supabase
        .from('email_campaigns')
        .update({ status: 'sending', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', campaign_id);

      // Get subscribers matching audience filter
      const subscribers = await getFilteredSubscribers(supabase, client_id, campaign.audience_filter);

      // Update total recipients
      await supabase
        .from('email_campaigns')
        .update({ total_recipients: subscribers.length })
        .eq('id', campaign_id);

      // Determine from email
      const fromEmail = campaign.from_email || `noreply@${process.env.DEFAULT_FROM_DOMAIN || 'steve.cl'}`;
      const fromName = campaign.from_name || 'Steve';

      // Product recommendations are now processed per-subscriber in processEmailHtml
      const recConfig = campaign.recommendation_config || null;
      let baseHtml = campaign.html_content;

      // Load brand info for nunjucks template rendering
      const { data: brandClient } = await supabase
        .from('clients')
        .select('name, logo_url, brand_color, brand_secondary_color, brand_font, website_url')
        .eq('id', client_id)
        .single();
      const brandInfo = {
        name: brandClient?.name || '',
        logo_url: brandClient?.logo_url || '',
        color: brandClient?.brand_color || '#18181b',
        secondary_color: brandClient?.brand_secondary_color || '#6366f1',
        font: brandClient?.brand_font || 'Inter',
        shop_url: brandClient?.website_url || '',
      };

      // Check if HTML uses nunjucks syntax
      const usesNunjucks = baseHtml.includes('{%') || baseHtml.includes('{{');

      // Send emails in batches
      let sentCount = 0;
      const batchSize = 10;

      if (abTest) {
        // === A/B Test Mode ===
        const testPct = abTest.test_percentage || 20;
        const testSize = Math.max(2, Math.floor(subscribers.length * (testPct / 100)));
        const halfTest = Math.floor(testSize / 2);

        // Shuffle subscribers for random split
        const shuffled = [...subscribers].sort(() => Math.random() - 0.5);
        const groupA = shuffled.slice(0, halfTest);
        const groupB = shuffled.slice(halfTest, testSize);
        const remainder = shuffled.slice(testSize);

        // Variant B content (product recommendations processed per-subscriber)
        const variantBSubject = abTest.variant_b_subject || campaign.subject;
        const variantBHtml = abTest.variant_b_html_content || baseHtml;

        // Update A/B test status
        await supabase
          .from('email_ab_tests')
          .update({
            status: 'testing',
            variant_a_recipients: groupA.length,
            variant_b_recipients: groupB.length,
            remaining_recipients: remainder.length,
            test_started_at: new Date().toISOString(),
          })
          .eq('id', abTest.id);

        // Helper: per-subscriber processing for A/B test
        const processAndSend = async (sub: any, html: string, subject: string, variant: 'a' | 'b') => {
          try {
            const ctx = buildTemplateContext(
              { first_name: sub.first_name ?? undefined, last_name: sub.last_name ?? undefined, email: sub.email, tags: sub.tags, total_orders: sub.total_orders, total_spent: sub.total_spent, last_order_at: sub.last_order_at, custom_fields: sub.custom_fields },
              { discount_code: campaign.recommendation_config?.discount_code },
              brandInfo,
              []
            );
            let personalizedHtml = usesNunjucks ? renderEmailTemplate(html, ctx) : html;
            let personalizedSubject = usesNunjucks ? renderEmailTemplate(subject, ctx) : subject;

            const hasCustomBlocks = personalizedHtml.includes('data-steve-') || personalizedHtml.includes('product_recommendations');
            if (hasCustomBlocks) {
              personalizedHtml = await processEmailHtml(personalizedHtml, {
                clientId: client_id, subscriberId: sub.id, templateContext: ctx, recommendationConfig: recConfig,
              });
            }

            const r = await sendSingleEmail({
              to: sub.email, subject: personalizedSubject, htmlContent: personalizedHtml,
              fromEmail, fromName, replyTo: campaign.reply_to || undefined,
              subscriberId: sub.id, clientId: client_id, campaignId: campaign_id, abVariant: variant,
            });
            if (r.success) sentCount++;
            return r;
          } catch (err) {
            console.error(`[campaign-send] A/B variant ${variant} failed for ${sub.email}:`, err);
            return { success: false, error: (err as Error).message };
          }
        };

        // Send variant A
        for (let i = 0; i < groupA.length; i += batchSize) {
          const batch = groupA.slice(i, i + batchSize);
          await Promise.all(batch.map((sub) => processAndSend(sub, baseHtml, campaign.subject, 'a')));
        }

        // Send variant B
        for (let i = 0; i < groupB.length; i += batchSize) {
          const batch = groupB.slice(i, i + batchSize);
          await Promise.all(batch.map((sub) => processAndSend(sub, variantBHtml, variantBSubject, 'b')));
        }

        // Schedule Cloud Task to pick winner after test_duration_hours
        try {
          const winnerTime = new Date(Date.now() + (abTest.test_duration_hours || 4) * 3600 * 1000);
          await scheduleAbTestWinner(abTest.id, client_id, winnerTime);
        } catch (err) {
          console.error('Failed to schedule A/B test winner task:', err);
        }

        // Mark campaign as sent (test portion)
        await supabase
          .from('email_campaigns')
          .update({ status: 'sent', sent_count: sentCount, updated_at: new Date().toISOString() })
          .eq('id', campaign_id);

        return c.json({
          success: true,
          ab_test: true,
          variant_a_sent: groupA.length,
          variant_b_sent: groupB.length,
          remaining: remainder.length,
          sent_count: sentCount,
        });
      }

      // === Normal send (no A/B test) ===
      for (let i = 0; i < subscribers.length; i += batchSize) {
        const batch = subscribers.slice(i, i + batchSize);

        const promises = batch.map(async (sub) => {
          try {
            // Build per-subscriber template context with full subscriber data
            const ctx = buildTemplateContext(
              { first_name: sub.first_name ?? undefined, last_name: sub.last_name ?? undefined, email: sub.email, tags: sub.tags, total_orders: sub.total_orders, total_spent: sub.total_spent, last_order_at: sub.last_order_at ?? undefined, custom_fields: sub.custom_fields ?? undefined },
              { discount_code: campaign.recommendation_config?.discount_code },
              brandInfo,
              []
            );

            // Render per-subscriber template (nunjucks)
            let personalizedHtml = usesNunjucks ? renderEmailTemplate(baseHtml, ctx) : baseHtml;
            let personalizedSubject = usesNunjucks ? renderEmailTemplate(campaign.subject, ctx) : campaign.subject;

            // Process custom blocks (products, discounts, conditionals) per subscriber
            const hasCustomBlocks = personalizedHtml.includes('data-steve-') || personalizedHtml.includes('product_recommendations');
            if (hasCustomBlocks) {
              personalizedHtml = await processEmailHtml(personalizedHtml, {
                clientId: client_id,
                subscriberId: sub.id,
                templateContext: ctx,
                recommendationConfig: recConfig,
              });
            }

            return sendSingleEmail({
              to: sub.email,
              subject: personalizedSubject,
              htmlContent: personalizedHtml,
              fromEmail,
              fromName,
              replyTo: campaign.reply_to || undefined,
              subscriberId: sub.id,
              clientId: client_id,
              campaignId: campaign_id,
            }).then((result) => {
              if (result.success) sentCount++;
              return result;
            });
          } catch (err) {
            console.error(`[campaign-send] Failed for subscriber ${sub.id}:`, err);
            return { success: false, error: (err as Error).message };
          }
        });

        await Promise.all(promises);

        // Update sent count periodically
        if (i % 50 === 0) {
          await supabase
            .from('email_campaigns')
            .update({ sent_count: sentCount })
            .eq('id', campaign_id);
        }
      }

      // Mark as sent
      await supabase
        .from('email_campaigns')
        .update({
          status: 'sent',
          sent_count: sentCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign_id);

      // D.6: Update creative_history with send metadata
      try {
        await supabase
          .from('creative_history')
          .update({ sent_count: sentCount })
          .eq('entity_id', campaign_id)
          .eq('entity_type', 'email_campaign');
      } catch (chErr) { console.error('[manage-campaigns] creative_history send update error:', chErr); }

      return c.json({
        success: true,
        total_recipients: subscribers.length,
        sent_count: sentCount,
      });
    }

    case 'schedule': {
      const { campaign_id, scheduled_at } = body;
      if (!campaign_id || !scheduled_at) {
        return c.json({ error: 'campaign_id and scheduled_at are required' }, 400);
      }

      const scheduledDate = new Date(scheduled_at);
      if (scheduledDate <= new Date()) {
        return c.json({ error: 'scheduled_at must be in the future' }, 400);
      }

      const { data, error } = await supabase
        .from('email_campaigns')
        .update({
          status: 'scheduled',
          scheduled_at: scheduledDate.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .in('status', ['draft', 'scheduled'])
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);

      // Create Cloud Task for scheduled send
      try {
        await scheduleCloudTask(campaign_id, client_id, scheduledDate);
      } catch (err: any) {
        console.error('Failed to create Cloud Task:', err);
        // Still mark as scheduled - can be sent manually
      }

      return c.json({ success: true, campaign: data });
    }

    case 'cancel': {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      const { data, error } = await supabase
        .from('email_campaigns')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .in('status', ['draft', 'scheduled'])
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, campaign: data });
    }

    case 'get_client_brand': {
      const { data: client } = await supabase
        .from('clients')
        .select('name, logo_url, brand_color, brand_secondary_color, brand_font, website_url')
        .eq('id', client_id)
        .single();

      if (!client) return c.json({ error: 'Client not found' }, 404);

      // Fetch store_name from platform_connections for sender defaults
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('store_name')
        .eq('client_id', client_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      return c.json({
        brand_name: client.name || '',
        store_name: conn?.store_name || client.name || '',
        brand_logo: client.logo_url || '',
        brand_color: client.brand_color || '#18181b',
        brand_secondary_color: client.brand_secondary_color || '#6366f1',
        brand_font: client.brand_font || 'Inter',
        shop_url: client.website_url || '',
      });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

/**
 * Get subscribers matching audience filter.
 */
async function getFilteredSubscribers(
  supabase: any,
  clientId: string,
  filter: any
): Promise<Array<{ id: string; email: string; first_name: string | null; last_name: string | null; tags: string[]; total_orders: number; total_spent: number; last_order_at: string | null; custom_fields: Record<string, any> | null }>> {
  let query = supabase
    .from('email_subscribers')
    .select('id, email, first_name, last_name, tags, total_orders, total_spent, last_order_at, custom_fields')
    .eq('client_id', clientId)
    .eq('status', 'subscribed');

  // Apply filters
  if (filter) {
    if (filter.source) query = query.eq('source', filter.source);
    if (filter.tags && filter.tags.length > 0) query = query.overlaps('tags', filter.tags);
    if (filter.min_orders) query = query.gte('total_orders', filter.min_orders);
    if (filter.min_spent) query = query.gte('total_spent', filter.min_spent);
    if (filter.last_order_after) query = query.gte('last_order_at', filter.last_order_after);
    if (filter.last_order_before) query = query.lte('last_order_at', filter.last_order_before);
    if (filter.subscribed_after) query = query.gte('subscribed_at', filter.subscribed_after);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to query subscribers:', error);
    return [];
  }
  return data || [];
}

/**
 * Schedule a Cloud Task to send a campaign at a specific time.
 */
async function scheduleCloudTask(campaignId: string, clientId: string, scheduledAt: Date) {
  const { CloudTasksClient } = await import('@google-cloud/tasks');
  const client = new CloudTasksClient();

  const project = process.env.GCP_PROJECT_ID || 'steveapp-agency';
  const location = process.env.GCP_LOCATION || 'us-central1';
  const queue = process.env.CLOUD_TASKS_QUEUE || 'steve-mail';
  const apiBaseUrl = process.env.API_BASE_URL || 'https://steve-api-850416724643.us-central1.run.app';

  const parent = client.queuePath(project, location, queue);

  await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: `${apiBaseUrl}/api/execute-scheduled-campaign`,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: Buffer.from(JSON.stringify({
          campaign_id: campaignId,
          client_id: clientId,
        })).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor(scheduledAt.getTime() / 1000),
      },
    },
  });
}

/**
 * Schedule A/B test winner selection via Cloud Tasks.
 */
async function scheduleAbTestWinner(testId: string, clientId: string, scheduledAt: Date) {
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
        url: `${apiBaseUrl}/api/execute-ab-test-winner`,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: Buffer.from(JSON.stringify({
          test_id: testId,
          client_id: clientId,
        })).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor(scheduledAt.getTime() / 1000),
      },
    },
  });

  // Store cloud task name on the test
  if (task?.name) {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('email_ab_tests')
      .update({ cloud_task_name: task.name })
      .eq('id', testId);
  }
}

/**
 * Execute a scheduled campaign (called by Cloud Tasks).
 * POST /api/execute-scheduled-campaign
 */
export async function executeScheduledCampaign(c: Context) {
  const body = await c.req.json();
  const { campaign_id, client_id } = body;

  if (!campaign_id || !client_id) {
    return c.json({ error: 'campaign_id and client_id are required' }, 400);
  }

  const supabase = getSupabaseAdmin();

  // Verify campaign is still scheduled
  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select('status')
    .eq('id', campaign_id)
    .eq('client_id', client_id)
    .single();

  if (!campaign || campaign.status !== 'scheduled') {
    console.log(`Campaign ${campaign_id} is no longer scheduled (status: ${campaign?.status}). Skipping.`);
    return c.json({ skipped: true, reason: 'Campaign is no longer scheduled' });
  }

  // Reuse the send logic by calling the manage function internally
  // This is a simplified version - in practice, you'd extract the send logic
  const fakeContext = {
    req: {
      json: async () => ({ action: 'send', client_id, campaign_id }),
    },
    json: (data: any, status?: number) => c.json(data, status as any),
  } as any;

  return manageEmailCampaigns(fakeContext);
}
