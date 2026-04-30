import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';

/**
 * POST /api/meta/import-existing-creatives
 *
 * Importa los creativos existentes del ad account de Meta del cliente
 * (imágenes, videos y ad creatives) a la tabla `client_assets`. Idempotente:
 * los UNIQUE INDEX de la migración 20260429000000 evitan duplicados, así
 * que llamar dos veces solo agrega lo nuevo.
 *
 * Auth: JWT (user owner / admin) OR `X-Internal-Key` con service role key.
 *
 * Input: { client_id: string, force?: boolean }
 *   - force: reservado para futuras versiones (actualmente no-op, la
 *     idempotencia se hace con UPSERT).
 *
 * Output:
 *   {
 *     imported: { images: number, videos: number, creatives: number },
 *     skipped_existing: number,
 *     errors: string[]
 *   }
 *
 * Antipatrones que respeta (ver MEMORY.md):
 *   #1 — NO chequea `access_token_encrypted` antes de getTokenForConnection.
 *   #2 — Para SUAT NO usa `/me/adaccounts` (cross-merchant contamination).
 */

const META_API_BASE = 'https://graph.facebook.com/v23.0';

/** Hard cap: NO importamos más de 500 imágenes / 500 videos / 200 creatives
 *  por llamada para no saturar la DB ni gastar minutos de Cloud Run. */
const MAX_IMAGES = 500;
const MAX_VIDEOS = 500;
const MAX_CREATIVES = 200;
const PAGE_LIMIT = 200;

interface RequestBody {
  client_id?: string;
  force?: boolean;
}

interface MetaImage {
  hash: string;
  url?: string;
  permalink_url?: string;
  name?: string;
  width?: number;
  height?: number;
  creatives?: any[];
}

interface MetaVideo {
  id: string;
  source?: string;
  title?: string;
  permalink_url?: string;
  thumbnails?: any;
  length?: number;
}

interface MetaAdCreative {
  id: string;
  name?: string;
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  object_story_spec?: any;
}

interface ImportCounts {
  images: number;
  videos: number;
  creatives: number;
}

/**
 * Paginar a través de un endpoint Meta acumulando resultados hasta `maxItems`.
 */
async function paginateMeta<T>(
  initialPath: string,
  token: string,
  params: Record<string, string>,
  maxItems: number,
  errors: string[],
  logTag: string,
): Promise<T[]> {
  const out: T[] = [];

  // First request
  const firstUrl = new URL(`${META_API_BASE}${initialPath}`);
  for (const [k, v] of Object.entries(params)) firstUrl.searchParams.set(k, v);
  firstUrl.searchParams.set('limit', String(PAGE_LIMIT));

  let nextUrl: string | null = firstUrl.toString();
  let pageNum = 0;

  while (nextUrl && out.length < maxItems) {
    pageNum++;
    try {
      const res = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      let body: any;
      try {
        body = await res.json();
      } catch {
        errors.push(`${logTag}: non-JSON page ${pageNum} (HTTP ${res.status})`);
        break;
      }
      if (!res.ok || body?.error) {
        const msg = body?.error?.message || `HTTP ${res.status}`;
        errors.push(`${logTag} page ${pageNum}: ${msg}`);
        console.error(`[import-creatives] ${logTag} page ${pageNum} error:`, msg);
        break;
      }
      if (Array.isArray(body?.data)) {
        for (const item of body.data) {
          out.push(item as T);
          if (out.length >= maxItems) break;
        }
      }
      // Pagination cursor (re-using fetch without re-encoding token in URL)
      nextUrl = body?.paging?.next || null;
      if (nextUrl) {
        // Strip access_token from cursor URL — we use Authorization header
        try {
          const u = new URL(nextUrl);
          u.searchParams.delete('access_token');
          nextUrl = u.toString();
        } catch {
          /* keep raw */
        }
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'network error');
      errors.push(`${logTag} page ${pageNum}: ${msg}`);
      break;
    }
  }

  return out;
}

/**
 * Upsert con detección de "skipped vs imported" basada en si el row ya existía.
 * Devuelve { inserted, skipped }.
 */
async function upsertAsset(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  row: Record<string, any>,
  conflictTarget: 'client_id,meta_hash' | 'client_id,meta_id',
): Promise<'inserted' | 'skipped' | 'errored'> {
  // Estrategia: insert, y si falla por 23505 (unique violation) → skip.
  // No usamos onConflict ignoreDuplicates porque queremos contar bien.
  const { error } = await supabase.from('client_assets').insert(row);
  if (!error) return 'inserted';
  // 23505 = unique_violation
  if ((error as any).code === '23505') return 'skipped';
  // Otro error: log y reportar
  console.warn(`[import-creatives] Insert error (${conflictTarget}):`, error.message);
  return 'errored';
}

