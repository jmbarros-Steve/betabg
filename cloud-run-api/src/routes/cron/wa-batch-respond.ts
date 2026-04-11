/**
 * WA Batch Respond — Processes accumulated messages for prospects during rate limit.
 *
 * Instead of silently ignoring messages that arrive within the rate limit window,
 * this endpoint collects them and responds to ALL accumulated messages at once.
 *
 * Two modes:
 * 1. Self-trigger: POST with { phone } — processes only that phone (called by setTimeout)
 * 2. Cron safety net: POST without phone — processes all pending batch_respond actions
 *
 * Route: POST /api/cron/wa-batch-respond
 * Auth: X-Cron-Secret (no JWT)
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import {
  getProspectHistory,
  buildDynamicSalesPrompt,
  type ProspectRecord,
} from '../../lib/steve-wa-brain.js';
import { runInvestigator, runStrategist, runConversationalist } from '../../lib/steve-multi-brain.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

const STEVE_WA_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.STEVE_WA_NUMBER || '';

export async function waBatchRespond(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    // No body = cron mode (process all)
  }

  const targetPhone = body?.phone || null;

  // Select pending batch_respond actions whose scheduled_at has passed
  let query = supabase
    .from('wa_pending_actions')
    .select('id, phone, payload, scheduled_at')
    .eq('action_type', 'batch_respond')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (targetPhone) {
    query = query.eq('phone', targetPhone);
  }

  const { data: pendingBatches, error: selectErr } = await query;

  if (selectErr) {
    console.error('[wa-batch-respond] Select error:', selectErr.message);
    return c.json({ error: selectErr.message }, 500);
  }

  if (!pendingBatches || pendingBatches.length === 0) {
    return c.json({ processed: 0 });
  }

  // Atomic claim — set status to 'processing' to prevent double-processing
  const batchIds = pendingBatches.map((b: any) => b.id);
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await supabase
    .from('wa_pending_actions')
    .update({ status: 'processing', started_at: now, error_message: `batch:${batchId}` })
    .in('id', batchIds)
    .eq('status', 'pending');

  // Re-select only the ones we claimed
  const { data: claimedBatches } = await supabase
    .from('wa_pending_actions')
    .select('id, phone, payload')
    .eq('status', 'processing')
    .eq('error_message', `batch:${batchId}`);

  if (!claimedBatches || claimedBatches.length === 0) {
    return c.json({ processed: 0, note: 'All claimed by another instance' });
  }

  let processed = 0;
  let failed = 0;

  for (const batch of claimedBatches) {
    try {
      await processBatchForPhone(supabase, batch.phone, batch.payload?.profileName);

      // Mark completed
      await supabase
        .from('wa_pending_actions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', batch.id);

      processed++;
      console.log(`[wa-batch-respond] Completed batch for ${batch.phone}`);
    } catch (err: any) {
      console.error(`[wa-batch-respond] Failed for ${batch.phone}:`, err.message);

      // Mark failed — don't retry batch responds (the messages are already saved)
      await supabase
        .from('wa_pending_actions')
        .update({
          status: 'failed',
          error_message: err.message || 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', batch.id);

      failed++;
    }
  }

  return c.json({ processed, failed, total: claimedBatches.length });
}

/**
 * Process all unresponded inbound messages for a phone number.
 * Loads messages, runs multi-brain pipeline, sends response via sendWhatsApp.
 */
async function processBatchForPhone(
  supabase: any,
  phone: string,
  profileName?: string,
): Promise<void> {
  // Load prospect
  const { data: prospect } = await supabase
    .from('wa_prospects')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (!prospect) {
    console.warn(`[wa-batch-respond] No prospect found for ${phone}`);
    return;
  }

  // Load conversation history
  const history = await getProspectHistory(phone, 20);

  if (history.length === 0) {
    console.warn(`[wa-batch-respond] No history for ${phone}`);
    return;
  }

  // Get the last user message for context
  const lastUserMsg = history.filter(m => m.role === 'user').slice(-1)[0]?.content || '';

  // Sanitize messages for Claude (merge consecutive same-role, ensure starts with user)
  const sanitized = sanitizeMessages(history);

  // Run the multi-brain pipeline
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Missing ANTHROPIC_API_KEY');
  }

  let replyText = '';

  try {
    // Step 1: Investigator + Dynamic Prompt in parallel
    const [investigatorResults, promptResult] = await Promise.all([
      runInvestigator(prospect),
      buildDynamicSalesPrompt(prospect, lastUserMsg, history),
    ]);

    // Step 2: Strategist
    const safeInvestigatorResults = (investigatorResults && investigatorResults.investigationContext)
      ? investigatorResults
      : { ruleIds: [], investigationContext: '', competitorInsights: '', salesLearnings: '' };
    const strategistBriefRaw = await runStrategist(prospect, history, safeInvestigatorResults);
    const strategistBrief = (strategistBriefRaw?.brief?.trim()?.length ?? 0) > 20
      ? strategistBriefRaw
      : { ...strategistBriefRaw, brief: '' };

    // Step 3: Conversationalist
    replyText = await runConversationalist(history, strategistBrief, promptResult.prompt, sanitized);
  } catch (multiBrainErr) {
    console.error('[wa-batch-respond] Multi-brain failed, using simple prompt:', multiBrainErr);
    // Fallback: just acknowledge we received their messages
    replyText = 'Perdón por la demora! Vi tus mensajes. ¿En qué te puedo ayudar?';
  }

  // Clean up response
  replyText = replyText
    .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
    .replace(/\[[A-Z_]+(?::[^\]]*)?\]/g, '') // strip action tags
    .trim();

  if (!replyText) {
    replyText = 'Hola! Vi tus mensajes. ¿Me cuentas más?';
  }

  // Cap at WhatsApp limit
  if (replyText.length > 4096) {
    replyText = replyText.slice(0, 4090) + '...[+]';
  }

  // Send via Twilio (not TwiML — this is async, not a webhook response)
  await sendWhatsApp(`+${phone}`, replyText);

  // Save outbound message
  await supabase.from('wa_messages').insert({
    client_id: null,
    channel: 'prospect',
    direction: 'outbound',
    from_number: STEVE_WA_NUMBER,
    to_number: phone,
    body: replyText,
    contact_name: profileName || phone,
    contact_phone: phone,
    metadata: { batch_response: true },
  });

  console.log(`[wa-batch-respond] Sent batch response to ${phone}: ${replyText.slice(0, 80)}...`);
}

/**
 * Sanitize messages for Claude API (merge consecutive same-role, ensure starts with user).
 */
function sanitizeMessages(
  msgs: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (msgs.length === 0) return [{ role: 'user', content: 'Hola' }];

  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const validMsgs = msgs.filter(m => m.content != null && String(m.content).trim() !== '');

  for (const msg of validMsgs) {
    const content = String(msg.content || '');
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += '\n' + content;
    } else {
      merged.push({ role: msg.role, content });
    }
  }

  const result = merged.filter(m => m.content.trim() !== '');
  while (result.length > 0 && result[0].role !== 'user') {
    result.shift();
  }
  if (result.length === 0) return [{ role: 'user', content: 'Hola' }];

  if (result[result.length - 1].role !== 'user') {
    result.push({ role: 'user', content: '(continúa)' });
  }

  return result;
}
