import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';
import { sendEscalationWhatsApp } from '../../chino/whatsapp.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * POST /api/cron/chino-executor
 *
 * El Chino — Auto-Fix Executor (Sebastián W5)
 *
 * Toma fixes en status `assigned` y los ejecuta via Claude.
 * Esta primera versión SOLO soporta fixes de DATA (UPDATE/INSERT/DELETE
 * en tablas Supabase). NO toca código ni hace deploy automático.
 *
 * Flujo: assigned → fixing → deployed | failed | escalated
 *
 * El cron `chino-fixer` (STEP A) ya re-testea fixes en `deployed` después
 * de 5 minutos y los mueve a `fixed` o reintenta.
 *
 * Auth: header X-Cron-Secret
 *
 * Cron sugerido: cada 15 minutos
 *   gcloud scheduler jobs create http chino-executor \
 *     --schedule="*\/15 * * * *" \
 *     --uri="https://steve-api-850416724643.us-central1.run.app/api/cron/chino-executor" \
 *     --http-method=POST \
 *     --headers="X-Cron-Secret=...,Content-Type=application/json" \
 *     --location=us-central1 --project=steveapp-agency
 */

const EXECUTOR_MODEL = 'claude-sonnet-4-20250514';
const MAX_FIXES_PER_RUN = 5;

// Tablas que el executor TIENE PROHIBIDO tocar — defensa en profundidad.
// Cualquier op contra estas tablas se rechaza en runtime aunque Claude la pida.
const PROTECTED_TABLES = new Set<string>([
  // Auth / identidad
  'users',
  'user_roles',
  'auth.users',
  // Tokens / secretos
  'platform_connections',
  'oauth_states',
  'wa_twilio_accounts',
  // Pagos
  'invoices',
  'credit_transactions',
  'wa_credit_transactions',
  'user_subscriptions',
  // El propio queue
  'steve_fix_queue',
  // Logs históricos que NO se deben mutar
  'chino_reports',
  'agent_sessions',
]);

// Tablas que sí pueden mutarse (whitelist explícita).
// Si no está aquí, se rechaza. Esto es paranoia intencional.
const ALLOWED_TABLES = new Set<string>([
  'chino_routine',
  'campaign_metrics',
  'platform_metrics',
  'shopify_products',
  'shopify_collections',
  'email_subscribers',
  'email_send_queue',
  'email_events',
  'tasks',
  'backlog',
  'criterio_results',
  'qa_log',
  'meta_campaigns',
  'meta_rule_execution_log',
  'steve_knowledge',
  'wa_pending_actions',
  'learning_queue',
]);

type SupportedOp = 'update' | 'insert' | 'delete';

interface FixOperation {
  op: SupportedOp;
  table: string;
  filter?: Record<string, any>; // mandatorio para update/delete
  values?: Record<string, any>; // mandatorio para update/insert
  reason: string;
}

interface FixPlan {
  can_fix: boolean;
  reason: string;
  operations: FixOperation[];
}

interface ExecutorResult {
  scanned: number;
  succeeded: number;
  failed: number;
  escalated: number;
  skipped: number;
  details: Array<{
    fix_id: string;
    check_number: number;
    outcome: 'deployed' | 'failed' | 'escalated' | 'skipped';
    note: string;
  }>;
}

// ─── Auth ───────────────────────────────────────────────────────

function verifyCronSecret(c: Context): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return c.req.header('X-Cron-Secret') === expected;
}

// ─── Validación de operaciones ──────────────────────────────────

