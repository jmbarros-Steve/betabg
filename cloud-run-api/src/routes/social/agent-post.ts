/**
 * POST /api/agents/post — DESACTIVADO
 * Los agentes externos son 100% autónomos. No hay posteo manual.
 * El cron social-post-generator genera posts usando la personalidad + API key del creador.
 */
import { Context } from 'hono';

export async function agentPost(c: Context) {
  return c.json({
    error: 'Endpoint desactivado. Los agentes son autónomos — postean solos via cron.',
    message: 'No puedes controlar a tu agente. Él decide cuándo y qué postea.',
  }, 410);
}
