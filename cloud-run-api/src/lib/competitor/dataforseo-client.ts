/**
 * DataForSEO API client.
 *
 * Wraps the DataForSEO v3 API endpoints used by the Competitor Intelligence
 * pipeline (organic traffic, ranked keywords, backlinks, competitors, pages,
 * keyword search volume).
 *
 * Auth: HTTP Basic with DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD env vars.
 *
 * Defaults to Chile (location_code = 2152). Every public function returns a
 * uniform { data, cost, error } envelope and never throws — the orchestrator
 * keeps running on graceful degradation if the API key isn't configured or a
 * single endpoint fails.
 *
 * Owner: Sofía W14 (Integraciones)
 * Docs: https://docs.dataforseo.com/v3/
 */

const BASE_URL = 'https://api.dataforseo.com';
const DEFAULT_LOCATION_CODE = '2152'; // Chile
const DEFAULT_LANGUAGE_CODE = 'es';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1_500;

let accumulatedCost = 0;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface DataForSeoResponse<T> {
  data: T | null;
  cost: number;
  error: string | null;
}

interface DataForSeoTask<T = unknown> {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: T[] | null;
}

interface DataForSeoEnvelope<T = unknown> {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: DataForSeoTask<T>[];
}

/** Total cost accumulated since the last reset (USD). */
export function getAccumulatedCost(): number {
  return accumulatedCost;
}

/** Reset the cost counter (call at the start of a new orchestration run). */
export function resetCost(): void {
  accumulatedCost = 0;
}

function getCredentials(): { login: string; password: string } | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return { login, password };
}