function validateOperation(op: FixOperation): { ok: boolean; reason?: string } {
  if (!op || typeof op !== 'object') {
    return { ok: false, reason: 'op must be an object' };
  }
  if (!['update', 'insert', 'delete'].includes(op.op)) {
    return { ok: false, reason: `unsupported op: ${op.op}` };
  }
  if (!op.table || typeof op.table !== 'string') {
    return { ok: false, reason: 'op.table must be a non-empty string' };
  }
  if (PROTECTED_TABLES.has(op.table)) {
    return { ok: false, reason: `table ${op.table} is PROTECTED` };
  }
  if (!ALLOWED_TABLES.has(op.table)) {
    return { ok: false, reason: `table ${op.table} not in ALLOWED_TABLES whitelist` };
  }
  if (op.op === 'update') {
    if (!op.filter || typeof op.filter !== 'object' || Object.keys(op.filter).length === 0) {
      return { ok: false, reason: 'update requires non-empty filter' };
    }
    if (!op.values || typeof op.values !== 'object' || Object.keys(op.values).length === 0) {
      return { ok: false, reason: 'update requires non-empty values' };
    }
  }
  if (op.op === 'insert') {
    if (!op.values || typeof op.values !== 'object' || Object.keys(op.values).length === 0) {
      return { ok: false, reason: 'insert requires non-empty values' };
    }
  }
  if (op.op === 'delete') {
    if (!op.filter || typeof op.filter !== 'object' || Object.keys(op.filter).length === 0) {
      return { ok: false, reason: 'delete requires non-empty filter (NEVER mass-delete)' };
    }
  }
  return { ok: true };
}

// ─── Aplicar una operación ──────────────────────────────────────

async function applyOperation(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  op: FixOperation
): Promise<{ ok: boolean; error?: string; affected?: number }> {
  try {
    if (op.op === 'update') {
      let query = supabase.from(op.table).update(op.values!);
      for (const [k, v] of Object.entries(op.filter!)) {
        query = query.eq(k, v);
      }
      const { data, error } = await query.select('*');
      if (error) return { ok: false, error: error.message };
      return { ok: true, affected: data?.length || 0 };
    }
    if (op.op === 'insert') {
      const { data, error } = await supabase.from(op.table).insert(op.values!).select('*');
      if (error) return { ok: false, error: error.message };
      return { ok: true, affected: data?.length || 0 };
    }
    if (op.op === 'delete') {
      let query = supabase.from(op.table).delete();
      for (const [k, v] of Object.entries(op.filter!)) {
        query = query.eq(k, v);
      }
      const { data, error } = await query.select('*');
      if (error) return { ok: false, error: error.message };
      return { ok: true, affected: data?.length || 0 };
    }
    return { ok: false, error: `unknown op: ${(op as any).op}` };
  } catch (err: any) {
    return { ok: false, error: err.message || 'unknown error applying op' };
  }
}

// ─── Llamar a Claude para producir el plan de fix ───────────────

async function planFixWithClaude(fix: any, check: any): Promise<{
  ok: boolean;
  plan?: FixPlan;
  raw?: string;
  error?: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY not configured' };
  }

  const allowed = Array.from(ALLOWED_TABLES).join(', ');
  const protectedList = Array.from(PROTECTED_TABLES).join(', ');

  const prompt = `Eres un ingeniero de datos senior de Steve Ads. Te paso un fix QA pendiente
y necesitas generar un PLAN DE OPERACIONES DE BASE DE DATOS para resolverlo.

REGLAS DURAS (no negociables):
1. Solo puedes producir operaciones contra estas tablas (whitelist):
${allowed}
2. NUNCA toques estas tablas (lista negra):
${protectedList}
3. Si el fix requiere modificar CÓDIGO, no hay nada que puedas hacer: responde can_fix=false.
4. Cada UPDATE/DELETE DEBE tener filter no vacío (jamás operaciones masivas sin filtro).
5. Solo se permiten ops: update, insert, delete. Nada de SQL crudo.
6. Si no estás SEGURO 100% de la solución correcta, responde can_fix=false con la razón.

CONTEXTO DEL FIX
- Check #${fix.check_number}: ${check?.description || '(sin descripción)'}
- Tipo de check: ${check?.check_type || 'unknown'}
- Plataforma: ${check?.platform || 'unknown'}
- Severidad: ${check?.severity || 'unknown'}
- Causa probable: ${fix.probable_cause || 'N/A'}
- Files to check: ${JSON.stringify(fix.files_to_check || [])}
- Fix prompt original:
${(fix.fix_prompt || '').substring(0, 2000)}

CHECK RESULT (lo que detectó El Chino)
${JSON.stringify(fix.check_result || {}, null, 2)}

Responde EXACTAMENTE en este JSON (sin markdown, sin texto extra):
{
  "can_fix": boolean,
  "reason": "explicación corta de qué vas a hacer (o por qué no puedes)",
  "operations": [
    {
      "op": "update" | "insert" | "delete",
      "table": "nombre_tabla_whitelist",
      "filter": { "column": "value" },
      "values": { "column": "value" },
      "reason": "por qué esta operación arregla el problema"
    }
  ]
}

Si can_fix=false, operations debe ser [].`;

  const result = await anthropicFetch(
    {
      model: EXECUTOR_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    },
    apiKey,
    { timeoutMs: 30_000 }
  );

  if (!result.ok) {
    return { ok: false, error: `Claude API error: ${result.status} ${JSON.stringify(result.data).substring(0, 200)}` };
  }

  const text: string = result.data?.content?.[0]?.text || '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as FixPlan;
    if (typeof parsed.can_fix !== 'boolean') {
      return { ok: false, error: 'plan missing can_fix field', raw: cleaned };
    }
    if (!Array.isArray(parsed.operations)) {
      parsed.operations = [];
    }
    return { ok: true, plan: parsed, raw: cleaned };
  } catch (err: any) {
    return { ok: false, error: `failed to parse Claude response: ${err.message}`, raw: text.substring(0, 500) };
  }
}

