import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';

/**
 * POST /api/ai/suggest-inbox-reply
 * Generates AI-powered reply suggestions for social inbox conversations.
 * Auth: JWT (authMiddleware)
 *
 * Body: {
 *   client_id: string,
 *   messages: Array<{ role: 'user' | 'assistant', content: string }>,
 *   platform: 'instagram' | 'facebook' | 'messenger',
 * }
 *
 * Response: { suggestions: string[] }
 */
export async function suggestInboxReply(c: Context) {
  try {
    const { client_id, messages, platform } = await c.req.json();

    if (!client_id) return c.json({ error: 'Missing client_id' }, 400);
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: 'Missing or empty messages array' }, 400);
    }

    const supabase = getSupabaseAdmin();

    // IDOR prevention: verify authenticated user owns client_id
    const user = c.get('user');
    if (user?.id) {
      const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, user.id);
      if (!isSuperAdmin && !clientIds.includes(client_id)) {
        return c.json({ error: 'Forbidden: you do not own this client' }, 403);
      }
    }

    // Fetch brand context for better suggestions
    const { data: client } = await supabase
      .from('clients')
      .select('name, company')
      .eq('id', client_id)
      .single();

    const brandName = client?.company || client?.name || 'la marca';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return c.json({ error: 'AI service not configured' }, 500);
    }

    // Build conversation context for Claude
    const conversationText = messages
      .map((m: { role: string; content: string }) =>
        `${m.role === 'user' ? 'Cliente' : 'Marca'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `Eres un asistente de atención al cliente para "${brandName}".
La conversación es por ${platform || 'redes sociales'}.

Genera exactamente 3 respuestas sugeridas, cada una con un tono diferente:
1. Profesional y directo
2. Amigable y cercano
3. Empático y servicial

Reglas:
- Respuestas cortas (máximo 2-3 oraciones cada una)
- En español
- Que sean naturales para ${platform || 'redes sociales'}
- No uses hashtags ni emojis excesivos
- Responde SOLO con un JSON array de 3 strings, sin markdown ni explicaciones

Ejemplo de formato de respuesta:
["Respuesta profesional aquí", "Respuesta amigable aquí", "Respuesta empática aquí"]`;

    const result = await anthropicFetch(
      {
        model: 'claude-haiku-4-20250414',
        max_tokens: 512,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Conversación reciente:\n${conversationText}\n\nGenera 3 sugerencias de respuesta:`,
          },
        ],
      },
      apiKey,
      { timeoutMs: 15_000 },
    );

    if (!result.ok) {
      console.error('[suggest-inbox-reply] Anthropic API error:', result.data);
      return c.json({ error: 'AI service error', details: result.data?.error?.message }, 500);
    }

    // Extract text from Anthropic response
    const responseText =
      result.data?.content?.[0]?.text || '[]';

    // Parse suggestions from JSON array
    let suggestions: string[] = [];
    try {
      // Try to parse as JSON array directly
      const parsed = JSON.parse(responseText.trim());
      if (Array.isArray(parsed)) {
        suggestions = parsed.filter((s: any) => typeof s === 'string' && s.trim());
      }
    } catch {
      // If JSON parsing fails, split by newlines and clean up
      suggestions = responseText
        .split('\n')
        .map((line: string) => line.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '').trim())
        .filter((line: string) => line.length > 10);
    }

    // Ensure we have at most 3 suggestions
    suggestions = suggestions.slice(0, 3);

    console.log(`[suggest-inbox-reply] Generated ${suggestions.length} suggestions for client ${client_id}`);

    return c.json({ suggestions });
  } catch (err: any) {
    console.error('[suggest-inbox-reply] Error:', err);
    return c.json({ error: err.message || 'Internal server error' }, 500);
  }
}
