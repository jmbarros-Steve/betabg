/**
 * GitHub REST API client — zero dependencies (native fetch only).
 *
 * Used by chino-code-executor to read files, create branches,
 * commit changes via Git Trees API, and open PRs.
 *
 * Auth: Fine-grained PAT with Contents (R/W) + Pull Requests (R/W).
 */

const OWNER = 'jmbarros-Steve';
const REPO = 'betabg';
const BASE_BRANCH = 'main';
const API_BASE = 'https://api.github.com';
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Core fetch with retry + rate limit handling ────────────────

async function githubApiFetch(
  path: string,
  token: string,
  options: {
    method?: string;
    body?: any;
    timeoutMs?: number;
  } = {},
): Promise<{ ok: boolean; data: any; status: number }> {
  const { method = 'GET', body, timeoutMs = 15_000 } = options;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = res.status === 204 ? null : await res.json();

      // Rate limit — wait and retry
      if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
        const resetAt = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
        const waitMs = Math.max(resetAt - Date.now(), 1000);
        console.warn(`[github-client] Rate limited, waiting ${waitMs}ms`);
        if (attempt < MAX_RETRIES) {
          await sleep(Math.min(waitMs, 30_000));
          continue;
        }
      }

      // Retry on 5xx
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        const backoff = BACKOFF_BASE_MS * (attempt + 1) + Math.random() * 500;
        console.warn(`[github-client] ${res.status} on ${method} ${path}, retry in ${Math.round(backoff)}ms`);
        await sleep(backoff);
        continue;
      }

      return { ok: res.ok, data, status: res.status };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (attempt < MAX_RETRIES) {
        const backoff = BACKOFF_BASE_MS * (attempt + 1);
        console.warn(`[github-client] Fetch error on ${path}: ${err.message}, retry in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      return { ok: false, data: { error: err.message }, status: 0 };
    }
  }

  return { ok: false, data: { error: 'max retries exceeded' }, status: 0 };
}

// ─── Read a single file from the repo ───────────────────────────

export async function readFile(
  token: string,
  path: string,
  ref: string = BASE_BRANCH,
): Promise<{ ok: boolean; content?: string; sha?: string; error?: string }> {
  const res = await githubApiFetch(
    `/repos/${OWNER}/${REPO}/contents/${path}?ref=${ref}`,
    token,
  );

  if (!res.ok) {
    return { ok: false, error: `${res.status}: ${JSON.stringify(res.data).substring(0, 200)}` };
  }

  if (res.data.encoding !== 'base64' || !res.data.content) {
    return { ok: false, error: `unexpected encoding: ${res.data.encoding}` };
  }

  const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
  return { ok: true, content, sha: res.data.sha };
}

// ─── Read multiple files in parallel (max 5) ────────────────────

export async function readMultipleFiles(
  token: string,
  paths: string[],
  ref: string = BASE_BRANCH,
): Promise<Map<string, { content: string; sha: string }>> {
  const results = new Map<string, { content: string; sha: string }>();
  const capped = paths.slice(0, 5); // hard cap

  const settled = await Promise.allSettled(
    capped.map(async (p) => {
      const r = await readFile(token, p, ref);
      if (r.ok && r.content && r.sha) {
        results.set(p, { content: r.content, sha: r.sha });
      } else {
        console.warn(`[github-client] Could not read ${p}: ${r.error}`);
      }
    }),
  );

  // Log rejections
  for (const s of settled) {
    if (s.status === 'rejected') {
      console.error(`[github-client] readMultipleFiles rejected:`, s.reason);
    }
  }

  return results;
}

// ─── Get latest commit SHA on main ──────────────────────────────

export async function getLatestCommitSha(token: string): Promise<{
  ok: boolean;
  sha?: string;
  error?: string;
}> {
  const res = await githubApiFetch(
    `/repos/${OWNER}/${REPO}/git/ref/heads/${BASE_BRANCH}`,
    token,
  );

  if (!res.ok) {
    return { ok: false, error: `${res.status}: ${JSON.stringify(res.data).substring(0, 200)}` };
  }

  return { ok: true, sha: res.data.object?.sha };
}

// ─── Create a branch from a SHA ─────────────────────────────────

export async function createBranch(
  token: string,
  name: string,
  fromSha: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await githubApiFetch(
    `/repos/${OWNER}/${REPO}/git/refs`,
    token,
    {
      method: 'POST',
      body: { ref: `refs/heads/${name}`, sha: fromSha },
    },
  );

  if (!res.ok) {
    return { ok: false, error: `${res.status}: ${JSON.stringify(res.data).substring(0, 200)}` };
  }

  return { ok: true };
}

// ─── Create a multi-file commit via Git Trees API ───────────────

export async function createCommitWithTree(
  token: string,
  branch: string,
  parentSha: string,
  files: Array<{ path: string; content: string }>,
  message: string,
): Promise<{ ok: boolean; commitSha?: string; error?: string }> {
  // 1. Create blobs for each file
  const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];

  for (const file of files) {
    const blobRes = await githubApiFetch(
      `/repos/${OWNER}/${REPO}/git/blobs`,
      token,
      {
        method: 'POST',
        body: { content: file.content, encoding: 'utf-8' },
      },
    );

    if (!blobRes.ok) {
      return { ok: false, error: `blob creation failed for ${file.path}: ${blobRes.status}` };
    }

    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobRes.data.sha,
    });
  }

  // 2. Create tree
  const treeRes = await githubApiFetch(
    `/repos/${OWNER}/${REPO}/git/trees`,
    token,
    {
      method: 'POST',
      body: { base_tree: parentSha, tree: treeItems },
    },
  );

  if (!treeRes.ok) {
    return { ok: false, error: `tree creation failed: ${treeRes.status}` };
  }

  // 3. Create commit
  const commitRes = await githubApiFetch(
    `/repos/${OWNER}/${REPO}/git/commits`,
    token,
    {
      method: 'POST',
      body: {
        message,
        tree: treeRes.data.sha,
        parents: [parentSha],
      },
    },
  );

  if (!commitRes.ok) {
    return { ok: false, error: `commit creation failed: ${commitRes.status}` };
  }

  // 4. Update branch ref to point to new commit
  const updateRefRes = await githubApiFetch(
    `/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`,
    token,
    {
      method: 'PATCH',
      body: { sha: commitRes.data.sha },
    },
  );

  if (!updateRefRes.ok) {
    return { ok: false, error: `ref update failed: ${updateRefRes.status}` };
  }

  return { ok: true, commitSha: commitRes.data.sha };
}

// ─── Create a Pull Request ──────────────────────────────────────

export async function createPullRequest(
  token: string,
  head: string,
  title: string,
  body: string,
): Promise<{ ok: boolean; prUrl?: string; prNumber?: number; error?: string }> {
  const res = await githubApiFetch(
    `/repos/${OWNER}/${REPO}/pulls`,
    token,
    {
      method: 'POST',
      body: {
        title,
        head,
        base: BASE_BRANCH,
        body,
      },
    },
  );

  if (!res.ok) {
    return { ok: false, error: `${res.status}: ${JSON.stringify(res.data).substring(0, 200)}` };
  }

  return { ok: true, prUrl: res.data.html_url, prNumber: res.data.number };
}

// ─── Delete a branch (cleanup on error) ─────────────────────────

export async function deleteBranch(
  token: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await githubApiFetch(
    `/repos/${OWNER}/${REPO}/git/refs/heads/${name}`,
    token,
    { method: 'DELETE' },
  );

  if (!res.ok && res.status !== 422) {
    // 422 = ref doesn't exist (already deleted), which is fine
    return { ok: false, error: `${res.status}` };
  }

  return { ok: true };
}
