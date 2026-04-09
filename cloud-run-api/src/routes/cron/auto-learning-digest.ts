import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * POST /api/cron/auto-learning-digest
 * Daily 9am Chile (12 UTC): sends WA to JM with pending insights summary + approval link.
 */
export async function autoLearningDigest(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ADMIN_WA_PHONE = process.env.ADMIN_WA_PHONE;
  const APP_URL = process.env.APP_URL || 'https://www.steve.cl';

  if (!ADMIN_WA_PHONE) {
    return c.json({ error: 'Missing ADMIN_WA_PHONE env var' }, 500);
  }

  try {
    // Fix Tomás W7 (2026-04-07): paginar. PostgREST corta en 1000 filas por
    // default. Con 1041 pending actuales el conteo del digest era ≤1000,
    // truncando el summary y las estadísticas por categoría.
    // Order estable: (confidence DESC, id ASC) — tiebreaker `id` para paginación.
    const pending: Array<{ id: string; titulo: string; contenido: string; categoria: string; confidence: number | null; created_at: string }> = [];
    const BATCH_SIZE = 1000;
    let offset = 0;
    while (true) {
      const { data: batch, error: queryErr } = await supabase
        .from('steve_knowledge')
        .select('id, titulo, contenido, categoria, confidence, created_at')
        .eq('approval_status', 'pending')
        .eq('activo', true)
        .is('purged_at', null)
        .order('confidence', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (queryErr) {
        console.error('[digest] Query error:', queryErr);
        return c.json({ error: 'Failed to query pending insights', details: queryErr.message }, 500);
      }
      if (!batch || batch.length === 0) break;
      pending.push(...batch);
      if (batch.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    if (pending.length === 0) {
      console.log('[digest] No pending insights — skipping digest');
      return c.json({ success: true, message: 'No pending insights', sent: false });
    }

    // Group by category
    const byCat: Record<string, number> = {};
    for (const item of pending) {
      byCat[item.categoria] = (byCat[item.categoria] || 0) + 1;
    }

    // Create digest record with secure token
    const { data: digest, error: digestErr } = await supabase
      .from('auto_learning_digests')
      .insert({ pending_count: pending.length })
      .select('id, token')
      .single();

    if (digestErr || !digest) {
      console.error('[digest] Failed to create digest record:', digestErr);
      return c.json({ error: 'Failed to create digest', details: digestErr?.message }, 500);
    }

    // Build category summary
    const catLines = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `  - ${cat}: ${count}`)
      .join('\n');

    // Pick top 2 most interesting insights (highest confidence)
    const top2 = pending.slice(0, 2);
    const topLines = top2
      .map((i: any) => `• "${i.titulo}" (confianza: ${i.confidence}/10)`)
      .join('\n');

    const approveUrl = `${APP_URL}/admin/approve-rules?token=${digest.token}`;

    const message = `Buenos días JM.

Steve investigó y tiene ${pending.length} insights nuevos pendientes:
${catLines}

Revísalos aquí (con fuente y explicación):
${approveUrl}

Los insights más interesantes:
${topLines}

Link válido por 7 días.`;

    // Send WhatsApp
    await sendWhatsApp(ADMIN_WA_PHONE, message);
    console.log(`[digest] Sent WA with ${pending.length} pending insights, token: ${digest.token.slice(0, 8)}...`);

    // Log to qa_log
    await supabase.from('qa_log').insert({
      check_type: 'auto_learning_digest',
      status: 'pass',
      details: {
        digest_id: digest.id,
        pending_count: pending.length,
        categories: byCat,
        top_insights: top2.map((i: any) => i.titulo),
      },
    });

    return c.json({
      success: true,
      sent: true,
      digest_id: digest.id,
      pending_count: pending.length,
      categories: byCat,
    });
  } catch (err: any) {
    console.error('[digest] Fatal error:', err);

    await supabase.from('qa_log').insert({
      check_type: 'auto_learning_digest',
      status: 'fail',
      details: { error: err.message || String(err) },
    });

    return c.json({ error: 'Digest failed', details: err.message }, 500);
  }
}
