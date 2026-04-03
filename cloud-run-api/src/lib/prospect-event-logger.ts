import { getSupabaseAdmin } from './supabase.js';

/**
 * Fire-and-forget event logger for prospect timeline.
 * Call without await in most cases.
 */
export async function logProspectEvent(
  prospectId: string,
  eventType: string,
  eventData: Record<string, any> = {},
  createdBy: string = 'system',
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('wa_prospect_events')
      .insert({
        prospect_id: prospectId,
        event_type: eventType,
        event_data: eventData,
        created_by: createdBy,
      });

    if (error) console.error('[event-logger] Insert failed:', error.message);
  } catch (err: any) {
    console.error('[event-logger] Error:', err?.message || err);
  }
}
