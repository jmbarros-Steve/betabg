// El Chino — Hono endpoints
// All authenticated with X-Cron-Secret

import { Context } from 'hono';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { runChinoPatrol } from './runner.js';
import { runChinoFixer } from './fixer.js';
import { sendPeriodicReport } from './whatsapp.js';
import { handleChinoInstruction } from './instruction-handler.js';

function verifyCronSecret(c: Context): boolean {
  const secret = c.req.header('X-Cron-Secret');
  return secret === process.env.CRON_SECRET;
}

// ═══════════════════════════════════════════════════════════════════
// Existing patrol endpoints
// ═══════════════════════════════════════════════════════════════════

// POST /api/chino/run — Execute full patrol
export async function chinoRun(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await runChinoPatrol();
    return c.json({
      run_id: result.run_id,
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      errors: result.errors,
      skipped: result.skipped,
      duration_ms: result.duration_ms,
    });
  } catch (err: any) {
    console.error('[chino/run]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// GET /api/chino/report?run_id=X — Get results for a specific run
export async function chinoReport(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const runId = c.req.query('run_id');
  if (!runId) {
    return c.json({ error: 'run_id query parameter is required' }, 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('chino_reports')
      .select('*')
      .eq('run_id', runId)
      .order('check_number', { ascending: true });

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ run_id: runId, count: data?.length || 0, reports: data || [] });
  } catch (err: any) {
    console.error('[chino/report]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// GET /api/chino/latest — Get the most recent run
export async function chinoLatest(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: latest, error: latestErr } = await supabase
      .from('chino_reports')
      .select('run_id, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      return c.json({ error: latestErr.message }, 500);
    }

    if (!latest) {
      return c.json({ message: 'No runs found', reports: [] });
    }

    const { data: reports, error: reportsErr } = await supabase
      .from('chino_reports')
      .select('*')
      .eq('run_id', latest.run_id)
      .order('check_number', { ascending: true });

    if (reportsErr) {
      return c.json({ error: reportsErr.message }, 500);
    }

    const results = reports || [];
    const passed = results.filter((r) => r.result === 'pass').length;
    const failed = results.filter((r) => r.result === 'fail').length;
    const errored = results.filter((r) => r.result === 'error').length;
    const skippedCount = results.filter((r) => r.result === 'skip').length;

    return c.json({
      run_id: latest.run_id,
      created_at: latest.created_at,
      total: results.length,
      passed,
      failed,
      errors: errored,
      skipped: skippedCount,
      reports: results,
    });
  } catch (err: any) {
    console.error('[chino/latest]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// GET /api/chino/failures?hours=24 — Get recent failures
export async function chinoFailures(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const hours = parseInt(c.req.query('hours') || '24', 10);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('chino_reports')
      .select('*')
      .in('result', ['fail', 'error'])
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      hours,
      since,
      count: data?.length || 0,
      failures: data || [],
    });
  } catch (err: any) {
    console.error('[chino/failures]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Fix queue endpoints
// ═══════════════════════════════════════════════════════════════════

// GET /api/chino/fixes/next — Get next assigned fix for an agent
export async function chinoFixNext(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('steve_fix_queue')
      .select('*')
      .eq('status', 'assigned')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data) {
      return c.json({ message: 'No hay fixes pendientes' }, 404);
    }

    // Mark as fixing
    await supabase
      .from('steve_fix_queue')
      .update({ status: 'fixing' })
      .eq('id', data.id);

    return c.json(data);
  } catch (err: any) {
    console.error('[chino/fixes/next]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// POST /api/chino/fixes/:id/done — Agent reports fix is deployed
export async function chinoFixDone(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const fixId = c.req.param('id');
  if (!fixId) {
    return c.json({ error: 'Fix ID required' }, 400);
  }

  try {
    const body = await c.req.json().catch(() => ({})) as Record<string, any>;
    const supabase = getSupabaseAdmin();

    await supabase
      .from('steve_fix_queue')
      .update({
        status: 'deployed',
        agent_response: body.response || 'Fix aplicado',
        deploy_timestamp: new Date().toISOString(),
      })
      .eq('id', fixId);

    return c.json({ message: 'Fix marcado como deployed. El Chino re-testeará en 5 minutos.' });
  } catch (err: any) {
    console.error('[chino/fixes/done]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// POST /api/chino/fixes/:id/failed — Agent reports it couldn't fix
export async function chinoFixFailed(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const fixId = c.req.param('id');
  if (!fixId) {
    return c.json({ error: 'Fix ID required' }, 400);
  }

  try {
    const body = await c.req.json().catch(() => ({})) as Record<string, any>;
    const supabase = getSupabaseAdmin();

    await supabase
      .from('steve_fix_queue')
      .update({
        status: 'deployed', // send to re-test anyway, fixer will decide
        agent_response: body.reason || 'No pudo arreglar',
        deploy_timestamp: new Date().toISOString(),
      })
      .eq('id', fixId);

    return c.json({ message: 'Registrado. El Chino re-testeará y decidirá.' });
  } catch (err: any) {
    console.error('[chino/fixes/failed]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Fixer + Report + Instruction endpoints
// ═══════════════════════════════════════════════════════════════════

// POST /api/chino/fixer — Run the fixer loop (re-test deployed fixes)
export async function chinoFixer(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await runChinoFixer();
    return c.json(result);
  } catch (err: any) {
    console.error('[chino/fixer]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// POST /api/chino/report/send — Send periodic WhatsApp report
export async function chinoReportSend(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    await sendPeriodicReport();
    return c.json({ message: 'Reporte enviado' });
  } catch (err: any) {
    console.error('[chino/report/send]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// POST /api/chino/instruction — JM sends a new check instruction
export async function chinoInstruction(c: Context) {
  if (!verifyCronSecret(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json() as { message?: string };
    if (!body.message) {
      return c.json({ error: 'message field required' }, 400);
    }

    const response = await handleChinoInstruction(body.message);
    return c.json({ response });
  } catch (err: any) {
    console.error('[chino/instruction]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
