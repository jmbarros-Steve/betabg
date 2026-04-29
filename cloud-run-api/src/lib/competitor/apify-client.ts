/**
 * Apify API client.
 *
 * Generic wrapper over Apify v2 endpoints used by the Competitor Intelligence
 * pipeline. Supports synchronous actor runs (run-sync-get-dataset-items),
 * asynchronous runs with polling, dataset fetching, and a curated registry of
 * actor IDs (ACTORS) so callers don't have to hardcode strings.
 *
 * Auth: Bearer APIFY_TOKEN (already provisioned in Cloud Run secrets).
 *
 * Every public function returns { data, cost, error } and never throws —
 * the orchestrator continues on graceful degradation.
 *
 * Owner: Sofía W14 (Integraciones)
 * Docs: https://docs.apify.com/api/v2
 */

const BASE_URL = 'https://api.apify.com';
const DEFAULT_SYNC_TIMEOUT_SECS = 120;
const DEFAULT_POLL_INTERVAL_MS = 4_000;
const DEFAULT_POLL_TOTAL_TIMEOUT_MS = 10 * 60_000; // 10 min hard cap

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface ApifyResponse<T> {
  data: T | null;
  cost: number;
  error: string | null;
}

export interface ApifySyncOptions {
  /** Max seconds to wait for the sync run before Apify returns whatever it has. */
  timeoutSecs?: number;
  /** Override the actor's default memory allocation. */
  memoryMbytes?: number;
}

export interface ApifyAsyncRun {
  id: string;
  actId: string;
  status: string;
  defaultDatasetId?: string;
  startedAt?: string;
  finishedAt?: string;
  usageTotalUsd?: number;
}

export interface ApifyWaitOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/**
 * Curated registry of actor IDs we use for competitor intel. Centralised here
 * so misspellings don't slip into orchestrators.
 */
export const ACTORS = {
  META_ADS_LIBRARY: 'apify/facebook-ads-library-scraper',
  META_ADS_LIBRARY_ALT: 'curious_coder/facebook-ads-library-scraper',
  GOOGLE_ADS_TRANSPARENCY: 'apify/google-ads-transparency-scraper',
  TIKTOK_ADS_CENTER: 'apify/tiktok-ads-creative-center-scraper',
  INSTAGRAM_PROFILE: 'apify/instagram-profile-scraper',
  INSTAGRAM_POSTS: 'apify/instagram-post-scraper',
  TIKTOK_PROFILE: 'apify/tiktok-scraper',
  YOUTUBE_CHANNEL: 'apify/youtube-scraper',
  FACEBOOK_PAGE: 'apify/facebook-pages-scraper',
  LINKEDIN_COMPANY: 'apify/linkedin-company-scraper',
  TWITTER_PROFILE: 'apify/twitter-scraper',
  TRUSTPILOT: 'apify/trustpilot-scraper',
  GOOGLE_MAPS_REVIEWS: 'apify/google-maps-reviews-scraper',
  SHOPIFY_PRODUCTS: 'apify/shopify-product-scraper',
  SIMILARWEB: 'tri_angle/similarweb-scraper',
  WEB_SCRAPER_GENERIC: 'apify/web-scraper',
} as const;

export type ApifyActorKey = keyof typeof ACTORS;

function getToken(): string | null {
  return process.env.APIFY_TOKEN ?? null;
}

/**
 * Apify accepts both `actor-id` (slug) and `username~actor-name` URL form.
 * Slugs containing "/" need to be encoded into the username~actor-name form.
 */
function encodeActorId(actorId: string): string {
  if (actorId.includes('~')) return actorId;
  if (actorId.includes('/')) {
    const [user, name] = actorId.split('/');
    return `${user}~${name}`;
  }
  return actorId;
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run an actor synchronously and return the dataset items in one shot.
 * Suitable for actors that finish in under ~2 minutes; for longer jobs
 * use runActorAsync + waitForRun.
 */
export async function runActorSync<T = unknown>(
  actorId: string,
  input: unknown,
  options: ApifySyncOptions = {}
): Promise<ApifyResponse<T[]>> {
  const token = getToken();
  if (!token) {
    return { data: null, cost: 0, error: 'Apify not configured' };
  }

  const timeoutSecs = options.timeoutSecs ?? DEFAULT_SYNC_TIMEOUT_SECS;
  const params = new URLSearchParams();
  params.set('timeout', String(timeoutSecs));
  if (options.memoryMbytes) params.set('memory', String(options.memoryMbytes));

  const url = `${BASE_URL}/v2/acts/${encodeActorId(actorId)}/run-sync-get-dataset-items?${params.toString()}`;

  console.log(`[apify] runActorSync: actor=${actorId} timeout=${timeoutSecs}s`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (timeoutSecs + 30) * 1000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      const errorMsg = text.slice(0, 500) || `HTTP ${res.status}`;
      console.log(`[apify] runActorSync failed: ${actorId} HTTP ${res.status}`);
      return { data: null, cost: 0, error: errorMsg };
    }
    let parsed: T[] | null = null;
    try {
      parsed = JSON.parse(text) as T[];
    } catch {
      return { data: null, cost: 0, error: 'invalid JSON from dataset' };
    }
    return { data: parsed ?? [], cost: 0, error: null };
  } catch (err: unknown) {
    clearTimeout(timer);
    const error = err instanceof Error ? err.message : String(err);
    console.log(`[apify] runActorSync error: ${actorId} ${error}`);
    return { data: null, cost: 0, error };
  }
}

