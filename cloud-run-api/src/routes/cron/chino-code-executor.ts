import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import {
  readFile,
  readMultipleFiles,
  getLatestCommitSha,
  createBranch,
  createCommitWithTree,
  createPullRequest,
  deleteBranch,
} from '../../lib/github-client.js';

/**
 * POST /api/cron/chino-code-executor
 *
 * El Chino — Code Fix Executor
 *
 * Takes fixes with status=assigned, difficulty=manual, files_to_check non-empty.
 * Reads source files from GitHub, asks Claude for the fix, creates a PR.
 *
 * Cron: every 30 minutes
 */

const CODE_FIX_MODEL = 'claude-sonnet-4-20250514';
const MAX_FIXES_PER_RUN = 3;
const MAX_FILES_PER_FIX = 5;
const MAX_FILE_SIZE_KB = 50;

// Files/paths that MUST NEVER be modified via automated PRs
const PROTECTED_PATHS = [
  '.env',
  'package.json',
  'package-lock.json',
  'src/integrations/supabase/',
  'src/components/ui/',
  '.github/workflows/',
  'supabase/migrations/',
  'cloud-run-api/package.json',
  'cloud-run-api/package-lock.json',
  'tsconfig.json',
];

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.sql', '.md']);

// Patterns that indicate secrets in code — reject the whole PR
const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,  // JWT
  /sk-[A-Za-z0-9]{20,}/,                           // OpenAI/Anthropic key
  /ghp_[A-Za-z0-9]{36}/,                           // GitHub PAT (classic)
  /github_pat_[A-Za-z0-9_]{20,}/,                  // GitHub PAT (fine-grained)
  /AKIA[A-Z0-9]{16}/,                              // AWS access key
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,         // Private keys
  /xoxb-[0-9]{10,}-[A-Za-z0-9]{20,}/,             // Slack bot token
];

interface CodeFixResult {
  scanned: number;
  prs_created: number;
  failed: number;
  skipped: number;
  details: Array<{
    fix_id: string;
    check_number: number;
    outcome: 'pr_created' | 'failed' | 'skipped' | 'declined';
    note: string;
    pr_url?: string;
  }>;
}

// ─── Validation helpers ─────────────────────────────────────────

function isProtectedPath(filePath: string): boolean {
  return PROTECTED_PATHS.some(p => filePath.startsWith(p) || filePath === p);
}

function hasAllowedExtension(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  return ALLOWED_EXTENSIONS.has(ext);
}

function containsSecrets(content: string): boolean {
  return SECRET_PATTERNS.some(pattern => pattern.test(content));
}

function validateModifiedFiles(
  files: Array<{ path: string; content: string }>,
): { ok: boolean; reason?: string } {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, reason: 'no modified files' };
  }
  if (files.length > MAX_FILES_PER_FIX) {
    return { ok: false, reason: `too many files: ${files.length} > ${MAX_FILES_PER_FIX}` };
  }

  for (const f of files) {
    if (!f.path || typeof f.path !== 'string') {
      return { ok: false, reason: 'file missing path' };
    }
    if (isProtectedPath(f.path)) {
      return { ok: false, reason: `protected path: ${f.path}` };
    }
    if (!hasAllowedExtension(f.path)) {
      return { ok: false, reason: `disallowed extension: ${f.path}` };
    }
    if (!f.content || typeof f.content !== 'string') {
      return { ok: false, reason: `empty content for ${f.path}` };
    }
    const sizeKB = Buffer.byteLength(f.content, 'utf-8') / 1024;
    if (sizeKB > MAX_FILE_SIZE_KB) {
      return { ok: false, reason: `file too large: ${f.path} (${Math.round(sizeKB)}KB > ${MAX_FILE_SIZE_KB}KB)` };
    }
    if (containsSecrets(f.content)) {
      return { ok: false, reason: `secrets detected in ${f.path}` };
    }
  }

  return { ok: true };
}

// ─── Ask Claude for the code fix ────────────────────────────────

