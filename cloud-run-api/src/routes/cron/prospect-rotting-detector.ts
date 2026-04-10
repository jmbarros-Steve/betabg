import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Prospect Rotting Detector
 *
 * Marks prospects as "rotting" when they have no activity for too long.
 * Rules by stage:
 *   new:        2 days
 *   discovery:  3 days
 *   qualifying: 5 days
 *   pitching:   4 days
 *   closing:    3 days
 *
 * Also clears is_rotting for prospects with recent activity.
 *
 * Cron: every 6h (0 star-slash-6 star star star)
 * Auth: X-Cron-Secret header
 */

const ROTTING_THRESHOLDS: Record<string, number> = {
  new: 2,
  discovery: 3,
  qualifying: 5,
  pitching: 4,
  closing: 3,
};

export async function prospectRottingDetector(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret')?.trim();
  const expected = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const results = { marked_rotting: 0, cleared_rotting: 0, errors: 0 };

  try {
    // Fetch active prospects (not converted/lost)
    // Bug #175 fix: Add .limit(500) to prevent unbounded fetch
    const { data: prospects, error } = await supabase
      .from('wa_prospects')
      .select('id, stage, last_activity_at, updated_at, is_rotting')
      .not('stage', 'in', '("converted","lost")')
      .limit(500);

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    if (!prospects || prospects.length === 0) {
      return c.json({ ...results, message: 'No active prospects' });
    }

    const toMarkRotting: string[] = [];
    const toClearRotting: string[] = [];

    for (const p of prospects) {
      const thresholdDays = ROTTING_THRESHOLDS[p.stage] || 5;
      const lastActivity = new Date(p.last_activity_at || p.updated_at || now);
      const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceActivity >= thresholdDays) {
        // Should be rotting
        if (!p.is_rotting) {
          toMarkRotting.push(p.id);
        }
      } else {
        // Activity is recent — clear rotting if needed
        if (p.is_rotting) {
          toClearRotting.push(p.id);
        }
      }
    }

    // Bug #175 fix: Batch update in chunks of 100 to avoid oversized .in() queries
    // Batch update: mark as rotting
    if (toMarkRotting.length > 0) {
      let markErrors = 0;
      for (let i = 0; i < toMarkRotting.length; i += 100) {
        const chunk = toMarkRotting.slice(i, i + 100);
        const { error: markErr } = await supabase
          .from('wa_prospects')
          .update({ is_rotting: true })
          .in('id', chunk);

        if (markErr) {
          console.error('[rotting-detector] Error marking rotting (chunk):', markErr);
          markErrors++;
        }
      }
      if (markErrors > 0) {
        results.errors += markErrors;
      } else {
        results.marked_rotting = toMarkRotting.length;
      }
    }

    // Batch update: clear rotting
    if (toClearRotting.length > 0) {
      let clearErrors = 0;
      for (let i = 0; i < toClearRotting.length; i += 100) {
        const chunk = toClearRotting.slice(i, i + 100);
        const { error: clearErr } = await supabase
          .from('wa_prospects')
          .update({ is_rotting: false })
          .in('id', chunk);

        if (clearErr) {
          console.error('[rotting-detector] Error clearing rotting (chunk):', clearErr);
          clearErrors++;
        }
      }
      if (clearErrors > 0) {
        results.errors += clearErrors;
      } else {
        results.cleared_rotting = toClearRotting.length;
      }
    }

    console.log(`[rotting-detector] marked=${results.marked_rotting} cleared=${results.cleared_rotting} total=${prospects.length}`);
    return c.json(results);
  } catch (error: any) {
    console.error('[rotting-detector] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
