/**
 * WA Action Processor — Cron endpoint that processes pending WhatsApp actions.
 *
 * Replaces fire-and-forget setTimeout calls that die on Cloud Run.
 * Runs every 60s via OpenClaw. Picks up pending actions, executes them,
 * marks completed or retries (max 3). After 3 failures → sends fallback msg.
 *
 * Route: POST /api/cron/wa-action-processor
 * Auth: X-Cron-Secret (no JWT)
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp, sendWhatsAppMedia } from '../../lib/twilio-client.js';
import { loadIndustryCaseStudy } from '../../lib/steve-wa-brain.js';
import { generateProspectMockup } from '../../lib/steve-mockup-generator.js';
import { generateAndSendSalesDeck } from '../../lib/steve-sales-deck.js';
import type { ProspectRecord } from '../../lib/steve-wa-brain.js';

const STEVE_WA_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.STEVE_WA_NUMBER || '';
const MEETING_LINK = 'https://meetings.hubspot.com/jose-manuel15';

export async function waActionProcessor(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret')?.trim();
  const expected = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  // Bug #39 fix: generate a unique batch ID so this instance only processes its own claims
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Bug #39 fix: UPDATE first with WHERE status='pending' to atomically claim actions,
  // preventing two cron instances from picking the same pending actions.
  const { error: claimError } = await supabase
    .from('wa_pending_actions')
    .update({ status: 'processing', started_at: now, error_message: `batch:${batchId}` })
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (claimError) {
    console.error('[wa-action-processor] Claim error:', claimError.message);
    return c.json({ error: claimError.message }, 500);
  }

  // Now SELECT only the actions claimed by this batch
  const { data: actions, error } = await supabase
    .from('wa_pending_actions')
    .select('*')
    .eq('status', 'processing')
    .eq('error_message', `batch:${batchId}`)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (error) {
    console.error('[wa-action-processor] Query error:', error.message);
    return c.json({ error: error.message }, 500);
  }

  if (!actions || actions.length === 0) {
    return c.json({ processed: 0 });
  }

  let processed = 0;
  let failed = 0;

  for (const action of actions) {
    // Bug #55 fix: update attempts counter and clear the batch marker.
    // The action is already in 'processing' status from the claim step above.
    const { count: updatedRows } = await supabase
      .from('wa_pending_actions')
      .update({ attempts: action.attempts + 1, error_message: null })
      .eq('id', action.id)
      .eq('status', 'processing');

    // Bug #55 fix: if no rows were updated, another instance already handled it — skip
    if (updatedRows === 0) {
      console.warn(`[wa-action-processor] Action ${action.id} already claimed by another instance, skipping`);
      continue;
    }

    try {
      await executeAction(action, supabase);

      // Mark completed
      await supabase
        .from('wa_pending_actions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', action.id);

      processed++;
      console.log(`[wa-action-processor] Completed: ${action.action_type} for ${action.phone}`);
    } catch (err: any) {
      const attempts = action.attempts + 1;
      const maxAttempts = action.max_attempts || 3;

      if (attempts >= maxAttempts) {
        // Max retries exhausted → send fallback message and mark failed
        await supabase
          .from('wa_pending_actions')
          .update({
            status: 'failed',
            error_message: err.message || 'Unknown error',
            completed_at: new Date().toISOString(),
          })
          .eq('id', action.id);

        // Send fallback message to prospect
        try {
          await sendWhatsApp(
            `+${action.phone}`,
            `No pude generarlo en este momento, pero agenda una reunión rápida y te lo mostramos en vivo: ${MEETING_LINK}`,
          );
          await saveOutboundMessage(supabase, action.phone, action.payload?.profileName,
            `No pude generarlo en este momento, pero agenda una reunión rápida y te lo mostramos en vivo: ${MEETING_LINK}`);
        } catch (fallbackErr) {
          console.error('[wa-action-processor] Fallback msg failed:', fallbackErr);
        }

        failed++;
        console.error(`[wa-action-processor] Failed after ${attempts} attempts: ${action.action_type} for ${action.phone}: ${err.message}`);
      } else {
        // Retry — put back to pending with exponential backoff
        const backoffSeconds = Math.pow(2, attempts) * 30; // 60s, 120s, 240s
        const nextSchedule = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        await supabase
          .from('wa_pending_actions')
          .update({
            status: 'pending',
            scheduled_at: nextSchedule,
            error_message: err.message || 'Unknown error',
          })
          .eq('id', action.id);

        console.warn(`[wa-action-processor] Retry ${attempts}/${maxAttempts}: ${action.action_type} for ${action.phone} (next: ${nextSchedule})`);
      }
    }
  }

  return c.json({ processed, failed, total: actions.length });
}

// ---------------------------------------------------------------------------
// Action execution dispatcher
// ---------------------------------------------------------------------------

async function executeAction(action: any, supabase: any): Promise<void> {
  const phone = action.phone;
  const payload = action.payload || {};

  switch (action.action_type) {
    case 'split_message':
      await handleSplitMessage(phone, payload, supabase);
      break;

    case 'generate_copy':
      await handleGenerateCopy(phone, payload, supabase);
      break;

    case 'send_case_study':
      await handleSendCaseStudy(phone, payload, supabase);
      break;

    case 'send_mockup':
      await handleSendMockup(phone, payload, supabase);
      break;

    case 'send_deck':
      await handleSendDeck(phone, payload, supabase);
      break;

    case 'send_video_demo':
      await handleSendVideoDemo(phone, payload, supabase);
      break;

    default:
      throw new Error(`Unknown action type: ${action.action_type}`);
  }
}

// ---------------------------------------------------------------------------
// Individual action handlers
// ---------------------------------------------------------------------------

async function handleSplitMessage(phone: string, payload: any, supabase: any): Promise<void> {
  const body = payload.body;
  if (!body) return;

  await sendWhatsApp(`+${phone}`, body);
  await saveOutboundMessage(supabase, phone, payload.profileName, body);
}

async function handleGenerateCopy(phone: string, payload: any, supabase: any): Promise<void> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('Missing ANTHROPIC_API_KEY');

  const industry = payload.whatTheySell || 'e-commerce';
  const copyDesc = payload.copyDescription || 'anuncio genérico';

  const copyRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Genera un copy de anuncio de Meta Ads para una marca de ${industry}. Descripción: ${copyDesc}. Formato:\n🎯 Headline: ...\n📝 Texto principal: ...\n🔗 Descripción: ...\n📲 CTA: ...\nMáximo 300 caracteres total. Español neutro.`,
      }],
    }),
  });

  if (!copyRes.ok) throw new Error(`Claude API error: ${copyRes.status}`);
  const copyData: any = await copyRes.json();
  const copyText = (copyData.content?.[0]?.text || '').trim();
  if (!copyText) throw new Error('Empty copy response');

  const msg = `Acá te va un ejemplo de copy gratis:\n\n${copyText}`;
  await sendWhatsApp(`+${phone}`, msg);
  await saveOutboundMessage(supabase, phone, payload.profileName, msg);
}

async function handleSendCaseStudy(phone: string, payload: any, supabase: any): Promise<void> {
  const caseStudy = await loadIndustryCaseStudy(payload.whatTheySell);
  // Bug #56 fix: throw error instead of silently returning so action gets marked as 'failed'
  if (!caseStudy) {
    throw new Error(`No case study found for industry: ${payload.whatTheySell || 'unknown'}`);
  }

  const msg = `${caseStudy.title}\n\n${caseStudy.summary}`;
  if (caseStudy.mediaUrl) {
    await sendWhatsAppMedia(`+${phone}`, msg, caseStudy.mediaUrl);
  } else {
    await sendWhatsApp(`+${phone}`, msg);
  }
  await saveOutboundMessage(supabase, phone, payload.profileName, msg);
}

async function handleSendMockup(phone: string, payload: any, supabase: any): Promise<void> {
  // Load prospect from DB
  const prospect = await loadProspect(supabase, payload.prospectId || phone);
  if (!prospect) throw new Error('Prospect not found');

  await generateProspectMockup(prospect, phone, payload.profileName);
}

async function handleSendDeck(phone: string, payload: any, supabase: any): Promise<void> {
  const prospect = await loadProspect(supabase, payload.prospectId || phone);
  if (!prospect) throw new Error('Prospect not found');

  const success = await generateAndSendSalesDeck(prospect, phone, payload.profileName);
  if (!success) throw new Error('Deck generation failed');
}

async function handleSendVideoDemo(phone: string, payload: any, supabase: any): Promise<void> {
  const DEMO_VIDEO_URL = process.env.STEVE_DEMO_VIDEO_URL;
  if (!DEMO_VIDEO_URL) {
    // No video URL configured — send a text fallback
    const msg = `Puedes ver Steve en acción agendando una demo personalizada con tus datos: ${MEETING_LINK}`;
    await sendWhatsApp(`+${phone}`, msg);
    await saveOutboundMessage(supabase, phone, payload.profileName, msg);
    return;
  }

  const msg = `Acá puedes ver Steve en acción (video de 2 min): ${DEMO_VIDEO_URL}`;
  await sendWhatsApp(`+${phone}`, msg);
  await saveOutboundMessage(supabase, phone, payload.profileName, msg);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadProspect(supabase: any, idOrPhone: string): Promise<ProspectRecord | null> {
  // Try by ID first
  let { data } = await supabase
    .from('wa_prospects')
    .select('*')
    .eq('id', idOrPhone)
    .maybeSingle();

  if (data) return data;

  // Fallback: try by phone
  ({ data } = await supabase
    .from('wa_prospects')
    .select('*')
    .eq('phone', idOrPhone)
    .maybeSingle());

  return data || null;
}

async function saveOutboundMessage(
  supabase: any,
  phone: string,
  profileName: string | null | undefined,
  body: string,
): Promise<void> {
  await supabase.from('wa_messages').insert({
    client_id: null,
    channel: 'prospect',
    direction: 'outbound',
    from_number: STEVE_WA_NUMBER,
    to_number: phone,
    body,
    contact_name: profileName || phone,
    contact_phone: phone,
  });
}