function basicAuthHeader(login: string, password: string): string {
  const token = Buffer.from(`${login}:${password}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/**
 * Low-level POST to a DataForSEO endpoint. Handles retry with exponential
 * backoff on 5xx responses, surfaces cost from the first task, and never
 * throws — errors collapse to the response envelope.
 */
async function postEndpoint<T>(
  endpoint: string,
  body: unknown
): Promise<DataForSeoResponse<T>> {
  const creds = getCredentials();
  if (!creds) {
    return { data: null, cost: 0, error: 'DataForSEO not configured' };
  }

  const url = `${BASE_URL}${endpoint}`;
  let lastError = 'unknown error';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(creds.login, creds.password),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // Retry on transient server errors
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        lastError = `HTTP ${response.status}`;
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[dataforseo] ${endpoint}: HTTP ${response.status}, retry in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      const json = (await response.json()) as DataForSeoEnvelope<T>;
      const task = json.tasks?.[0];
      const cost = typeof task?.cost === 'number' ? task.cost : (json.cost ?? 0);

      accumulatedCost += cost;
      console.log(`[dataforseo] ${endpoint}: cost=$${cost.toFixed(4)}`);

      // Top-level envelope error
      if (!response.ok || (json.status_code && json.status_code >= 40000)) {
        const msg = json.status_message ?? `HTTP ${response.status}`;
        return { data: null, cost, error: msg };
      }

      // Per-task error
      if (task?.status_code && task.status_code >= 40000) {
        return {
          data: null,
          cost,
          error: task.status_message ?? `task status_code=${task.status_code}`,
        };
      }

      const result = task?.result ?? null;
      return { data: (result as unknown as T) ?? null, cost, error: null };
    } catch (err: unknown) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`[dataforseo] ${endpoint}: ${lastError}, retry in ${delay}ms`);
        await sleep(delay);
        continue;
      }
    }
  }

  console.log(`[dataforseo] ${endpoint}: failed after ${MAX_RETRIES + 1} attempts: ${lastError}`);
  return { data: null, cost: 0, error: lastError };
}

function cleanDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

/**
 * Domain rank overview: organic / paid traffic estimates, traffic value, etc.
 * POST /v3/dataforseo_labs/google/domain_rank_overview/live
 */
export function getOrganicTrafficOverview(
  domain: string,
  locationCode: string = DEFAULT_LOCATION_CODE
): Promise<DataForSeoResponse<unknown>> {
  return postEndpoint('/v3/dataforseo_labs/google/domain_rank_overview/live', [
    {
      target: cleanDomain(domain),
      location_code: Number(locationCode),
      language_code: DEFAULT_LANGUAGE_CODE,
    },
  ]);
}

/**
 * Top organic keywords ranking for a domain.
 * POST /v3/dataforseo_labs/google/ranked_keywords/live
 */
export function getRankedKeywords(
  domain: string,
  locationCode: string = DEFAULT_LOCATION_CODE,
  limit: number = 1000
): Promise<DataForSeoResponse<unknown>> {
  return postEndpoint('/v3/dataforseo_labs/google/ranked_keywords/live', [
    {
      target: cleanDomain(domain),
      location_code: Number(locationCode),
      language_code: DEFAULT_LANGUAGE_CODE,
      limit: Math.min(Math.max(limit, 1), 1000),
      load_rank_absolute: true,
    },
  ]);
}

/**
 * Backlink summary: total backlinks, referring domains, rank, etc.
 * POST /v3/backlinks/summary/live
 */
export function getBacklinksSummary(
  domain: string
): Promise<DataForSeoResponse<unknown>> {
  return postEndpoint('/v3/backlinks/summary/live', [
    {
      target: cleanDomain(domain),
      internal_list_limit: 10,
      backlinks_status_type: 'live',
    },
  ]);
}

/**
 * Top backlinks pointing to a domain.
 * POST /v3/backlinks/backlinks/live
 */
export function getBacklinksTop(
  domain: string,
  limit: number = 100
): Promise<DataForSeoResponse<unknown>> {
  return postEndpoint('/v3/backlinks/backlinks/live', [
    {
      target: cleanDomain(domain),
      mode: 'as_is',
      limit: Math.min(Math.max(limit, 1), 1000),
      backlinks_status_type: 'live',
      order_by: ['rank,desc'],
    },
  ]);
}

/**
 * Competitor domains (organic SERP overlap).
 * POST /v3/dataforseo_labs/google/competitors_domain/live
 */
export function getCompetitorsDomains(
  domain: string,
  locationCode: string = DEFAULT_LOCATION_CODE,
  limit: number = 20
): Promise<DataForSeoResponse<unknown>> {
  return postEndpoint('/v3/dataforseo_labs/google/competitors_domain/live', [
    {
      target: cleanDomain(domain),
      location_code: Number(locationCode),
      language_code: DEFAULT_LANGUAGE_CODE,
      limit: Math.min(Math.max(limit, 1), 100),
    },
  ]);
}

/**
 * Most relevant pages of a domain by organic traffic.
 * POST /v3/dataforseo_labs/google/relevant_pages/live
 */
export function getDomainPages(
  domain: string,
  locationCode: string = DEFAULT_LOCATION_CODE,
  limit: number = 50
): Promise<DataForSeoResponse<unknown>> {
  return postEndpoint('/v3/dataforseo_labs/google/relevant_pages/live', [
    {
      target: cleanDomain(domain),
      location_code: Number(locationCode),
      language_code: DEFAULT_LANGUAGE_CODE,
      limit: Math.min(Math.max(limit, 1), 1000),
    },
  ]);
}

/**
 * Keyword search volume + CPC + competition (Google Ads data).
 * POST /v3/keywords_data/google_ads/search_volume/live
 */
export function getKeywordSearchVolume(
  keywords: string[],
  locationCode: string = DEFAULT_LOCATION_CODE
): Promise<DataForSeoResponse<unknown>> {
  const cleaned = keywords
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .slice(0, 1000);

  if (cleaned.length === 0) {
    return Promise.resolve({
      data: null,
      cost: 0,
      error: 'No keywords provided',
    });
  }

  return postEndpoint('/v3/keywords_data/google_ads/search_volume/live', [
    {
      keywords: cleaned,
      location_code: Number(locationCode),
      language_code: DEFAULT_LANGUAGE_CODE,
    },
  ]);
}
