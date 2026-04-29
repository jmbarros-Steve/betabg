/**
 * Firecrawl API client.
 *
 * Wraps the v1 Firecrawl endpoints used by the Competitor Intelligence
 * pipeline: scrape (single page), crawl (multi-page async), map (URL discovery).
 *
 * Auth: Bearer FIRECRAWL_API_KEY (already provisioned in Cloud Run secrets).
 *
 * Every public function returns { data, cost, error } and never throws — the
 * orchestrator continues on graceful degradation when the key is missing or
 * a single call fails. SSRF protection is enforced through validateUrlForSSRF
 * before any URL leaves this process.
 *
 * Owner: Sofía W14 (Integraciones)
 * Docs: https://docs.firecrawl.dev/
 */

import { validateUrlForSSRF } from '../url-validator.js';

const BASE_URL = 'https://api.firecrawl.dev';
const SCRAPE_TIMEOUT_MS = 90_000;
const CRAWL_TOTAL_TIMEOUT_MS = 180_000;
const CRAWL_POLL_INTERVAL_MS = 5_000;
const COST_PER_PAGE_USD = 0.001; // Approximate, adjust when usage stats are exposed.

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface FirecrawlResponse<T> {
  data: T | null;
  cost: number;
  error: string | null;
}

export interface FirecrawlScrapeOptions {
  screenshot?: boolean;
  waitFor?: number;
  onlyMainContent?: boolean;
}

export interface FirecrawlCrawlOptions {
  maxPages?: number;
  includePaths?: string[];
  excludePaths?: string[];
}

export interface FirecrawlScrapeResult {
  url: string;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  screenshot?: string;
  metadata?: Record<string, unknown>;
}

export interface FirecrawlCrawlResult {
  status: string;
  total: number;
  completed: number;
  data: FirecrawlScrapeResult[];
}

export interface FirecrawlMapResult {
  links: string[];
}

function getApiKey(): string | null {
  return process.env.FIRECRAWL_API_KEY ?? null;
}

interface FirecrawlEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Single-attempt POST to Firecrawl with 1-time retry on failure.
 */
async function postJson<T>(
  path: string,
  body: unknown,
  apiKey: string,
  timeoutMs: number,
  attempts: number = 2
): Promise<{ ok: boolean; status: number; json: FirecrawlEnvelope<T> | null; error: string | null }> {
  let lastError = 'unknown error';
  let lastStatus = 0;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      lastStatus = res.status;
      const json = (await res.json().catch(() => null)) as FirecrawlEnvelope<T> | null;
      if (!res.ok) {
        lastError = json?.error ?? json?.message ?? `HTTP ${res.status}`;
        if (attempt < attempts - 1 && res.status >= 500) {
          await sleep(1500);
          continue;
        }
        return { ok: false, status: res.status, json, error: lastError };
      }
      return { ok: true, status: res.status, json, error: null };
    } catch (err: unknown) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < attempts - 1) {
        await sleep(1500);
        continue;
      }
    }
  }
  return { ok: false, status: lastStatus, json: null, error: lastError };
}

async function getJson<T>(
  path: string,
  apiKey: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; json: FirecrawlEnvelope<T> | null; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const json = (await res.json().catch(() => null)) as FirecrawlEnvelope<T> | null;
    if (!res.ok) {
      const error = json?.error ?? json?.message ?? `HTTP ${res.status}`;
      return { ok: false, status: res.status, json, error };
    }
    return { ok: true, status: res.status, json, error: null };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, json: null, error };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrape a single URL. Returns markdown + html (and screenshot if requested).
 * Defaults to waitFor=3000ms and onlyMainContent=false.
 */
export async function scrapePage(
  url: string,
  options: FirecrawlScrapeOptions = {}
): Promise<FirecrawlResponse<FirecrawlScrapeResult>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { data: null, cost: 0, error: 'Firecrawl not configured' };
  }

  const ssrf = validateUrlForSSRF(url);
  if (!ssrf.safe) {
    console.log(`[firecrawl] scrapePage SSRF blocked: ${ssrf.reason} url=${url}`);
    return { data: null, cost: 0, error: `SSRF blocked: ${ssrf.reason}` };
  }

  const formats: string[] = ['markdown', 'html'];
  if (options.screenshot) formats.push('screenshot');

  const body = {
    url,
    formats,
    waitFor: options.waitFor ?? 3000,
    onlyMainContent: options.onlyMainContent ?? false,
  };

  console.log(`[firecrawl] scrapePage: ${url}`);
  const res = await postJson<FirecrawlScrapeResult>('/v1/scrape', body, apiKey, SCRAPE_TIMEOUT_MS);
  if (!res.ok || !res.json?.data) {
    return { data: null, cost: 0, error: res.error ?? 'no data' };
  }
  return { data: res.json.data, cost: COST_PER_PAGE_USD, error: null };
}

/**
 * Crawl a site asynchronously, polling /v1/crawl/{id} every 5s until status=completed.
 * Returns aggregated pages or fails on total timeout.
 */