/**
 * Start an actor run asynchronously and return immediately with run metadata.
 * Use waitForRun(runId) to poll until completion, then getRunDataset(runId).
 */
export async function runActorAsync(
  actorId: string,
  input: unknown
): Promise<ApifyResponse<ApifyAsyncRun>> {
  const token = getToken();
  if (!token) {
    return { data: null, cost: 0, error: 'Apify not configured' };
  }

  console.log(`[apify] runActorAsync: actor=${actorId}`);
  const url = `${BASE_URL}/v2/acts/${encodeActorId(actorId)}/runs`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
    const json = (await res.json().catch(() => null)) as { data?: ApifyAsyncRun; error?: { message?: string } } | null;
    if (!res.ok || !json?.data) {
      const error = json?.error?.message ?? `HTTP ${res.status}`;
      return { data: null, cost: 0, error };
    }
    return { data: json.data, cost: 0, error: null };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { data: null, cost: 0, error };
  }
}

/**
 * Get current status / metadata for a run (status, dataset id, usage).
 */
export async function getRunStatus(runId: string): Promise<ApifyResponse<ApifyAsyncRun>> {
  const token = getToken();
  if (!token) {
    return { data: null, cost: 0, error: 'Apify not configured' };
  }
  try {
    const res = await fetch(`${BASE_URL}/v2/actor-runs/${runId}`, {
      headers: authHeader(token),
    });
    const json = (await res.json().catch(() => null)) as { data?: ApifyAsyncRun; error?: { message?: string } } | null;
    if (!res.ok || !json?.data) {
      return { data: null, cost: 0, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    const cost = typeof json.data.usageTotalUsd === 'number' ? json.data.usageTotalUsd : 0;
    return { data: json.data, cost, error: null };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { data: null, cost: 0, error };
  }
}

/**
 * Fetch all dataset items for a finished run.
 */
export async function getRunDataset<T = unknown>(runId: string): Promise<ApifyResponse<T[]>> {
  const token = getToken();
  if (!token) {
    return { data: null, cost: 0, error: 'Apify not configured' };
  }
  try {
    const res = await fetch(`${BASE_URL}/v2/actor-runs/${runId}/dataset/items`, {
      headers: authHeader(token),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { data: null, cost: 0, error: text.slice(0, 500) || `HTTP ${res.status}` };
    }
    const items = (await res.json().catch(() => null)) as T[] | null;
    return { data: items ?? [], cost: 0, error: null };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { data: null, cost: 0, error };
  }
}

/**
 * Poll a running actor until status is terminal (SUCCEEDED, FAILED, ABORTED, TIMED-OUT).
 * Returns the final run metadata (with cost) — caller decides whether to fetch dataset.
 */
export async function waitForRun(
  runId: string,
  options: ApifyWaitOptions = {}
): Promise<ApifyResponse<ApifyAsyncRun>> {
  const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeout = options.timeoutMs ?? DEFAULT_POLL_TOTAL_TIMEOUT_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const status = await getRunStatus(runId);
    if (status.error) {
      // Network blip — wait and retry
      await sleep(pollInterval);
      continue;
    }
    const s = status.data?.status;
    if (s === 'SUCCEEDED') {
      const cost = status.data?.usageTotalUsd ?? 0;
      console.log(`[apify] waitForRun done: run=${runId} status=${s} cost=$${cost.toFixed(4)}`);
      return { data: status.data, cost, error: null };
    }
    if (s === 'FAILED' || s === 'ABORTED' || s === 'TIMED-OUT') {
      return { data: status.data, cost: status.cost, error: `run ${s}` };
    }
    await sleep(pollInterval);
  }

  return { data: null, cost: 0, error: 'waitForRun timeout' };
}