async function askClaudeForCodeFix(
  fix: any,
  check: any,
  fileContents: Map<string, { content: string; sha: string }>,
): Promise<{
  ok: boolean;
  can_fix?: boolean;
  modified_files?: Array<{ path: string; content: string }>;
  commit_message?: string;
  pr_body?: string;
  reason?: string;
  error?: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY not configured' };

  // Build file context
  const fileContext = Array.from(fileContents.entries())
    .map(([path, { content }]) => `### ${path}\n\`\`\`\n${content.substring(0, 15000)}\n\`\`\``)
    .join('\n\n');

  const prompt = `Eres un ingeniero senior de Steve Ads (React + Vite + TypeScript + Supabase + Hono).
Te paso un bug detectado por El Chino (sistema QA automatizado) y los archivos fuente involucrados.
Tu trabajo es producir el fix mínimo y seguro.

REGLAS DURAS:
1. Solo modifica archivos que te paso. NO inventes archivos nuevos.
2. Devuelve el archivo COMPLETO modificado (no diffs parciales).
3. Si no estás 100% seguro del fix, responde can_fix=false.
4. NUNCA modifiques imports de supabase/client ni componentes de shadcn/ui.
5. NUNCA agregues console.log de debug.
6. NUNCA cambies la firma de funciones exportadas (breaking change).
7. El fix debe ser MÍNIMO — no refactorices código que no está roto.
8. NUNCA incluyas secretos, tokens, o API keys en el código.

BUG DETECTADO:
- Check #${fix.check_number}: ${check?.description || '(sin descripción)'}
- Tipo: ${check?.check_type || 'unknown'}
- Plataforma: ${check?.platform || 'unknown'}
- Severidad: ${check?.severity || 'unknown'}
- Causa probable: ${fix.probable_cause || 'N/A'}
- Fix prompt:
${(fix.fix_prompt || '').substring(0, 3000)}

CHECK RESULT:
${JSON.stringify(fix.check_result || {}, null, 2).substring(0, 2000)}

ARCHIVOS FUENTE:
${fileContext}

Responde EXACTAMENTE en este JSON (sin markdown, sin texto extra):
{
  "can_fix": boolean,
  "reason": "explicación corta",
  "modified_files": [
    {
      "path": "ruta/exacta/del/archivo.ts",
      "content": "contenido completo del archivo modificado"
    }
  ],
  "commit_message": "fix(chino-#N): descripción corta del fix",
  "pr_body": "## Fix automático — El Chino #N\\n\\n### Problema\\n...\\n### Solución\\n...\\n### Archivos modificados\\n..."
}

Si can_fix=false, modified_files debe ser [].`;

  const result = await anthropicFetch(
    {
      model: CODE_FIX_MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    },
    apiKey,
    { timeoutMs: 60_000 },
  );

  if (!result.ok) {
    return { ok: false, error: `Claude API error: ${result.status}` };
  }

  const text: string = result.data?.content?.[0]?.text || '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.can_fix !== 'boolean') {
      return { ok: false, error: 'response missing can_fix field' };
    }
    return {
      ok: true,
      can_fix: parsed.can_fix,
      modified_files: parsed.modified_files || [],
      commit_message: parsed.commit_message || '',
      pr_body: parsed.pr_body || '',
      reason: parsed.reason || '',
    };
  } catch (err: any) {
    return { ok: false, error: `JSON parse failed: ${err.message}` };
  }
}

// ─── Process a single fix ───────────────────────────────────────

