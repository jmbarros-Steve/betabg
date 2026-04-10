/**
 * Cron: social-digest-sender — Sends daily WhatsApp digest at 8am Chile
 * Schedule: 0 12 * * * (12 UTC = 8am Chile)
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { getDigestPrompt } from '../../lib/social-prompts.js';

export async function socialDigestSender(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const results = { sent: 0, expired: 0, errors: 0 };

  try {
    // Get active subscribers with trial_day < 7
    const { data: subscribers, error: subErr } = await supabase
      .from('social_subscriptions')
      .select('*')
      .eq('status', 'active')
      .lt('trial_day', 7);

    if (subErr) {
      console.error('[social-digest] Query error:', subErr);
      return c.json({ error: subErr.message }, 500);
    }

    if (!subscribers || subscribers.length === 0) {
      return c.json({ success: true, message: 'No active subscribers', ...results });
    }

    // Get top posts from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: allPosts } = await supabase
      .from('social_posts')
      .select('agent_name, content, post_type, topics, share_count')
      .is('is_reply_to', null)
      .eq('moderation_status', 'approved')
      .gte('created_at', yesterday)
      .order('share_count', { ascending: false })
      .limit(30);

    if (!allPosts || allPosts.length === 0) {
      console.log('[social-digest] No posts from last 24h, skipping digest');
      return c.json({ success: true, message: 'No posts to digest', ...results });
    }

    for (const sub of subscribers) {
      try {
        // Filter posts by subscriber's topics (or all if no topics)
        let relevantPosts = allPosts;
        if (sub.topics && sub.topics.length > 0) {
          relevantPosts = allPosts.filter((p: { topics?: string[] }) =>
            p.topics?.some((t: string) => sub.topics.includes(t)),
          );
          // Fallback to all posts if no topic match
          if (relevantPosts.length === 0) relevantPosts = allPosts;
        }

        // Take top 5
        const topPosts = relevantPosts.slice(0, 5);

        // Check if it's the last day
        if (sub.trial_day >= 7) {
          // Expire
          await supabase
            .from('social_subscriptions')
            .update({ status: 'expired' })
            .eq('id', sub.id);
          results.expired++;
          continue;
        }

        // Generate digest with Haiku
        const { system, user } = getDigestPrompt(
          sub.name,
          sub.company,
          sub.topics || [],
          topPosts,
          sub.trial_day,
        );

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 800,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        });

        if (!aiRes.ok) {
          console.error(`[social-digest] Haiku error for ${sub.name}:`, aiRes.status);
          results.errors++;
          continue;
        }

        const aiData = await aiRes.json() as Record<string, unknown>;
        const aiContent = aiData?.content as Array<{ text?: string }> | undefined;
        const digestContent = aiContent?.[0]?.text?.trim();
        if (!digestContent) {
          results.errors++;
          continue;
        }

        // Log digest BEFORE sending WA (so we have a record even if WA fails)
        await supabase.from('social_digests').insert({
          subscription_id: sub.id,
          day_number: sub.trial_day + 1,
          content: digestContent,
        });

        // Send via WhatsApp
        try {
          await sendWhatsApp(sub.phone, digestContent);
        } catch (waErr) {
          console.warn(`[social-digest] WA send failed for ${sub.name}:`, waErr);
          // Don't skip — digest is logged, day still increments
        }

        // Increment trial_day
        const newDay = sub.trial_day + 1;
        const updateData: Record<string, unknown> = { trial_day: newDay };
        if (newDay >= 7) updateData.status = 'expired';

        await supabase
          .from('social_subscriptions')
          .update(updateData)
          .eq('id', sub.id);

        results.sent++;
      } catch (subErr) {
        console.error(`[social-digest] Error for ${sub.name}:`, subErr);
        results.errors++;
      }
    }

    console.log('[social-digest] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[social-digest] Fatal error:', err);
    return c.json({ error: message }, 500);
  }
}
