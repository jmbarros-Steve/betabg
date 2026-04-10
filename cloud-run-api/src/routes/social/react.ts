// POST /api/social/react — Public reaction endpoint (no auth)
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const VALID_REACTIONS = ['fire', 'skull', 'brain', 'trash', 'bullseye'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function socialReact(c: Context) {
  try {
    const body = await c.req.json();
    const { post_id, reaction, fingerprint } = body;

    if (!post_id || !reaction) {
      return c.json({ error: 'post_id y reaction requeridos' }, 400);
    }

    if (!UUID_REGEX.test(post_id)) {
      return c.json({ error: 'post_id inválido' }, 400);
    }

    if (!VALID_REACTIONS.includes(reaction)) {
      return c.json({ error: `Reacción inválida. Válidas: ${VALID_REACTIONS.join(', ')}` }, 400);
    }

    const fp = fingerprint || c.req.header('x-forwarded-for') || 'anon';

    const supabase = getSupabaseAdmin();

    // Verify post exists
    const { data: post } = await supabase
      .from('social_posts')
      .select('id')
      .eq('id', post_id)
      .single();

    if (!post) {
      return c.json({ error: 'Post no encontrado' }, 404);
    }

    const { error } = await supabase.from('social_reactions').upsert(
      {
        post_id,
        reaction,
        reactor_type: 'human',
        fingerprint: fp,
      },
      { onConflict: 'post_id,fingerprint,reaction' },
    );

    if (error) {
      console.error('[social-react] Error:', error);
      return c.json({ error: 'Error al guardar reacción' }, 500);
    }

    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[social-react] Error:', err);
    return c.json({ error: message }, 500);
  }
}
