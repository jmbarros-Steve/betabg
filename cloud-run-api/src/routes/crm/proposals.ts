import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';
import { logProspectEvent } from '../../lib/prospect-event-logger.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';
import { getUserClientIds, verifyProspectOwnership } from '../../lib/user-scoping.js';

/** CRUD for proposals: list, create, get */
export async function proposalsCrud(c: Context) {
  try {
    const body = await c.req.json();
    const { action } = body;
    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant scoping
    const { isSuperAdmin } = await getUserClientIds(supabase, user.id);

    switch (action) {
      case 'list': {
        const { prospect_id } = body;

        // If filtering by prospect, verify ownership
        if (prospect_id && !isSuperAdmin) {
          const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
          if (!allowed) return c.json({ error: 'Forbidden' }, 403);
        }

        let query = supabase.from('proposals').select('*, wa_prospects(id, phone, name, profile_name, company)');
        if (prospect_id) query = query.eq('prospect_id', prospect_id);

        // Non-admin without prospect filter: only see their own proposals
        if (!isSuperAdmin && !prospect_id) {
          query = query.eq('created_by', user.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) return c.json({ error: error.message }, 500);
        return c.json({ proposals: data || [] });
      }

      case 'create': {
        const { prospect_id, title, content, plan_type, monthly_price } = body;
        if (!prospect_id || !title || !content) {
          return c.json({ error: 'prospect_id, title, and content required' }, 400);
        }

        // Verify ownership of the prospect
        if (!isSuperAdmin) {
          const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
          if (!allowed) return c.json({ error: 'Forbidden' }, 403);
        }

        const { data, error } = await supabase
          .from('proposals')
          .insert({
            prospect_id,
            created_by: user.id,
            title,
            content,
            plan_type: plan_type || null,
            monthly_price: monthly_price || null,
          })
          .select()
          .single();

        if (error) return c.json({ error: error.message }, 500);

        logProspectEvent(prospect_id, 'proposal_sent', { proposal_id: data.id, plan_type, title }, `admin:${user.id}`);

        return c.json({ proposal: data });
      }

      case 'get': {
        const { proposal_id } = body;
        if (!proposal_id) return c.json({ error: 'proposal_id required' }, 400);

        const { data, error } = await supabase
          .from('proposals')
          .select('*, wa_prospects(id, phone, name, profile_name, company, what_they_sell)')
          .eq('id', proposal_id)
          .single();

        if (error) return c.json({ error: error.message }, 500);

        // Super admin can see all proposals
        if (isSuperAdmin) {
          return c.json({ proposal: data });
        }

        // Verify ownership: check if user created this proposal or owns the prospect
        if (data.created_by !== user.id) {
          if (data.prospect_id) {
            const { allowed } = await verifyProspectOwnership(supabase, data.prospect_id, user.id);
            if (!allowed) return c.json({ error: 'Forbidden' }, 403);
          } else {
            return c.json({ error: 'Forbidden' }, 403);
          }
        }

        return c.json({ proposal: data });
      }

      case 'update_status': {
        const { proposal_id, status } = body;
        if (!proposal_id || !status) return c.json({ error: 'proposal_id and status required' }, 400);

        const validStatuses = ['draft', 'sent', 'viewed', 'accepted', 'rejected'];
        if (!validStatuses.includes(status)) return c.json({ error: 'Invalid status' }, 400);

        // Verify ownership before updating
        if (!isSuperAdmin) {
          const { data: proposal } = await supabase
            .from('proposals')
            .select('created_by')
            .eq('id', proposal_id)
            .maybeSingle();
          if (!proposal || proposal.created_by !== user.id) return c.json({ error: 'Forbidden' }, 403);
        }

        const update: Record<string, any> = { status };
        if (status === 'sent') update.sent_at = new Date().toISOString();

        const { data, error } = await supabase
          .from('proposals')
          .update(update)
          .eq('id', proposal_id)
          .select()
          .single();

        if (error) return c.json({ error: error.message }, 500);
        return c.json({ proposal: data });
      }

      default:
        return c.json({ error: 'Invalid action. Use: list, create, get, update_status' }, 400);
    }
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}

/** AI-generate a proposal using Anthropic */
export async function proposalsGenerate(c: Context) {
  try {
    const { prospect_id, plan_type, monthly_price } = await c.req.json();
    if (!prospect_id) return c.json({ error: 'prospect_id required' }, 400);

    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant: verify ownership
    const { allowed } = await verifyProspectOwnership(supabase, prospect_id, user.id);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);

    // Fetch prospect data
    const { data: prospect, error: pErr } = await supabase
      .from('wa_prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (pErr || !prospect) return c.json({ error: 'Prospect not found' }, 404);

    // Fetch recent messages for context
    const messages = await safeQueryOrDefault<any>(
      supabase
        .from('wa_messages')
        .select('direction, body, created_at')
        .eq('contact_phone', prospect.phone)
        .order('created_at', { ascending: false })
        .limit(20),
      [],
      'proposals.getRecentMessages',
    );

    const conversationContext = (messages || [])
      .reverse()
      .map((m: any) => `${m.direction === 'inbound' ? 'Prospecto' : 'Steve'}: ${m.body || '(media)'}`)
      .join('\n');

    const planLabel = plan_type || 'profesional';
    const priceLabel = monthly_price ? `$${monthly_price.toLocaleString()} USD/mes` : 'a definir';

    const prompt = `Eres un consultor de marketing digital que trabaja para Steve, una agencia de marketing AI.
Genera una propuesta comercial profesional en español para el siguiente prospecto.

## Datos del Prospecto
- Nombre: ${prospect.name || prospect.profile_name || 'No disponible'}
- Empresa: ${prospect.company || 'No disponible'}
- Qué vende: ${prospect.what_they_sell || 'No disponible'}
- Plataforma: ${prospect.store_platform || 'No disponible'}
- Revenue mensual: ${prospect.monthly_revenue || 'No disponible'}
- Marketing actual: ${prospect.current_marketing || 'No disponible'}
- Pain points: ${(prospect.pain_points || []).join(', ') || 'No disponible'}
- Score: ${prospect.lead_score || 0}/100

## Plan seleccionado: ${planLabel}
## Precio: ${priceLabel}

## Historial de conversación (últimos mensajes)
${conversationContext || 'Sin historial'}

## Instrucciones
Genera la propuesta en formato Markdown con las siguientes secciones:
1. **Resumen Ejecutivo** — Por qué Steve es ideal para su negocio
2. **Diagnóstico** — Basado en la conversación, qué oportunidades detectamos
3. **Plan de Acción** — Qué haremos en los primeros 30/60/90 días
4. **Servicios Incluidos** — Según el plan (${planLabel})
5. **Inversión** — ${priceLabel}
6. **Próximos Pasos** — Cómo empezar

Sé específico al negocio del prospecto. No uses contenido genérico. Máximo 800 palabras.`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    const result = await anthropicFetch(
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      },
      apiKey,
      { timeoutMs: 30000 },
    );

    if (!result.ok) {
      return c.json({ error: 'AI generation failed', details: result.data }, 500);
    }

    const content = result.data?.content?.[0]?.text || '';
    const title = `Propuesta ${planLabel} — ${prospect.company || prospect.name || 'Prospecto'}`;

    return c.json({
      title,
      content,
      plan_type: planLabel,
      monthly_price: monthly_price || null,
      prospect_id,
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
