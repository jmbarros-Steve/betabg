/**
 * Brief Estudio — Etapa 5: shared loader
 *
 * Carga el paquete completo de assets del Brief Estudio de un cliente en una
 * sola llamada (4 tablas en paralelo + hidratación de productos Shopify).
 *
 * NO hace validación de acceso — se asume que el caller ya validó ownership
 * del clientId (wizard de Meta Ads, cron jobs, endpoints backend con JWT).
 *
 * Compatibilidad: si `studio_ready=false` o las tablas están vacías, devuelve
 * el mismo shape con campos null/arrays vacíos. El caller decide si usa los
 * assets o cae al flujo legacy.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types — reflejan las tablas brand_* de Etapa 1
// ---------------------------------------------------------------------------

export interface BrandActor {
  id: string;
  client_id: string;
  source: 'ai_generated' | 'user_upload' | 'real_model';
  name: string | null;
  reference_images: string[];
  persona_tags: string[];
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BrandVoice {
  id: string;
  client_id: string;
  source: 'xtts_cloned' | 'preset' | 'none';
  voice_id: string | null;
  sample_url: string | null;
  preset_key: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandMusicPreferences {
  id: string;
  client_id: string;
  moods: string[];
  keywords: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Shape mínimo del producto Shopify que necesita la pipeline creativa.
 * Campos elegidos para cubrir prompt building (título, tipo, descripción,
 * precio) + reference image (image_url) para Flux Kontext / Runway.
 */
export interface ShopifyProductMinimal {
  id: string;
  shopify_product_id: string;
  title: string;
  product_type: string | null;
  image_url: string | null;
  price: number | null;
  body_html: string | null;
}

export interface StudioAssets {
  studio_ready: boolean;
  primary_actor: BrandActor | null;
  primary_voice: BrandVoice | null;
  featured_products: ShopifyProductMinimal[];
  music_preferences: BrandMusicPreferences | null;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Lee las 4 tablas Brief Estudio + hidrata `brand_featured_products` con los
 * campos reales de `shopify_products`. Devuelve el paquete completo aunque
 * `studio_ready=false` — el caller decide si usa o no.
 *
 * Parallelized con Promise.all para mantener la latencia <= 1 round-trip.
 */
export async function loadStudioAssets(
  supabase: SupabaseClient,
  clientId: string,
): Promise<StudioAssets> {
  if (!clientId || !clientId.trim()) {
    return emptyStudioAssets();
  }

  const [clientRes, actorsRes, voiceRes, featuredRes, musicRes] = await Promise.all([
    supabase
      .from('clients')
      .select('studio_ready')
      .eq('id', clientId)
      .maybeSingle(),
    supabase
      .from('brand_actors')
      .select('*')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(5),
    supabase
      .from('brand_voices')
      .select('*')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('brand_featured_products')
      .select('shopify_product_id, priority')
      .eq('client_id', clientId)
      .eq('is_featured', true)
      .order('priority', { ascending: false }),
    supabase
      .from('brand_music_preferences')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle(),
  ]);

  const studioReady = Boolean(
    (clientRes.data as { studio_ready?: boolean } | null)?.studio_ready,
  );

  const actors = (actorsRes.data as BrandActor[] | null) ?? [];
  const primary_actor = actors.find((a) => a.is_primary) ?? actors[0] ?? null;

  const primary_voice = (voiceRes.data as BrandVoice | null) ?? null;

  // Hidratar featured_products con la info real de shopify_products. Usa el
  // mismo client_id para evitar cross-tenant leaks.
  const featuredRows =
    (featuredRes.data as Array<{ shopify_product_id: string; priority: number }> | null) ?? [];
  const featured_products: ShopifyProductMinimal[] = [];

  if (featuredRows.length > 0) {
    const ids = featuredRows.map((r) => r.shopify_product_id);
    // CRITICAL: select solo columnas que existen en shopify_products.
    // Schema real: id, shopify_product_id, title, product_type, image_url,
    // price_min, price_max, description (NO hay `price` ni `body_html`).
    // El bug original pedía `price` y `body_html` → query fallaba con 42703
    // → featured_products llegaba VACÍO → bug del "producto falso" en Kling
    // porque el actor era la única ref que llegaba al modelo.
    const { data: products, error: prodErr } = await supabase
      .from('shopify_products')
      .select('id, shopify_product_id, title, product_type, image_url, price_min, price_max, description')
      .eq('client_id', clientId)
      .in('shopify_product_id', ids);

    if (prodErr) {
      console.error('[brief-estudio-loader] shopify_products query failed:', prodErr.message);
    }

    // Preservar el orden por priority: el primero en `featuredRows` es el top.
    const priorityMap = new Map(featuredRows.map((r) => [r.shopify_product_id, r.priority]));
    const hydrated: ShopifyProductMinimal[] = (products ?? []).map((p: Record<string, unknown>) => ({
      id: String(p.id ?? ''),
      shopify_product_id: String(p.shopify_product_id ?? ''),
      title: (p.title as string) || '',
      product_type: (p.product_type as string) || null,
      image_url: (p.image_url as string) || null,
      price: typeof p.price_min === 'number' ? p.price_min : p.price_min ? Number(p.price_min) : null,
      body_html: (p.description as string) || null,
    }));

    hydrated.sort(
      (a, b) =>
        (priorityMap.get(b.shopify_product_id) ?? 0) -
        (priorityMap.get(a.shopify_product_id) ?? 0),
    );
    featured_products.push(...hydrated);
  }

  const music_preferences = (musicRes.data as BrandMusicPreferences | null) ?? null;

  return {
    studio_ready: studioReady,
    primary_actor,
    primary_voice,
    featured_products,
    music_preferences,
  };
}

function emptyStudioAssets(): StudioAssets {
  return {
    studio_ready: false,
    primary_actor: null,
    primary_voice: null,
    featured_products: [],
    music_preferences: null,
  };
}

/**
 * Deriva el snapshot JSON inmutable para guardar en `ad_creatives.asset_snapshot`
 * al momento de generar un creative. Si `studio_ready=false` pero hay algunos
 * assets parciales, igual se guarda el que exista (el caller decide si tiene
 * sentido) — esto habilita edit-safety para el subset que sí se usó.
 */
export function buildAssetSnapshot(
  assets: StudioAssets,
  extras: {
    music_track_id?: string | null;
    mood_key?: string | null;
    featured_product_index?: number;
  } = {},
): Record<string, unknown> {
  const pickedProduct =
    assets.featured_products[extras.featured_product_index ?? 0] ?? null;

  return {
    actor_id: assets.primary_actor?.id ?? null,
    actor_reference_image: assets.primary_actor?.reference_images?.[0] ?? null,
    voice_id: assets.primary_voice?.voice_id ?? null,
    voice_source: assets.primary_voice?.source ?? null,
    voice_preset_key: assets.primary_voice?.preset_key ?? null,
    product_id: pickedProduct?.shopify_product_id ?? null,
    product_title: pickedProduct?.title ?? null,
    music_track_id: extras.music_track_id ?? null,
    mood_key: extras.mood_key ?? null,
    studio_ready: assets.studio_ready,
    snapshot_at: new Date().toISOString(),
  };
}
