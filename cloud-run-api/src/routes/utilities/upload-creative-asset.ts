import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Upload de imágenes/videos para usar en creativos de campañas Meta.
 *
 * POST /api/upload-creative-asset
 *   Body: { client_id, filename, content_base64, content_type }
 *   Auth: usuario dueño del client (vía authMiddleware)
 *
 * Sube al bucket `ad-references/uploads/{client_id}/{timestamp}_{filename}`
 * y devuelve URL pública. El usuario puede después referenciar esta URL en
 * el spec.creative.image_url o video_url del draft.
 *
 * Tamaño máximo: 10 MB para imágenes, 50 MB para videos (Meta limit).
 */

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
]);
const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm',
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export async function uploadCreativeAsset(c: Context) {
  try {
    const user = c.get('user');
    const isInternal = c.get('isInternal') === true;
    if (!user && !isInternal) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const { client_id, filename, content_base64, content_type } = body || {};

    if (!client_id || !filename || !content_base64 || !content_type) {
      return c.json({ error: 'Required: client_id, filename, content_base64, content_type' }, 400);
    }

    const isImage = ALLOWED_IMAGE_TYPES.has(content_type);
    const isVideo = ALLOWED_VIDEO_TYPES.has(content_type);
    if (!isImage && !isVideo) {
      return c.json({ error: `Unsupported content_type ${content_type}. Allowed: ${[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(', ')}` }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Verify ownership
    if (!isInternal) {
      const userId = user?.id;
      const { data: client } = await supabase
        .from('clients').select('user_id, client_user_id').eq('id', client_id).single();
      if (!client || (client.user_id !== userId && client.client_user_id !== userId)) {
        // super admin escape
        const { data: roleRow } = await supabase
          .from('user_roles').select('is_super_admin').eq('user_id', userId).eq('role', 'admin').maybeSingle();
        if (!roleRow?.is_super_admin) return c.json({ error: 'Forbidden' }, 403);
      }
    }

    // Decode base64
    let bytes: Buffer;
    try {
      // Strip data URI prefix if present (e.g. "data:image/png;base64,...")
      const base64Clean = String(content_base64).replace(/^data:[^;]+;base64,/, '');
      bytes = Buffer.from(base64Clean, 'base64');
    } catch (e: any) {
      return c.json({ error: 'Invalid base64 content' }, 400);
    }

    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (bytes.length === 0) return c.json({ error: 'Empty content' }, 400);
    if (bytes.length > maxBytes) {
      return c.json({ error: `File too large: ${bytes.length} bytes (max ${maxBytes})` }, 400);
    }

    // Sanitize filename
    const cleanName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const ts = Date.now();
    const storagePath = `uploads/${client_id}/${ts}_${cleanName}`;

    const { error: upErr } = await supabase.storage
      .from('ad-references')
      .upload(storagePath, bytes, {
        contentType: content_type,
        upsert: false,
      });
    if (upErr) {
      console.error('[upload-creative-asset] Storage upload error:', upErr);
      return c.json({ error: 'Failed to upload', details: upErr.message }, 500);
    }

    const { data: { publicUrl } } = supabase.storage.from('ad-references').getPublicUrl(storagePath);

    // Track in ad_assets table for future reuse
    try {
      await supabase.from('ad_assets').insert({
        client_id,
        type: isImage ? 'image' : 'video',
        url: publicUrl,
        source: 'creative_upload',
      });
    } catch (e: any) {
      // Non-blocking: registration in ad_assets failed, but file is uploaded
      console.warn('[upload-creative-asset] ad_assets insert failed:', e?.message);
    }

    return c.json({
      ok: true,
      url: publicUrl,
      storage_path: storagePath,
      size_bytes: bytes.length,
      type: isImage ? 'image' : 'video',
    });
  } catch (err: any) {
    console.error('[upload-creative-asset] Unhandled:', err);
    return c.json({ error: 'Internal error', details: err?.message?.slice(0, 200) }, 500);
  }
}
