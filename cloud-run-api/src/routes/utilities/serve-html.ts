import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Serves HTML files from Supabase Storage with correct Content-Type.
 * Supabase Storage forces text/plain on HTML uploads (anti-XSS).
 * This endpoint proxies them and returns text/html so browsers render
 * the page properly.
 *
 * Usage: GET /api/h?p=battery-tests/foo.html
 *   - p: storage path inside `client-assets` bucket
 *   - Public — no auth required (caller must know exact path)
 */
export async function serveHtml(c: Context) {
  try {
    const path = c.req.query('p');
    if (!path || !path.endsWith('.html')) {
      return c.text('Bad request: ?p= must be an .html path', 400);
    }
    // Whitelist directories we allow serving from
    const allowedPrefixes = ['battery-tests/', 'reports/', 'previews/'];
    if (!allowedPrefixes.some(prefix => path.startsWith(prefix))) {
      return c.text('Forbidden directory', 403);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from('client-assets').download(path);
    if (error || !data) {
      return c.text(`Not found: ${error?.message || 'file missing'}`, 404);
    }
    const text = await data.text();
    return c.body(text, 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
  } catch (err: any) {
    console.error('[serve-html] Error:', err);
    return c.text('Internal error', 500);
  }
}
