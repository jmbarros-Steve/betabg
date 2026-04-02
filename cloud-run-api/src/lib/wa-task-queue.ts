/**
 * WA Task Queue — Persistent queue for async WhatsApp actions.
 * Replaces setTimeout fire-and-forget that dies when Cloud Run closes the request.
 *
 * Usage: enqueueWAAction(phone, 'split_message', { body: '...' }, 2)
 * The wa-action-processor cron picks it up within ~60s and executes it.
 */

import { getSupabaseAdmin } from './supabase.js';

export type WAActionType =
  | 'split_message'
  | 'generate_copy'
  | 'send_case_study'
  | 'send_mockup'
  | 'send_deck'
  | 'send_video_demo';

export interface WAActionPayload {
  body?: string;
  profileName?: string;
  prospectId?: string;
  whatTheySell?: string;
  copyDescription?: string;
  // For send_mockup: prospect data is loaded from DB by prospectId
  // For send_deck: prospect data is loaded from DB by prospectId
  [key: string]: any;
}

/**
 * Enqueue an async WhatsApp action to be processed by the cron.
 * @param phone - Phone number (without +)
 * @param actionType - Type of action to execute
 * @param payload - JSON payload with action-specific data
 * @param delaySeconds - How many seconds to wait before executing (0 = ASAP)
 */
export async function enqueueWAAction(
  phone: string,
  actionType: WAActionType,
  payload: WAActionPayload,
  delaySeconds: number = 0,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const scheduledAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

  const { data, error } = await supabase
    .from('wa_pending_actions')
    .insert({
      phone,
      action_type: actionType,
      payload,
      status: 'pending',
      scheduled_at: scheduledAt,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[wa-task-queue] Failed to enqueue action:', error.message);
    return null;
  }

  console.log(`[wa-task-queue] Enqueued ${actionType} for ${phone} (delay: ${delaySeconds}s, id: ${data.id})`);
  return data.id;
}