export async function importExistingCreatives(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    const isInternal = c.get('isInternal') === true;

    if (!user && !isInternal) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let body: RequestBody = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { client_id } = body;
    if (!client_id) {
      return c.json({ error: 'client_id required' }, 400);
    }

    // 1. Connection lookup (no chequeo access_token_encrypted — antipatrón #1)
    const { data: connection, error: connErr } = await supabase
      .from('platform_connections')
      .select('id, platform, access_token_encrypted, connection_type, client_id, account_id, clients!inner(user_id, client_user_id)')
      .eq('client_id', client_id)
      .eq('platform', 'meta')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connErr) {
      console.error('[import-creatives] DB error fetching connection:', connErr);
      return c.json({ error: 'Database error', details: connErr.message }, 500);
    }
    if (!connection) {
      return c.json({ error: 'No active Meta connection found for this client' }, 404);
    }

    // 2. Authorization
    if (!isInternal) {
      const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'super_admin'])
        .limit(1)
        .maybeSingle();
      const isAdmin = !!roleRow;
      const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
      if (!isAdmin && !isOwner) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    // 3. Resolve token
    const token = await getTokenForConnection(supabase, connection);
    if (!token) {
      console.error('[import-creatives] Failed to resolve token');
      return c.json({ error: 'Failed to resolve Meta token' }, 500);
    }

    const accountId = (connection as any).account_id as string | null;
    if (!accountId) {
      return c.json({ error: 'Meta connection has no account_id' }, 400);
    }

    const errors: string[] = [];
    const counts: ImportCounts = { images: 0, videos: 0, creatives: 0 };
    let skipped = 0;

    // 4. Fetch images, videos, creatives en paralelo (3 paginations independientes)
    const [images, videos, creatives] = await Promise.all([
      paginateMeta<MetaImage>(
        `/act_${accountId}/adimages`,
        token,
        { fields: 'hash,url,permalink_url,name,creatives,width,height' },
        MAX_IMAGES,
        errors,
        'adimages',
      ),
      paginateMeta<MetaVideo>(
        `/act_${accountId}/advideos`,
        token,
        { fields: 'id,source,title,permalink_url,thumbnails,length' },
        MAX_VIDEOS,
        errors,
        'advideos',
      ),
      paginateMeta<MetaAdCreative>(
        `/act_${accountId}/adcreatives`,
        token,
        { fields: 'id,name,thumbnail_url,image_url,video_id,object_story_spec' },
        MAX_CREATIVES,
        errors,
        'adcreatives',
      ),
    ]);

    console.log(`[import-creatives] client=${client_id} fetched: ${images.length} images, ${videos.length} videos, ${creatives.length} creatives`);

    // 5. UPSERT imágenes (conflict por meta_hash)
    for (const img of images) {
      if (!img.hash) continue;
      const url = img.url || img.permalink_url || '';
      if (!url) continue;
      const row = {
        client_id,
        url,
        nombre: img.name || `meta-image-${img.hash.slice(0, 8)}`,
        tipo: 'photo',
        source: 'meta_imported',
        meta_hash: img.hash,
        active: true,
        asset_metadata: {
          width: img.width ?? null,
          height: img.height ?? null,
          permalink_url: img.permalink_url ?? null,
          creatives: img.creatives ?? null,
        },
      };
      const result = await upsertAsset(supabase, row, 'client_id,meta_hash');
      if (result === 'inserted') counts.images++;
      else if (result === 'skipped') skipped++;
      else errors.push(`image hash=${img.hash.slice(0, 12)}: insert error`);
    }

    // 6. UPSERT videos (conflict por meta_id)
    for (const vid of videos) {
      if (!vid.id) continue;
      // Para videos preferimos source (URL del archivo) o permalink
      const url = vid.source || vid.permalink_url || '';
      if (!url) continue;
      const row = {
        client_id,
        url,
        nombre: vid.title || `meta-video-${vid.id}`,
        tipo: 'video',
        source: 'meta_imported',
        meta_id: vid.id,
        active: true,
        asset_metadata: {
          length: vid.length ?? null,
          permalink_url: vid.permalink_url ?? null,
          thumbnails: vid.thumbnails ?? null,
          source_url: vid.source ?? null,
        },
      };
      const result = await upsertAsset(supabase, row, 'client_id,meta_id');
      if (result === 'inserted') counts.videos++;
      else if (result === 'skipped') skipped++;
      else errors.push(`video id=${vid.id}: insert error`);
    }

    // 7. UPSERT ad creatives (conflict por meta_id — espacio compartido con
    //    videos: dos creatives nunca tienen el mismo id que un video, pero
    //    el UNIQUE INDEX es por (client_id, meta_id) así que la colisión sería
    //    cross-tipo. Mitigación: prefijamos con "creative_" para distinguir.)
    for (const cr of creatives) {
      if (!cr.id) continue;
      const url = cr.image_url || cr.thumbnail_url || '';
      if (!url) continue;
      const row = {
        client_id,
        url,
        nombre: cr.name || `meta-creative-${cr.id}`,
        tipo: 'creative',
        source: 'meta_imported',
        meta_id: `creative_${cr.id}`,
        active: true,
        asset_metadata: {
          creative_id_raw: cr.id,
          thumbnail_url: cr.thumbnail_url ?? null,
          image_url: cr.image_url ?? null,
          video_id: cr.video_id ?? null,
          object_story_spec: cr.object_story_spec ?? null,
        },
      };
      const result = await upsertAsset(supabase, row, 'client_id,meta_id');
      if (result === 'inserted') counts.creatives++;
      else if (result === 'skipped') skipped++;
      else errors.push(`creative id=${cr.id}: insert error`);
    }

    console.log(`[import-creatives] client=${client_id} imported: ${counts.images} images / ${counts.videos} videos / ${counts.creatives} creatives, skipped=${skipped}, errors=${errors.length}`);

    return c.json({
      imported: counts,
      skipped_existing: skipped,
      errors,
    });
  } catch (err: any) {
    console.error('[import-creatives] Unhandled error:', err);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
}
