/**
 * Submit Correction — Centralized endpoint for admin feedback on Steve's messages.
 *
 * POST /api/submit-correction
 * Auth: JWT (authMiddleware)
 *
 * Body:
 * - messageId: string — wa_messages.id of the outbound message being corrected
 * - correctedText: string — what Steve should have said
 * - ratingNotes?: string — admin notes about why it was wrong
 * - rating: 'good' | 'bad'
 *
 * Actions:
 * - Updates wa_messages.metadata with rating
 * - For 'bad': creates CORRECCION rule (orden=99), creates steve_bugs entry, degrades used rules
 * - For 'good': creates good example in steve_knowledge, boosts used rules
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function submitCorrection(c: Context) {
  const supabase = getSupabaseAdmin();

  try {
    const body = await c.req.json();
    const { messageId, correctedText, ratingNotes, rating } = body;

    if (!messageId || !rating || !['good', 'bad'].includes(rating)) {
      return c.json({ error: 'messageId and rating (good|bad) are required' }, 400);
    }

    // 1. Fetch the message
    const { data: message, error: msgErr } = await supabase
      .from('wa_messages')
      .select('id, body, metadata, contact_phone, direction')
      .eq('id', messageId)
      .maybeSingle();

    if (msgErr || !message) {
      return c.json({ error: 'Message not found' }, 404);
    }

    if (message.direction !== 'outbound') {
      return c.json({ error: 'Can only rate outbound (Steve) messages' }, 400);
    }

    const ruleIds: string[] = message.metadata?.rule_ids || [];

    // 2. Fetch prospect info for context
    const { data: prospect } = await supabase
      .from('wa_prospects')
      .select('id, phone, name, profile_name, company, what_they_sell, stage, lead_score')
      .eq('phone', message.contact_phone)
      .maybeSingle();

    // 3. Update message metadata with rating
    const newMeta = {
      ...(message.metadata || {}),
      rating,
      rating_notes: ratingNotes || undefined,
      rated_at: new Date().toISOString(),
    };

    await supabase
      .from('wa_messages')
      .update({ metadata: newMeta })
      .eq('id', messageId);

    const results: string[] = ['metadata updated'];

    if (rating === 'good') {
      // Create good example
      await supabase.from('steve_knowledge').insert({
        categoria: 'prospecting',
        titulo: `Ejemplo bueno (${prospect?.what_they_sell || 'general'}, ${prospect?.stage || 'unknown'}) — ${new Date().toLocaleDateString('es-CL')}`,
        contenido: `CONTEXTO: Prospecto ${prospect?.name || prospect?.profile_name || message.contact_phone} — Stage: ${prospect?.stage || 'unknown'} — Score: ${prospect?.lead_score ?? 0}\nSTEVE (buena respuesta): ${message.body}${ratingNotes ? `\nNOTA ADMIN: ${ratingNotes}` : ''}`,
        activo: true,
        orden: 99,
      });
      results.push('good example created');

      // Boost rules: orden += 5 (cap 100)
      if (ruleIds.length > 0) {
        for (const ruleId of ruleIds) {
          const { data: rule } = await supabase
            .from('steve_knowledge')
            .select('orden')
            .eq('id', ruleId)
            .maybeSingle();
          if (rule) {
            await supabase
              .from('steve_knowledge')
              .update({ orden: Math.min((rule.orden || 0) + 5, 100) })
              .eq('id', ruleId);
          }
        }
        results.push(`${ruleIds.length} rules boosted (+5)`);
      }
    } else {
      // Bad rating
      // Create steve_bugs entry
      await supabase.from('steve_bugs').insert({
        categoria: 'prospecting',
        descripcion: `Respuesta débil en ${prospect?.stage || 'unknown'} con prospecto de ${prospect?.what_they_sell || 'industria desconocida'}`,
        ejemplo_malo: message.body,
        ejemplo_bueno: correctedText || null,
        activo: true,
      });
      results.push('bug created');

      // Create CORRECCION rule if correction text provided
      if (correctedText?.trim()) {
        await supabase.from('steve_knowledge').insert({
          categoria: 'prospecting',
          titulo: `CORRECCION: ${prospect?.stage || 'unknown'} — ${prospect?.what_they_sell || 'general'}`,
          contenido: `CONTEXTO: Prospecto de ${prospect?.what_they_sell || 'industria desconocida'} en stage ${prospect?.stage || 'unknown'}\nRESPUESTA INCORRECTA: ${message.body}\nRESPUESTA CORRECTA: ${correctedText}${ratingNotes ? `\nNOTA: ${ratingNotes}` : ''}`,
          activo: true,
          orden: 99,
        });
        results.push('correction rule created (orden=99)');
      }

      // Degrade rules: orden -= 10
      if (ruleIds.length > 0) {
        for (const ruleId of ruleIds) {
          const { data: rule } = await supabase
            .from('steve_knowledge')
            .select('orden')
            .eq('id', ruleId)
            .maybeSingle();
          if (rule) {
            await supabase
              .from('steve_knowledge')
              .update({ orden: Math.max((rule.orden || 0) - 10, 0) })
              .eq('id', ruleId);
          }
        }
        results.push(`${ruleIds.length} rules degraded (-10)`);
      }
    }

    return c.json({
      success: true,
      rating,
      ruleIds,
      actions: results,
    });
  } catch (err: any) {
    console.error('[submit-correction] Error:', err);
    return c.json({ error: err.message || 'Internal error' }, 500);
  }
}