// ─── Procesar un solo fix ───────────────────────────────────────

async function processSingleFix(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fix: any,
  result: ExecutorResult
): Promise<void> {
  const fixId = fix.id;
  const checkNumber = fix.check_number;

  console.log(`[chino/executor] Processing fix ${fixId} for check #${checkNumber}`);

  // ── Caso 1: difficulty=manual con archivos a tocar → escalar
  if (fix.difficulty === 'manual' && Array.isArray(fix.files_to_check) && fix.files_to_check.length > 0) {
    console.log(`[chino/executor] Fix #${checkNumber} requires CODE changes (${fix.files_to_check.length} files) — escalating`);

    const { error: updErr } = await supabase
      .from('steve_fix_queue')
      .update({
        status: 'escalated',
        escalated: true,
        agent_response: `Escalated by executor: requires code changes in ${fix.files_to_check.length} file(s). Executor only handles DATA fixes.`,
      })
      .eq('id', fixId);

    if (updErr) {
      console.error(`[chino/executor] Failed to mark escalated:`, updErr.message);
    }

    // Cargar el check para enriquecer el WhatsApp
    const check = await safeQuerySingleOrDefault<any>(
      supabase
        .from('chino_routine')
        .select('*')
        .eq('id', fix.check_id)
        .maybeSingle(),
      null,
      'chinoExecutor.loadCheckForEscalation',
    );

    try {
      await sendEscalationWhatsApp({ ...fix, chino_routine: check });
    } catch (err: any) {
      console.error(`[chino/executor] WhatsApp escalation failed:`, err.message);
    }

    result.escalated++;
    result.details.push({
      fix_id: fixId,
      check_number: checkNumber,
      outcome: 'escalated',
      note: 'requires code changes',
    });
    return;
  }

  // ── Caso 2: marcar como `fixing` (lock optimista)
  const { data: locked, error: lockErr } = await supabase
    .from('steve_fix_queue')
    .update({ status: 'fixing' })
    .eq('id', fixId)
    .eq('status', 'assigned') // solo si sigue assigned (evita race conditions)
    .select('id')
    .maybeSingle();

  if (lockErr || !locked) {
    console.warn(`[chino/executor] Fix ${fixId} could not be locked (race?). Skipping.`);
    result.skipped++;
    result.details.push({
      fix_id: fixId,
      check_number: checkNumber,
      outcome: 'skipped',
      note: 'lock failed (race or status changed)',
    });
    return;
  }

  // ── Caso 3: cargar la definición del check
  const { data: check, error: checkErr } = await supabase
    .from('chino_routine')
    .select('*')
    .eq('id', fix.check_id)
    .maybeSingle();

  if (checkErr || !check) {
    console.error(`[chino/executor] Check ${fix.check_id} not found for fix ${fixId}`);
    await supabase
      .from('steve_fix_queue')
      .update({
        status: 'failed',
        agent_response: `Executor could not load check definition: ${checkErr?.message || 'not found'}`,
      })
      .eq('id', fixId);
    result.failed++;
    result.details.push({
      fix_id: fixId,
      check_number: checkNumber,
      outcome: 'failed',
      note: 'check definition missing',
    });
    return;
  }

  // ── Caso 4: pedir a Claude el plan
  const planResult = await planFixWithClaude(fix, check);

  if (!planResult.ok || !planResult.plan) {
    console.error(`[chino/executor] Claude plan failed for fix ${fixId}:`, planResult.error);
    await supabase
      .from('steve_fix_queue')
      .update({
        status: 'failed',
        agent_response: `Executor: Claude planning failed — ${planResult.error || 'unknown'}`,
      })
      .eq('id', fixId);
    result.failed++;
    result.details.push({
      fix_id: fixId,
      check_number: checkNumber,
      outcome: 'failed',
      note: planResult.error || 'claude planning failed',
    });
    return;
  }

  const plan = planResult.plan;

  if (!plan.can_fix || plan.operations.length === 0) {
    console.log(`[chino/executor] Fix ${fixId}: Claude says can_fix=false. Reason: ${plan.reason}`);
    await supabase
      .from('steve_fix_queue')
      .update({
        status: 'failed',
        agent_response: `Executor: Claude declined — ${plan.reason || 'no reason given'}`,
      })
      .eq('id', fixId);
    result.failed++;
    result.details.push({
      fix_id: fixId,
      check_number: checkNumber,
      outcome: 'failed',
      note: `claude can_fix=false: ${plan.reason || ''}`,
    });
    return;
  }

  // ── Caso 5: validar TODAS las operaciones antes de aplicar ninguna
  for (let i = 0; i < plan.operations.length; i++) {
    const validation = validateOperation(plan.operations[i]);
    if (!validation.ok) {
      console.error(`[chino/executor] Fix ${fixId} op[${i}] invalid: ${validation.reason}`);
      await supabase
        .from('steve_fix_queue')
        .update({
          status: 'failed',
          agent_response: `Executor: rejected unsafe operation #${i} — ${validation.reason}. Plan: ${JSON.stringify(plan).substring(0, 1500)}`,
        })
        .eq('id', fixId);
      result.failed++;
      result.details.push({
        fix_id: fixId,
        check_number: checkNumber,
        outcome: 'failed',
        note: `unsafe op rejected: ${validation.reason}`,
      });
      return;
    }
  }

  // ── Caso 6: aplicar operaciones, parando al primer error
  //
  // ⚠️ IMPORTANTE — NO HAY ROLLBACK:
  // Si una operación intermedia falla, las operaciones anteriores YA ESTÁN
  // aplicadas en la DB y no se revierten. Esto es intencional para v1:
  // - Construir un sistema de transacciones distribuidas es over-engineering.
  // - El estado parcial queda registrado en agent_response (lista `applied`).
  // - El chino-fixer STEP A re-testeará el check; si el estado parcial es
  //   suficiente para que pase → fixed; si no → se reintenta automáticamente.
  // - El whitelist + validación previa hacen que el riesgo sea acotado.
  // Si esto cambia (ej. fixes multi-tabla críticos), considerar wrap en
  // una RPC de Postgres con BEGIN/COMMIT.
  const applied: Array<{ index: number; affected: number; reason: string }> = [];

  for (let i = 0; i < plan.operations.length; i++) {
    const op = plan.operations[i];
    console.log(`[chino/executor] Fix ${fixId} applying op[${i}] ${op.op} on ${op.table}`);
    const r = await applyOperation(supabase, op);
    if (!r.ok) {
      console.error(`[chino/executor] Fix ${fixId} op[${i}] failed: ${r.error}`);
      await supabase
        .from('steve_fix_queue')
        .update({
          status: 'failed',
          agent_response: `Executor: op[${i}] (${op.op} ${op.table}) failed — ${r.error}. Already applied: ${JSON.stringify(applied)}`,
        })
        .eq('id', fixId);
      result.failed++;
      result.details.push({
        fix_id: fixId,
        check_number: checkNumber,
        outcome: 'failed',
        note: `op[${i}] failed: ${r.error}`,
      });
      return;
    }
    applied.push({ index: i, affected: r.affected || 0, reason: op.reason });
  }

  // ── Caso 7: éxito → marcar deployed para que chino-fixer STEP A re-testee
  const summary = {
    plan_reason: plan.reason,
    operations_applied: applied,
    raw_plan: plan,
  };

  const { error: deployErr } = await supabase
    .from('steve_fix_queue')
    .update({
      status: 'deployed',
      deploy_timestamp: new Date().toISOString(),
      agent_response: `Executor (Sebastián W5): ${plan.reason}. Applied ${applied.length} op(s). Details: ${JSON.stringify(summary).substring(0, 4000)}`,
    })
    .eq('id', fixId);

  if (deployErr) {
    console.error(`[chino/executor] Failed to mark deployed:`, deployErr.message);
    result.failed++;
    result.details.push({
      fix_id: fixId,
      check_number: checkNumber,
      outcome: 'failed',
      note: `deploy update failed: ${deployErr.message}`,
    });
    return;
  }

  console.log(`[chino/executor] Fix ${fixId} for check #${checkNumber} DEPLOYED (${applied.length} ops)`);
  result.succeeded++;
  result.details.push({
    fix_id: fixId,
    check_number: checkNumber,
    outcome: 'deployed',
    note: `${applied.length} op(s) applied`,
  });
}

