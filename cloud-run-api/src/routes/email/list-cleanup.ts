import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';

/**
 * Auto-cleanup: detect inactive subscribers and manage sunset segment.
 * POST /api/email-list-cleanup
 *
 * Actions:
 *   - detect: Find subscribers with 0 engagement in N days (default 90)
 *   - preview: Show who would be affected before taking action
 *   - sunset: Tag inactive subscribers as "sunset" and optionally unsubscribe
 *   - reactivate: Move sunset subscribers back to active if they re-engage
 *   - stats: Get cleanup statistics for a client
 */
export async function emailListCleanup(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'detect':
    case 'preview': {
      const { days = 90 } = body;
      const cutoffDate = new Date(Date.now() - days * 86400000).toISOString();

      // Find subscribed users who haven't engaged since cutoff
      // "Not engaged" = last_engaged_at is null or before cutoff
      const { data: inactive, error, count } = await supabase
        .from('email_subscribers')
        .select('id, email, first_name, last_name, last_engaged_at, created_at, total_orders, total_spent, tags', { count: 'exact' })
        .eq('client_id', client_id)
        .eq('status', 'subscribed')
        .or(`last_engaged_at.is.null,last_engaged_at.lt.${cutoffDate}`)
        .order('last_engaged_at', { ascending: true, nullsFirst: true })
        .limit(action === 'preview' ? 100 : 1000);

      if (error) return c.json({ error: error.message }, 500);

      // Get total subscribed count for percentage
      const { count: totalSubscribed } = await supabase
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('status', 'subscribed');

      // Categorize by risk level
      const neverEngaged = (inactive || []).filter(s => !s.last_engaged_at);
      const lapsed = (inactive || []).filter(s => s.last_engaged_at);

      return c.json({
        total_inactive: count || 0,
        total_subscribed: totalSubscribed || 0,
        percentage: totalSubscribed ? Math.round(((count || 0) / totalSubscribed) * 100) : 0,
        never_engaged: neverEngaged.length,
        lapsed: lapsed.length,
        cutoff_days: days,
        cutoff_date: cutoffDate,
        subscribers: inactive || [],
      });
    }

    case 'sunset': {
      const { days = 90, unsubscribe = false, subscriber_ids } = body;

      let query = supabase
        .from('email_subscribers')
        .select('id, email, tags')
        .eq('client_id', client_id)
        .eq('status', 'subscribed');

      if (subscriber_ids && Array.isArray(subscriber_ids)) {
        // Specific subscribers
        query = query.in('id', subscriber_ids);
      } else {
        // All inactive
        const cutoffDate = new Date(Date.now() - days * 86400000).toISOString();
        query = query.or(`last_engaged_at.is.null,last_engaged_at.lt.${cutoffDate}`);
      }

      const { data: toSunset, error: fetchErr } = await query;
      if (fetchErr) return c.json({ error: fetchErr.message }, 500);
      if (!toSunset || toSunset.length === 0) {
        return c.json({ updated: 0, message: 'No inactive subscribers found' });
      }

      let updated = 0;
      for (const sub of toSunset) {
        const currentTags: string[] = sub.tags || [];
        const newTags = currentTags.includes('sunset') ? currentTags : [...currentTags, 'sunset'];

        const updateData: Record<string, any> = {
          tags: newTags,
          updated_at: new Date().toISOString(),
        };

        if (unsubscribe) {
          updateData.status = 'unsubscribed';
          updateData.unsubscribed_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from('email_subscribers')
          .update(updateData)
          .eq('id', sub.id);

        if (!error) updated++;
      }

      // Record cleanup event
      await supabase.from('email_events').insert({
        client_id,
        subscriber_id: toSunset[0].id, // Use first subscriber as reference
        event_type: 'unsubscribed',
        metadata: {
          action: 'sunset_cleanup',
          affected_count: updated,
          unsubscribed: unsubscribe,
          days_inactive: days,
        },
      });

      return c.json({
        success: true,
        updated,
        unsubscribed: unsubscribe,
        total_processed: toSunset.length,
      });
    }

    case 'reactivate': {
      // Remove sunset tag from subscribers who have re-engaged
      const { data: reengaged, error: fetchErr } = await supabase
        .from('email_subscribers')
        .select('id, tags')
        .eq('client_id', client_id)
        .eq('status', 'subscribed')
        .contains('tags', ['sunset'])
        .not('last_engaged_at', 'is', null);

      if (fetchErr) return c.json({ error: fetchErr.message }, 500);

      // Filter to those who engaged in the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const recentlyActive = await safeQueryOrDefault<any>(
        supabase
          .from('email_subscribers')
          .select('id, tags')
          .eq('client_id', client_id)
          .eq('status', 'subscribed')
          .contains('tags', ['sunset'])
          .gte('last_engaged_at', thirtyDaysAgo),
        [],
        'listCleanup.getRecentlyActive',
      );

      let reactivated = 0;
      for (const sub of recentlyActive || []) {
        const newTags = (sub.tags || []).filter((t: string) => t !== 'sunset');
        const { error } = await supabase
          .from('email_subscribers')
          .update({ tags: newTags, updated_at: new Date().toISOString() })
          .eq('id', sub.id);

        if (!error) reactivated++;
      }

      return c.json({ success: true, reactivated });
    }

    case 'stats': {
      // Get overall list health statistics
      const [
        { count: total },
        { count: subscribed },
        { count: unsubscribed },
        { count: bounced },
        { count: complained },
      ] = await Promise.all([
        supabase.from('email_subscribers').select('*', { count: 'exact', head: true }).eq('client_id', client_id),
        supabase.from('email_subscribers').select('*', { count: 'exact', head: true }).eq('client_id', client_id).eq('status', 'subscribed'),
        supabase.from('email_subscribers').select('*', { count: 'exact', head: true }).eq('client_id', client_id).eq('status', 'unsubscribed'),
        supabase.from('email_subscribers').select('*', { count: 'exact', head: true }).eq('client_id', client_id).eq('status', 'bounced'),
        supabase.from('email_subscribers').select('*', { count: 'exact', head: true }).eq('client_id', client_id).eq('status', 'complained'),
      ]);

      // Sunset tagged
      const { count: sunsetCount } = await supabase
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .contains('tags', ['sunset']);

      // Engaged in last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count: activeCount } = await supabase
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('status', 'subscribed')
        .gte('last_engaged_at', thirtyDaysAgo);

      return c.json({
        total: total || 0,
        subscribed: subscribed || 0,
        unsubscribed: unsubscribed || 0,
        bounced: bounced || 0,
        complained: complained || 0,
        sunset: sunsetCount || 0,
        active_30d: activeCount || 0,
        health_score: subscribed
          ? Math.round(((activeCount || 0) / (subscribed || 1)) * 100)
          : 0,
      });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