async function processSingleCodeFix(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fix: any,
  githubToken: string,
  result: CodeFixResult,
): Promise<void> {
  const fixId = fix.id;
  const checkNumber = fix.check_number;
  const filesToCheck: string[] = fix.files_to_check || [];

  console.log(`[chino/code-executor] Processing fix ${fixId} for check #${checkNumber} (${filesToCheck.length} files)`);

  // Lock: assigned → fixing
  const { data: locked, error: lockErr } = await supabase
    .from('steve_fix_queue')
    .update({ status: 'fixing' })
    .eq('id', fixId)
    .eq('status', 'assigned')
    .select('id')
    .maybeSingle();

  if (lockErr || !locked) {
    console.warn(`[chino/code-executor] Fix ${fixId} lock failed (race?). Skipping.`);
    result.skipped++;
    result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'skipped', note: 'lock failed' });
    return;
  }

  // Load check definition
  const { data: check, error: checkErr } = await supabase
    .from('chino_routine')
    .select('*')
    .eq('id', fix.check_id)
    .maybeSingle();

  if (checkErr || !check) {
    await markFailed(supabase, fixId, `Check definition not found: ${checkErr?.message || 'missing'}`);
    result.failed++;
    result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: 'check not found' });
    return;
  }

  // Filter files: only allowed extensions, skip protected
  const validFiles = filesToCheck
    .filter(f => hasAllowedExtension(f) && !isProtectedPath(f))
    .slice(0, MAX_FILES_PER_FIX);

  if (validFiles.length === 0) {
    await markFailed(supabase, fixId, 'No valid files to check after filtering protected/disallowed paths');
    result.failed++;
    result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: 'no valid files' });
    return;
  }

  // Read files from GitHub
  const fileContents = await readMultipleFiles(githubToken, validFiles);

  if (fileContents.size === 0) {
    await markFailed(supabase, fixId, `Could not read any files from GitHub: ${validFiles.join(', ')}`);
    result.failed++;
    result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: 'github read failed' });
    return;
  }

  // Ask Claude for the fix
  const claudeResult = await askClaudeForCodeFix(fix, check, fileContents);

  if (!claudeResult.ok) {
    await markFailed(supabase, fixId, `Claude error: ${claudeResult.error}`);
    result.failed++;
    result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: claudeResult.error || 'claude error' });
    return;
  }

  if (!claudeResult.can_fix) {
    await markFailed(supabase, fixId, `Claude declined: ${claudeResult.reason}`);
    result.failed++;
    result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'declined', note: claudeResult.reason || 'declined' });
    return;
  }

  // Validate modified files
  const validation = validateModifiedFiles(claudeResult.modified_files || []);
  if (!validation.ok) {
    await markFailed(supabase, fixId, `Validation failed: ${validation.reason}`);
    result.failed++;
    result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: `validation: ${validation.reason}` });
    return;
  }

  // Create branch + commit + PR
  const branchName = `chino/fix-${checkNumber}-${Date.now()}`;
  let branchCreated = false;

  try {
    // Get latest commit SHA
    const latestSha = await getLatestCommitSha(githubToken);
    if (!latestSha.ok || !latestSha.sha) {
      await markFailed(supabase, fixId, `Could not get latest SHA: ${latestSha.error}`);
      result.failed++;
      result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: 'sha failed' });
      return;
    }

    // Create branch
    const branchResult = await createBranch(githubToken, branchName, latestSha.sha);
    if (!branchResult.ok) {
      await markFailed(supabase, fixId, `Branch creation failed: ${branchResult.error}`);
      result.failed++;
      result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: 'branch failed' });
      return;
    }
    branchCreated = true;

    // Commit
    const commitMsg = claudeResult.commit_message || `fix(chino-#${checkNumber}): auto-fix`;
    const commitResult = await createCommitWithTree(
      githubToken,
      branchName,
      latestSha.sha,
      claudeResult.modified_files!,
      commitMsg,
    );

    if (!commitResult.ok) {
      await deleteBranch(githubToken, branchName);
      await markFailed(supabase, fixId, `Commit failed: ${commitResult.error}`);
      result.failed++;
      result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: 'commit failed' });
      return;
    }

    // Create PR
    const prTitle = `[Chino #${checkNumber}] ${(check.description || 'Auto-fix').substring(0, 60)}`;
    const prBody = (claudeResult.pr_body || '') +
      `\n\n---\n_PR generado automáticamente por El Chino Code Executor._\n_Fix ID: ${fixId}_`;

    const prResult = await createPullRequest(githubToken, branchName, prTitle, prBody);

    if (!prResult.ok) {
      await deleteBranch(githubToken, branchName);
      await markFailed(supabase, fixId, `PR creation failed: ${prResult.error}`);
      result.failed++;
      result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: 'pr failed' });
      return;
    }

    // Mark as deployed with PR URL
    await supabase
      .from('steve_fix_queue')
      .update({
        status: 'deployed',
        deploy_timestamp: new Date().toISOString(),
        agent_response: `Code Executor: PR created → ${prResult.prUrl}. Branch: ${branchName}. Files: ${claudeResult.modified_files!.map(f => f.path).join(', ')}. Reason: ${claudeResult.reason}`,
      })
      .eq('id', fixId);

    console.log(`[chino/code-executor] Fix ${fixId} → PR ${prResult.prUrl}`);
    result.prs_created++;
    result.details.push({
      fix_id: fixId,
      check_number: checkNumber,
      outcome: 'pr_created',
      note: `PR #${prResult.prNumber}`,
      pr_url: prResult.prUrl,
    });
  } catch (err: any) {
    // Cleanup branch on unexpected error
    if (branchCreated) {
      try { await deleteBranch(githubToken, branchName); } catch {}
    }
    await markFailed(supabase, fixId, `Unexpected error: ${err.message}`);
    result.failed++;
    result.details.push({ fix_id: fixId, check_number: checkNumber, outcome: 'failed', note: `crash: ${err.message}` });
  }
}

