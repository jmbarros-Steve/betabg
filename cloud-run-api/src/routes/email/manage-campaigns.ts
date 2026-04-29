import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault, safeMutateSingle } from '../../lib/safe-supabase.js';
import { renderEmailTemplate, buildTemplateContext } from '../../lib/template-engine.js';
import { processEmailHtml } from '../../lib/email-html-processor.js';
import { compileMjmlIfNeeded } from '../../lib/mjml-compile.js';
import { espejoEmail } from '../ai/espejo.js';
import { detectAngle } from '../../lib/angle-detector.js';

/**
 * Enqueue helper — inserta items personalizados en email_send_queue en chunks de 500.
 * Todas las campañas pasan por la cola. El cron email-queue-tick-1m procesa y
 * cierra el status de la campaña cuando drena (C1 sweep en send-queue).
 */
async function enqueueCampaignItems(
  supabase: any,
  items: Array<{
    client_id: string;
    campaign_id: string | null;
    flow_id: string | null;
    subscriber_id: string;
    subject: string;
    html_content: string;
    from_email: string;
    from_name: string;
    reply_to: string | null;
    ab_variant: 'a' | 'b' | null;
    priority: number;
    scheduled_for?: string;
  }>,
): Promise<number> {
  let inserted = 0;
  const errors: string[] = [];
  const CHUNK = 500;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = items.slice(i, i + CHUNK).map((item) => ({
      ...item,
      status: 'queued' as const,
      scheduled_for: item.scheduled_for || nowIso,
    }));
    const { error } = await supabase.from('email_send_queue').insert(batch);
    if (error) {
      console.error(`[enqueueCampaignItems] batch ${i} error:`, error.message);
      errors.push(`batch ${i}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }
  if (errors.length > 0 && inserted === 0) {
    throw new Error(`All batches failed: ${errors[0]}`);
  }
  return inserted;
}

/**
 * Campaign management: CRUD + send + schedule.
 * POST /api/manage-email-campaigns
 * Auth: protected by authMiddleware at the router level (routes/index.ts).
 */
export async function manageEmailCampaigns(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  // Ownership validation: ensure the authenticated user has access to this client_id
  const user = c.get('user');
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
  const { data: ownerCheck } = await supabase.from('clients').select('id').eq('id', client_id).or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`).maybeSingle();
  if (!ownerCheck) return c.json({ error: 'No tienes acceso' }, 403);

  switch (action) {
    case 'list': {
      const { status, limit = 50, offset = 0 } = body;
      let query = supabase
        .from('email_campaigns')
        .select('id,name,subject,status,from_name,from_email,preview_text,audience_filter,recommendation_config,total_recipients,sent_count,open_count,click_count,bounce_count,unsubscribe_count,scheduled_at,sent_at,created_at,updated_at', { count: 'exact' })
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

      // D.6: Save to creative_history with detected angle + scores placeholder
      if (data) {
        try {
          const copyForAngle = subject || name || '';
          const angle = await detectAngle(copyForAngle);
          await supabase.from('creative_history').insert({
            client_id,
            channel: 'email',
            type: 'email_campaign',
            angle,
            content_summary: copyForAngle.substring(0, 200),
            copy_text: copyForAngle.substring(0, 2000),
            entity_type: 'email_campaign',
            entity_id: data.id,
            criterio_score: null,
            espejo_score: null,
          });
        } catch (chErr) { console.error('[manage-campaigns] creative_history insert error:', chErr); }
      }

      return c.json({ success: true, campaign: data });
    }

    case 'update': {
      const { campaign_id, ...updates } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      // Only allow updates on draft/scheduled campaigns
      const existing = await safeQuerySingleOrDefault<any>(
        supabase
          .from('email_campaigns')
          .select('status')
          .eq('id', campaign_id)
          .eq('client_id', client_id)
          .single(),
        null,
        'manageCampaigns.update.getExisting',
      );

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
          const brandInfo = await safeQuerySingleOrDefault<any>(
            supabase
              .from('brand_research')
              .select('brand_name, colors')
              .eq('shop_id', client_id)
              .maybeSingle(),
            null,
            'manageCampaigns.send.getBrandInfo',
          );

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
        const newTest = await safeMutateSingle<any>(
          supabase
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
            .single(),
          'manageCampaigns.upsertAbTest',
        );
        abTest = newTest;
      } else {
        // Check for existing A/B test
        const existingTest = await safeQuerySingleOrDefault<any>(
          supabase
            .from('email_ab_tests')
            .select('*')
            .eq('campaign_id', campaign_id)
            .eq('client_id', client_id)
            .eq('status', 'pending')
            .maybeSingle(),
          null,
          'manageCampaigns.send.getExistingAbTest',
        );
        abTest = existingTest;
      }

      // Get subscribers matching audience filter (antes de tocar status
      // para evitar dejar la campaña 'sending' si el filtro falla o da 0).
      const subscribers = await getFilteredSubscribers(supabase, client_id, campaign.audience_filter);

      // Early return si el audience filter no matcheó a nadie: marca la
      // campaña como 'sent' con 0 recipients y sale. Evita queda stuck en
      // 'sending' para siempre (el C1 sweep no reconcilia campañas sin items).
      if (subscribers.length === 0) {
        await supabase
          .from('email_campaigns')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            total_recipients: 0,
            sent_count: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaign_id);
        // Cancelar ab_test huérfano si venía configurado (evita data pending muerta).
        if (abTest) {
          await supabase
            .from('email_ab_tests')
            .update({ status: 'cancelled' })
            .eq('id', abTest.id);
        }
        return c.json({
          success: true,
          queued: false,
          empty: true,
          total_recipients: 0,
          queued_count: 0,
        });
      }

      // Update total recipients (sin tocar status todavía)
      await supabase
        .from('email_campaigns')
        .update({ total_recipients: subscribers.length })
        .eq('id', campaign_id);

      // Determine from email — use merchant's business name, not generic "Steve"
      const fromEmail = campaign.from_email || `noreply@${process.env.DEFAULT_FROM_DOMAIN || 'steve.cl'}`;
      // brandClient is loaded below, but we need fromName before that, so load merchant name here
      const senderClient = await safeQuerySingleOrDefault<any>(
        supabase.from('clients').select('name, company').eq('id', client_id).maybeSingle(),
        null,
        'manageCampaigns.send.getSenderClient',
      );
      const fromName = campaign.from_name || senderClient?.company || senderClient?.name || 'Steve';

      // Product recommendations are now processed per-subscriber in processEmailHtml
      const recConfig = campaign.recommendation_config || null;
      // Compilar MJML → HTML responsive con CSS inline. Si ya es HTML legacy,
      // pasa intacto. Esto debe correr ANTES del rendering de Nunjucks para
      // que las merge tags no se vean afectadas.
      let baseHtml = compileMjmlIfNeeded(campaign.html_content);

      // Load brand info for nunjucks template rendering
      const brandClient = await safeQuerySingleOrDefault<any>(
        supabase
          .from('clients')
          .select('name, logo_url, brand_color, brand_secondary_color, brand_font, website_url')
          .eq('id', client_id)
          .single(),
        null,
        'manageCampaigns.send.getBrandClient',
      );
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
        // Compilar variante B desde MJML si corresponde (puede traer MJML
        // si fue creada por la IA, o HTML legacy).
        const variantBHtml = compileMjmlIfNeeded(abTest.variant_b_html_content || baseHtml);

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

        // Helper: personalizar un sub antes de encolar
        const personalizeForSub = async (sub: any, html: string, subject: string) => {
          const ctx = buildTemplateContext(
            { first_name: sub.first_name ?? undefined, last_name: sub.last_name ?? undefined, email: sub.email, tags: sub.tags, total_orders: sub.total_orders, total_spent: sub.total_spent, last_order_at: sub.last_order_at, custom_fields: sub.custom_fields },
            { discount_code: campaign.recommendation_config?.discount_code },
            brandInfo,
            []
          );
          let personalizedHtml = usesNunjucks ? renderEmailTemplate(html, ctx) : html;
          const personalizedSubject = usesNunjucks ? renderEmailTemplate(subject, ctx) : subject;
          const hasCustomBlocks = personalizedHtml.includes('data-steve-') || personalizedHtml.includes('product_recommendations');
          if (hasCustomBlocks) {
            personalizedHtml = await processEmailHtml(personalizedHtml, {
              clientId: client_id, subscriberId: sub.id, templateContext: ctx, recommendationConfig: recConfig,
            });
          }
          return { personalizedHtml, personalizedSubject };
        };

        // === A/B: build items for both variants and enqueue ===
        const abItems: Array<any> = [];
        for (const sub of groupA) {
          try {
            const { personalizedHtml, personalizedSubject } = await personalizeForSub(sub, baseHtml, campaign.subject);
            abItems.push({
              client_id, campaign_id, flow_id: null, subscriber_id: sub.id,
              subject: personalizedSubject, html_content: personalizedHtml,
              from_email: fromEmail, from_name: fromName, reply_to: campaign.reply_to || null,
              ab_variant: 'a' as const, priority: 5,
            });
          } catch (err) { console.error('[A/B enqueue A] error:', err); }
        }
        for (const sub of groupB) {
          try {
            const { personalizedHtml, personalizedSubject } = await personalizeForSub(sub, variantBHtml, variantBSubject);
            abItems.push({
              client_id, campaign_id, flow_id: null, subscriber_id: sub.id,
              subject: personalizedSubject, html_content: personalizedHtml,
              from_email: fromEmail, from_name: fromName, reply_to: campaign.reply_to || null,
              ab_variant: 'b' as const, priority: 5,
            });
          } catch (err) { console.error('[A/B enqueue B] error:', err); }
        }
        let enqueuedAb = 0;
        try {
          enqueuedAb = await enqueueCampaignItems(supabase, abItems);
        } catch (err) {
          console.error('[manage-campaigns] A/B enqueue failed:', err);
          // Rollback A/B test record (status pending → cancel) para permitir reintento.
          await supabase
            .from('email_ab_tests')
            .update({ status: 'cancelled', test_started_at: null })
            .eq('id', abTest.id);
          return c.json({ error: 'No se pudo encolar la campaña A/B', details: (err as Error).message }, 500);
        }

        // Schedule Cloud Task to pick winner after test_duration_hours + safety
        // margin de 10 min para que el cron tick tenga tiempo de drenar la cola
        // antes de medir open/click rates.
        try {
          const baseHours = abTest.test_duration_hours || 4;
          const winnerTime = new Date(Date.now() + baseHours * 3600 * 1000 + 10 * 60 * 1000);
          await scheduleAbTestWinner(abTest.id, client_id, winnerTime);
        } catch (err) {
          console.error('Failed to schedule A/B test winner task:', err);
        }

        // Campaña queda en 'sending' — el send-queue 'process' handler la
        // transiciona a 'sent' cuando la cola está drenada (C1 sweep).
        await supabase
          .from('email_campaigns')
          .update({
            status: 'sending',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaign_id);

        return c.json({
          success: true,
          ab_test: true,
          queued: true,
          enqueued: enqueuedAb,
          remaining: remainder.length,
        });
      }

      // === Normal send (no A/B test) — todo a la cola ===
      // Smart send time: si el sub tiene send_time_hour distinto a la hora UTC
      // actual, scheduled_for se difiere a la próxima ocurrencia de esa hora.
      // Si no tiene send_time_hour (o coincide), scheduled_for=now y el cron
      // lo procesa en el próximo tick.
      const nowUtcHour = new Date().getUTCHours();
      const items: Array<any> = [];
      let smartSendCount = 0;

      for (const sub of subscribers) {
        try {
          const ctx = buildTemplateContext(
            { first_name: sub.first_name ?? undefined, last_name: sub.last_name ?? undefined, email: sub.email, tags: sub.tags, total_orders: sub.total_orders, total_spent: sub.total_spent, last_order_at: sub.last_order_at ?? undefined, custom_fields: sub.custom_fields ?? undefined },
            { discount_code: campaign.recommendation_config?.discount_code },
            brandInfo,
            []
          );
          let personalizedHtml = usesNunjucks ? renderEmailTemplate(baseHtml, ctx) : baseHtml;
          const personalizedSubject = usesNunjucks ? renderEmailTemplate(campaign.subject, ctx) : campaign.subject;
          const hasCustomBlocks = personalizedHtml.includes('data-steve-') || personalizedHtml.includes('product_recommendations');
          if (hasCustomBlocks) {
            personalizedHtml = await processEmailHtml(personalizedHtml, {
              clientId: client_id, subscriberId: sub.id, templateContext: ctx, recommendationConfig: recConfig,
            });
          }

          let scheduledFor: string | undefined;
          if (sub.send_time_hour != null && sub.send_time_hour !== nowUtcHour) {
            const target = new Date();
            target.setUTCHours(sub.send_time_hour, 0, 0, 0);
            if (target.getTime() <= Date.now()) target.setUTCDate(target.getUTCDate() + 1);
            scheduledFor = target.toISOString();
            smartSendCount++;
          }

          items.push({
            client_id,
            campaign_id,
            flow_id: null,
            subscriber_id: sub.id,
            subject: personalizedSubject,
            html_content: personalizedHtml,
            from_email: fromEmail,
            from_name: fromName,
            reply_to: campaign.reply_to || null,
            ab_variant: null,
            priority: 5,
            ...(scheduledFor ? { scheduled_for: scheduledFor } : {}),
          });
        } catch (err) {
          console.error(`[manage-campaigns] queue build error for sub ${sub.id}:`, err);
        }
      }

      let queued = 0;
      try {
        queued = await enqueueCampaignItems(supabase, items);
      } catch (err) {
        console.error('[manage-campaigns] enqueue failed:', err);
        // No tocamos el status — la campaña queda en su estado original
        // (draft/scheduled) y puede reintentarse.
        return c.json({ error: 'No se pudo encolar la campaña', details: (err as Error).message }, 500);
      }

      // Campaña queda en 'sending' — el send-queue 'process' handler la
      // transiciona a 'sent' cuando la cola está drenada (C1 sweep).
      await supabase
        .from('email_campaigns')
        .update({
          status: 'sending',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign_id);

      // creative_history: trackear cuántos items se encolaron (no enviados).
      // El sweep final en send-queue debería reconciliar sent_count real.
      try {
        await supabase
          .from('creative_history')
          .update({ sent_count: queued })
          .eq('entity_id', campaign_id)
          .eq('entity_type', 'email_campaign');
      } catch (chErr) { console.error('[manage-campaigns] creative_history send update error:', chErr); }

      return c.json({
        success: true,
        queued: true,
        total_recipients: subscribers.length,
        queued_count: queued,
        smart_send_count: smartSendCount,
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
      const client = await safeQuerySingleOrDefault<any>(
        supabase
          .from('clients')
          .select('name, logo_url, brand_color, brand_secondary_color, brand_font, website_url')
          .eq('id', client_id)
          .single(),
        null,
        'manageCampaigns.getClientBrand.getClient',
      );

      if (!client) return c.json({ error: 'Client not found' }, 404);

      // Fetch store_name from platform_connections for sender defaults
      const conn = await safeQuerySingleOrDefault<any>(
        supabase
          .from('platform_connections')
          .select('store_name')
          .eq('client_id', client_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        null,
        'manageCampaigns.getClientBrand.getConnection',
      );

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

function resolveRelativeValue(value: any): any {
  if (typeof value !== 'string') return value;
  const relMatch = value.match(/^relative:(\d+)d$/);
  if (relMatch) {
    return new Date(Date.now() - parseInt(relMatch[1], 10) * 24 * 60 * 60 * 1000).toISOString();
  }
  const legacyMatch = value.match(/^(\d+)_days_ago$/);
  if (legacyMatch) {
    return new Date(Date.now() - parseInt(legacyMatch[1], 10) * 24 * 60 * 60 * 1000).toISOString();
  }
  return value;
}

/**
 * Get subscribers matching audience filter.
 * Supports: { type: 'all' }, { type: 'list', list_id }, { type: 'segment', segment_id },
 * and legacy flat filters (source, tags, min_orders, etc.)
 */
async function getFilteredSubscribers(
  supabase: any,
  clientId: string,
  filter: any
): Promise<Array<{ id: string; email: string; first_name: string | null; last_name: string | null; tags: string[]; total_orders: number; total_spent: number; last_order_at: string | null; custom_fields: Record<string, any> | null; send_time_hour: number | null; timezone: string | null }>> {

  // Campos que siempre viajamos. send_time_hour y timezone se incluyen para que
  // el motor de envío pueda aplicar smart send time y quiet hours correctamente.
  const SUBSCRIBER_COLS = 'id, email, first_name, last_name, tags, total_orders, total_spent, last_order_at, custom_fields, send_time_hour, timezone';

  // --- Type: list → join email_list_members ---
  if (filter?.type === 'list' && filter.list_id) {
    const { data: members, error: memErr } = await supabase
      .from('email_list_members')
      .select('subscriber_id')
      .eq('list_id', filter.list_id);

    if (memErr || !members || members.length === 0) {
      console.error('Failed to query list members or list is empty:', memErr);
      return [];
    }

    const subscriberIds = members.map((m: any) => m.subscriber_id);
    const { data, error } = await supabase
      .from('email_subscribers')
      .select(SUBSCRIBER_COLS)
      .eq('client_id', clientId)
      .eq('status', 'subscribed')
      .in('id', subscriberIds);

    if (error) {
      console.error('Failed to query subscribers for list:', error);
      return [];
    }
    return data || [];
  }

  // --- Type: segment → load segment filters and apply ---
  if (filter?.type === 'segment' && filter.segment_id) {
    const { data: segment, error: segErr } = await supabase
      .from('email_lists')
      .select('filters')
      .eq('id', filter.segment_id)
      .eq('client_id', clientId)
      .single();

    if (segErr || !segment) {
      console.error('Failed to load segment:', segErr);
      return [];
    }

    // Build query from segment filters
    let query = supabase
      .from('email_subscribers')
      .select(SUBSCRIBER_COLS)
      .eq('client_id', clientId)
      .eq('status', 'subscribed');

    const segFilters = segment.filters || [];
    const numericFields = ['total_orders', 'total_spent'];
    for (const f of segFilters) {
      const { field, operator } = f;
      let value = resolveRelativeValue(f.value);
      // Numeric conversion for integer/numeric columns
      if (numericFields.includes(field) && value != null && operator !== 'is_null' && operator !== 'not_null') {
        value = Number(value);
      }
      switch (operator) {
        case 'gte': case '>=': query = query.gte(field, value); break;
        case 'lte': case '<=': query = query.lte(field, value); break;
        case 'gt': case '>': query = query.gt(field, value); break;
        case 'lt': case '<': query = query.lt(field, value); break;
        case 'eq': case '=': case '==': query = query.eq(field, value); break;
        case 'neq': case '!=': query = query.neq(field, value); break;
        case 'like': query = query.ilike(field, `%${value}%`); break;
        case 'is_null': query = query.is(field, null); break;
        case 'not_null': query = query.not(field, 'is', null); break;
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('Failed to query subscribers for segment:', error);
      return [];
    }
    return data || [];
  }

  // --- Type: all or legacy flat filters ---
  let query = supabase
    .from('email_subscribers')
    .select(SUBSCRIBER_COLS)
    .eq('client_id', clientId)
    .eq('status', 'subscribed');

  // Apply legacy flat filters (backward compatible)
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
  const campaign = await safeQuerySingleOrDefault<any>(
    supabase
      .from('email_campaigns')
      .select('status')
      .eq('id', campaign_id)
      .eq('client_id', client_id)
      .single(),
    null,
    'executeScheduledCampaign.getCampaign',
  );

  if (!campaign || campaign.status !== 'scheduled') {
    console.log(`Campaign ${campaign_id} is no longer scheduled (status: ${campaign?.status}). Skipping.`);
    return c.json({ skipped: true, reason: 'Campaign is no longer scheduled' });
  }

  // Reuse the send logic by calling the manage function internally
  // This is a simplified version - in practice, you'd extract the send logic

  // Fetch the campaign's user_id so the ownership check in manageEmailCampaigns passes
  const { data: campaignOwner } = await supabase
    .from('clients')
    .select('user_id')
    .eq('id', client_id)
    .maybeSingle();

  const fakeStore: Record<string, any> = {
    user: { id: campaignOwner?.user_id || 'scheduled-system', email: 'scheduled@steve.cl' },
  };

  const fakeContext = {
    req: {
      json: async () => ({ action: 'send', client_id, campaign_id }),
    },
    json: (data: any, status?: number) => c.json(data, status as any),
    get: (key: string) => fakeStore[key],
    set: (key: string, value: any) => { fakeStore[key] = value; },
  } as any;

  return manageEmailCampaigns(fakeContext);
}
