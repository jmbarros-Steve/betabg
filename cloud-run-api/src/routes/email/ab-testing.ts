import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendSingleEmail } from './send-email.js';

/**
 * Calculate stats for a specific A/B variant.
 */
async function calculateVariantStats(
  supabase: any,
  campaignId: string,
  variant: 'a' | 'b'
): Promise<{
  sent: number;
  opens: number;
  clicks: number;
  conversions: number;
  revenue: number;
  open_rate: string;
  click_rate: string;
}> {
  const { count: sent } = await supabase
    .from('email_events')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('event_type', 'sent')
    .eq('ab_variant', variant);

  const { count: opens } = await supabase
    .from('email_events')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('event_type', 'opened')
    .eq('ab_variant', variant);

  const { count: clicks } = await supabase
    .from('email_events')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('event_type', 'clicked')
    .eq('ab_variant', variant);

  const { data: conversionEvents } = await supabase
    .from('email_events')
    .select('metadata')
    .eq('campaign_id', campaignId)
    .eq('event_type', 'converted')
    .eq('ab_variant', variant);

  const conversions = conversionEvents?.length || 0;
  const revenue = (conversionEvents || []).reduce(
    (sum: number, e: any) => sum + (parseFloat(e.metadata?.revenue) || 0),
    0
  );

  const sentCount = sent || 0;
  const openCount = opens || 0;
  const clickCount = clicks || 0;

  return {
    sent: sentCount,
    opens: openCount,
    clicks: clickCount,
    conversions,
    revenue,
    open_rate: sentCount > 0 ? ((openCount / sentCount) * 100).toFixed(1) : '0.0',
    click_rate: sentCount > 0 ? ((clickCount / sentCount) * 100).toFixed(1) : '0.0',
  };
}

/**
 * A/B testing for email campaigns.
 * POST /api/email-ab-testing
 */