export async function crawlSite(
  url: string,
  options: FirecrawlCrawlOptions = {}
): Promise<FirecrawlResponse<FirecrawlCrawlResult>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { data: null, cost: 0, error: 'Firecrawl not configured' };
  }

  const ssrf = validateUrlForSSRF(url);
  if (!ssrf.safe) {
    console.log(`[firecrawl] crawlSite SSRF blocked: ${ssrf.reason} url=${url}`);
    return { data: null, cost: 0, error: `SSRF blocked: ${ssrf.reason}` };
  }

  const body: Record<string, unknown> = {
    url,
    limit: options.maxPages ?? 25,
    scrapeOptions: {
      formats: ['markdown', 'html'],
      onlyMainContent: false,
    },
  };
  if (options.includePaths && options.includePaths.length > 0) {
    body.includePaths = options.includePaths;
  }
  if (options.excludePaths && options.excludePaths.length > 0) {
    body.excludePaths = options.excludePaths;
  }

  console.log(`[firecrawl] crawlSite start: ${url} maxPages=${options.maxPages ?? 25}`);

  // Kick off crawl
  const start = await postJson<{ id?: string; jobId?: string }>(
    '/v1/crawl',
    body,
    apiKey,
    SCRAPE_TIMEOUT_MS
  );
  if (!start.ok) {
    return { data: null, cost: 0, error: start.error ?? 'crawl start failed' };
  }
  // Firecrawl v1 may return id at top-level or under data
  const startEnvelope = start.json as
    | (FirecrawlEnvelope<{ id?: string; jobId?: string }> & { id?: string; jobId?: string })
    | null;
  const crawlId =
    startEnvelope?.data?.id ??
    startEnvelope?.data?.jobId ??
    startEnvelope?.id ??
    startEnvelope?.jobId ??
    null;
  if (!crawlId) {
    return { data: null, cost: 0, error: 'crawl id missing in response' };
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < CRAWL_TOTAL_TIMEOUT_MS) {
    await sleep(CRAWL_POLL_INTERVAL_MS);
    const poll = await getJson<FirecrawlCrawlResult>(`/v1/crawl/${crawlId}`, apiKey, 30_000);
    if (!poll.ok) {
      console.log(`[firecrawl] crawlSite poll failed: ${poll.error}`);
      continue;
    }
    // The poll envelope is shaped { status, total, completed, data: [...] }
    // It may live at the root or under .data depending on API version.
    const envelope = poll.json as unknown as FirecrawlCrawlResult & {
      data?: FirecrawlCrawlResult;
    };
    const status = envelope?.status ?? envelope?.data?.status;
    if (status === 'completed') {
      const final: FirecrawlCrawlResult = {
        status: 'completed',
        total: envelope.total ?? envelope.data?.total ?? 0,
        completed: envelope.completed ?? envelope.data?.completed ?? 0,
        data: (envelope.data && Array.isArray((envelope.data as unknown as { data?: unknown[] }).data)
          ? ((envelope.data as unknown as { data: FirecrawlScrapeResult[] }).data)
          : Array.isArray(envelope.data)
            ? (envelope.data as unknown as FirecrawlScrapeResult[])
            : []) as FirecrawlScrapeResult[],
      };
      const cost = (final.completed || final.data.length) * COST_PER_PAGE_USD;
      console.log(`[firecrawl] crawlSite done: ${final.completed} pages, cost=$${cost.toFixed(4)}`);
      return { data: final, cost, error: null };
    }
    if (status === 'failed' || status === 'cancelled') {
      return { data: null, cost: 0, error: `crawl ${status}` };
    }
  }

  return { data: null, cost: 0, error: 'crawl timeout' };
}

/**
 * Map a site to discover its URL graph (no scraping).
 */
export async function mapSite(url: string): Promise<FirecrawlResponse<FirecrawlMapResult>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { data: null, cost: 0, error: 'Firecrawl not configured' };
  }

  const ssrf = validateUrlForSSRF(url);
  if (!ssrf.safe) {
    console.log(`[firecrawl] mapSite SSRF blocked: ${ssrf.reason} url=${url}`);
    return { data: null, cost: 0, error: `SSRF blocked: ${ssrf.reason}` };
  }

  console.log(`[firecrawl] mapSite: ${url}`);
  const res = await postJson<FirecrawlMapResult | { links: string[] }>(
    '/v1/map',
    { url },
    apiKey,
    SCRAPE_TIMEOUT_MS
  );
  if (!res.ok) {
    return { data: null, cost: 0, error: res.error ?? 'map failed' };
  }

  // Firecrawl returns { success, links: [...] } at the root for /v1/map.
  const envelope = res.json as
    | (FirecrawlEnvelope<FirecrawlMapResult> & { links?: string[] })
    | null;
  const links =
    envelope?.data?.links ??
    envelope?.links ??
    [];

  return { data: { links }, cost: 0, error: null };
}