// ─── Helper: mark fix as failed ─────────────────────────────────

async function markFailed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fixId: string,
  reason: string,
): Promise<void> {
  console.error(`[chino/code-executor] Fix ${fixId} FAILED: ${reason}`);
  await supabase
    .from('steve_fix_queue')
    .update({
      status: 'failed',
      agent_response: `Code Executor: ${reason}`,
    })
    .eq('id', fixId);
}

// ─── Main handler ───────────────────────────────────────────────

export async function chinoCodeExecutor(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error('[chino/code-executor] GITHUB_TOKEN not configured');
    return c.json({ error: 'GITHUB_TOKEN not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const result: CodeFixResult = {
    scanned: 0,
    prs_created: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  console.log('[chino/code-executor] Starting code executor run');

  try {
    // Fetch fixes: assigned + manual + has files_to_check
    const { data: fixes, error: queueErr } = await supabase
      .from('steve_fix_queue')
      .select('*')
      .eq('status', 'assigned')
      .eq('difficulty', 'manual')
      .not('files_to_check', 'is', null)
      .order('created_at', { ascending: true })
      .limit(MAX_FIXES_PER_RUN);

    if (queueErr) {
      console.error('[chino/code-executor] Queue fetch failed:', queueErr.message);
      return c.json({ error: queueErr.message }, 500);
    }

    // Filter: only fixes with non-empty files_to_check array
    const eligibleFixes = (fixes || []).filter(
      (f: any) => Array.isArray(f.files_to_check) && f.files_to_check.length > 0,
    );

    if (eligibleFixes.length === 0) {
      console.log('[chino/code-executor] No eligible code fixes — nothing to do');
      return c.json({ ...result, message: 'no eligible code fixes' });
    }

    result.scanned = eligibleFixes.length;
    console.log(`[chino/code-executor] Found ${eligibleFixes.length} eligible code fix(es)`);

    // Process sequentially (to avoid GitHub API rate limits)
    for (const fix of eligibleFixes) {
      try {
        await processSingleCodeFix(supabase, fix, githubToken, result);
      } catch (err: any) {
        console.error(`[chino/code-executor] Crash on fix ${fix?.id}:`, err.message);
        try {
          await markFailed(supabase, fix.id, `Crash: ${err.message}`);
        } catch {}
        result.failed++;
        result.details.push({
          fix_id: fix?.id || 'unknown',
          check_number: fix?.check_number || 0,
          outcome: 'failed',
          note: `crash: ${err.message}`,
        });
      }
    }

    console.log(
      `[chino/code-executor] Done — scanned=${result.scanned} prs=${result.prs_created} failed=${result.failed} skipped=${result.skipped}`,
    );

    return c.json(result);
  } catch (err: any) {
    console.error('[chino/code-executor] Top-level error:', err.message);
    return c.json({ error: err.message || 'internal error' }, 500);
  }
}