export async function emailAbTesting(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'create_test': {
      const {
        campaign_id,
        variant_b_subject,
        variant_b_preview_text,
        variant_b_html_content,
        variant_b_design_json,
        test_percentage = 20,
        winning_metric = 'open_rate',
        test_duration_hours = 4,
      } = body;

      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      const { data, error } = await supabase
        .from('email_ab_tests')
        .insert({
          client_id,
          campaign_id,
          variant_b_subject: variant_b_subject || null,
          variant_b_preview_text: variant_b_preview_text || null,
          variant_b_html_content: variant_b_html_content || null,
          variant_b_design_json: variant_b_design_json || null,
          test_percentage,
          winning_metric,
          test_duration_hours,
          status: 'pending',
        })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, test: data });
    }

    case 'get_test': {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      const { data, error } = await supabase
        .from('email_ab_tests')
        .select('*')
        .eq('campaign_id', campaign_id)
        .eq('client_id', client_id)
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ test: data });
    }

    case 'get_results': {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      const { data: test, error: testErr } = await supabase
        .from('email_ab_tests')
        .select('*')
        .eq('campaign_id', campaign_id)
        .eq('client_id', client_id)
        .single();

      if (testErr || !test) return c.json({ error: 'Test not found' }, 404);

      const variantA = await calculateVariantStats(supabase, campaign_id, 'a');
      const variantB = await calculateVariantStats(supabase, campaign_id, 'b');

      return c.json({
        test,
        results: {
          variant_a: variantA,
          variant_b: variantB,
        },
      });
    }

    case 'delete_test': {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      const { error } = await supabase
        .from('email_ab_tests')
        .delete()
        .eq('campaign_id', campaign_id)
        .eq('client_id', client_id);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

/**
 * Execute A/B test winner selection and send to remaining subscribers.
 * Called by Cloud Tasks after test_duration_hours.
 * POST /api/execute-ab-test-winner
 */
export async function executeAbTestWinner(c: Context) {
  const body = await c.req.json();
  const { test_id, client_id } = body;

  if (!test_id || !client_id) {
    return c.json({ error: 'test_id and client_id are required' }, 400);
  }

  const supabase = getSupabaseAdmin();

  // Fetch the test
  const { data: test, error: testErr } = await supabase
    .from('email_ab_tests')
    .select('*')
    .eq('id', test_id)
    .eq('client_id', client_id)
    .single();

  if (testErr || !test) return c.json({ error: 'Test not found' }, 404);

  if (test.status !== 'testing') {
    console.log(`A/B test ${test_id} is not in testing state (status: ${test.status}). Skipping.`);
    return c.json({ skipped: true, reason: 'Test is not in testing state' });
  }

  // Calculate stats for both variants
  const variantAStats = await calculateVariantStats(supabase, test.campaign_id, 'a');
  const variantBStats = await calculateVariantStats(supabase, test.campaign_id, 'b');

  // Select winner based on winning_metric
  let winner: 'a' | 'b';
  switch (test.winning_metric) {
    case 'click_rate': {
      const aRate = parseFloat(variantAStats.click_rate);
      const bRate = parseFloat(variantBStats.click_rate);
      winner = bRate > aRate ? 'b' : 'a';
      break;
    }
    case 'revenue': {
      winner = variantBStats.revenue > variantAStats.revenue ? 'b' : 'a';
      break;
    }
    case 'open_rate':
    default: {
      const aRate = parseFloat(variantAStats.open_rate);
      const bRate = parseFloat(variantBStats.open_rate);
      winner = bRate > aRate ? 'b' : 'a';
      break;
    }
  }

  // Update test with winner
  await supabase
    .from('email_ab_tests')
    .update({
      winner,
      status: 'winner_selected',
      winner_selected_at: new Date().toISOString(),
    })
    .eq('id', test_id);

  // Get the campaign for variant A content
  const { data: campaign, error: campErr } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', test.campaign_id)
    .eq('client_id', client_id)
    .single();

  if (campErr || !campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  // Determine winning content
  const winningSubject = winner === 'b' && test.variant_b_subject
    ? test.variant_b_subject
    : campaign.subject;
  const winningHtml = winner === 'b' && test.variant_b_html_content
    ? test.variant_b_html_content
    : campaign.html_content;

  // Get subscriber IDs already in email_events for this campaign (already received test emails)
  const { data: alreadySentEvents } = await supabase
    .from('email_events')
    .select('subscriber_id')
    .eq('campaign_id', test.campaign_id)
    .eq('event_type', 'sent');

  const alreadySentIds = new Set((alreadySentEvents || []).map((e: any) => e.subscriber_id));

  // Get all subscribed subscribers for this client
  const { data: allSubscribers } = await supabase
    .from('email_subscribers')
    .select('id, email, first_name')
    .eq('client_id', client_id)
    .eq('status', 'subscribed');

  // Filter to remaining subscribers not already sent
  const remainingSubscribers = (allSubscribers || []).filter(
    (sub: any) => !alreadySentIds.has(sub.id)
  );

  // Send winning variant to remaining subscribers in batches of 10
  const fromEmail = campaign.from_email || `noreply@${process.env.DEFAULT_FROM_DOMAIN || 'steve.cl'}`;
  const fromName = campaign.from_name || 'Steve';
  const batchSize = 10;

  for (let i = 0; i < remainingSubscribers.length; i += batchSize) {
    const batch = remainingSubscribers.slice(i, i + batchSize);

    const promises = batch.map((sub: any) =>
      sendSingleEmail({
        to: sub.email,
        subject: winningSubject,
        htmlContent: winningHtml,
        fromEmail,
        fromName,
        replyTo: campaign.reply_to || undefined,
        subscriberId: sub.id,
        clientId: client_id,
        campaignId: test.campaign_id,
      })
    );

    await Promise.all(promises);
  }

  // Update test status to completed
  await supabase
    .from('email_ab_tests')
    .update({ status: 'completed' })
    .eq('id', test_id);

  return c.json({
    success: true,
    winner,
    variant_a_stats: variantAStats,
    variant_b_stats: variantBStats,
    remaining_sent: remainingSubscribers.length,
  });
}