// ─── Handler principal ──────────────────────────────────────────

export async function chinoExecutor(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const result: ExecutorResult = {
    scanned: 0,
    succeeded: 0,
    failed: 0,
    escalated: 0,
    skipped: 0,
    details: [],
  };

  console.log('[chino/executor] Starting executor run');

  try {
    // Tomar fixes en assigned, ordenados por antigüedad. Cap por run.
    const { data: fixes, error: queueErr } = await supabase
      .from('steve_fix_queue')
      .select('*')
      .eq('status', 'assigned')
      .order('created_at', { ascending: true })
      .limit(MAX_FIXES_PER_RUN);

    if (queueErr) {
      console.error('[chino/executor] Failed to fetch queue:', queueErr.message);
      return c.json({ error: queueErr.message }, 500);
    }

    if (!fixes || fixes.length === 0) {
      console.log('[chino/executor] No assigned fixes — nothing to do');
      return c.json({ ...result, message: 'no assigned fixes' });
    }

    result.scanned = fixes.length;
    console.log(`[chino/executor] Scanned ${fixes.length} assigned fix(es)`);

    for (const fix of fixes) {
      try {
        await processSingleFix(supabase, fix, result);
      } catch (err: any) {
        // Defensa final: si algo crashea procesando un fix, no tumbamos el cron entero
        console.error(`[chino/executor] Unexpected crash on fix ${fix?.id}:`, err.message);
        try {
          await supabase
            .from('steve_fix_queue')
            .update({
              status: 'failed',
              agent_response: `Executor crashed: ${err.message}`,
            })
            .eq('id', fix.id);
        } catch (innerErr: any) {
          console.error(`[chino/executor] Could not mark crashed fix as failed:`, innerErr.message);
        }
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
      `[chino/executor] Done — scanned=${result.scanned} deployed=${result.succeeded} failed=${result.failed} escalated=${result.escalated} skipped=${result.skipped}`
    );

    return c.json(result);
  } catch (err: any) {
    console.error('[chino/executor] Top-level error:', err.message);
    return c.json({ error: err.message || 'internal error' }, 500);
  }
}
