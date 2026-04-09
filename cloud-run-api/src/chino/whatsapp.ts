// El Chino — WhatsApp notifications + command handlers
// Uses existing Twilio integration from lib/twilio-client.ts

import { getSupabaseAdmin } from '../lib/supabase.js';
import { safeQueryOrDefault } from '../lib/safe-supabase.js';
import { sendWhatsApp, sendWhatsAppMedia } from '../lib/twilio-client.js';
import { isChinoInstruction, handleChinoInstruction } from './instruction-handler.js';

// JM's phone — env var or hardcoded fallback
function getJMPhone(): string {
  const phone = process.env.JOSE_WHATSAPP_NUMBER || process.env.JM_PHONE;
  if (!phone) {
    console.error('[chino/wa] JOSE_WHATSAPP_NUMBER not configured — WhatsApp alerts DISABLED');
  }
  return phone || '';
}

// ─── Send text to JM ────────────────────────────────────────────

async function sendToJM(message: string): Promise<void> {
  const phone = getJMPhone();
  if (!phone) {
    console.error('[chino/wa] JOSE_WHATSAPP_NUMBER not configured, skipping WhatsApp');
    return;
  }
  try {
    await sendWhatsApp(phone, message);
    console.log('[chino/wa] Message sent to JM');
  } catch (err: any) {
    console.error('[chino/wa] Failed to send WhatsApp:', err.message);
  }
}

// ─── Send image to JM ───────────────────────────────────────────

async function sendImageToJM(imageUrl: string, caption: string): Promise<void> {
  const phone = getJMPhone();
  if (!phone) return;
  try {
    await sendWhatsAppMedia(phone, caption, imageUrl);
  } catch (err: any) {
    console.error('[chino/wa] Failed to send image:', err.message);
  }
}

// ─── Periodic report (every 6 hours) ────────────────────────────

export async function sendPeriodicReport(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString();

  // Get report stats
  const reports = await safeQueryOrDefault<{ result: string }>(
    supabase
      .from('chino_reports')
      .select('result')
      .gte('created_at', sixHoursAgo),
    [],
    'chinoWhatsapp.fetchPeriodicReports',
  );

  const total = reports.length;
  const passed = reports.filter((r) => r.result === 'pass').length;
  const failed = reports.filter((r) => r.result === 'fail').length;
  const errCount = reports.filter((r) => r.result === 'error').length;

  // Get recent fixes
  const fixes = await safeQueryOrDefault<{ check_number: number; status: string; probable_cause: string | null }>(
    supabase
      .from('steve_fix_queue')
      .select('check_number, status, probable_cause')
      .gte('created_at', sixHoursAgo),
    [],
    'chinoWhatsapp.fetchPeriodicFixes',
  );

  const autoFixed = fixes.filter((f) => f.status === 'fixed');
  const escalated = fixes.filter((f) => f.status === 'escalated');
  const pending = fixes.filter((f) => ['pending', 'assigned', 'fixing'].includes(f.status));

  const time = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

  let message: string;

  if (failed === 0 && errCount === 0) {
    message = `✅ *EL CHINO — Reporte ${time}*
${total} checks ejecutados
Todos pasaron ✅

Próxima revisión en 6 horas.`;
  } else {
    message = `⚠️ *EL CHINO — Reporte ${time}*
${total} checks ejecutados
${passed} pasaron ✅ | ${failed} fallaron ❌ | ${errCount} errores ⚠️`;

    if (autoFixed.length > 0) {
      message += '\n\n*Arreglados automáticamente:*';
      for (const fix of autoFixed.slice(0, 5)) {
        message += `\n• Check #${fix.check_number}: ${(fix.probable_cause || '').substring(0, 80)}`;
      }
      if (autoFixed.length > 5) message += `\n• ...y ${autoFixed.length - 5} más`;
    }

    if (escalated.length > 0) {
      message += '\n\n*Necesitan tu atención:*';
      for (const fix of escalated.slice(0, 5)) {
        message += `\n• Check #${fix.check_number}: ${(fix.probable_cause || '').substring(0, 80)}`;
      }
    }

    if (pending.length > 0) {
      message += `\n\n*En proceso:* ${pending.length} fix(es) en cola`;
    }
  }

  // Fixes pending approval
  const pendingApproval = await safeQueryOrDefault<{ check_number: number; probable_cause: string | null }>(
    supabase
      .from('steve_fix_queue')
      .select('check_number, probable_cause')
      .eq('approval_status', 'pending_approval')
      .order('created_at', { ascending: false })
      .limit(5),
    [],
    'chinoWhatsapp.fetchPendingApproval',
  );

  if (pendingApproval.length > 0) {
    message += '\n\n*Esperan tu aprobación (' + pendingApproval.length + '):*';
    for (const fix of pendingApproval) {
      message += `\n• #${fix.check_number}: ${(fix.probable_cause || '').substring(0, 80)}`;
    }
    message += '\n\n👉 betabgnuevosupa.vercel.app/admin/cerebro';
  }

  await sendToJM(message);
}

// ─── Escalation alert (after 2 failed fix attempts) ─────────────

export async function sendEscalationWhatsApp(fix: any): Promise<void> {
  const checkDesc = fix.chino_routine?.description || fix.probable_cause || 'Check desconocido';
  const steveVal = fix.check_result?.steve_value || 'N/A';
  const realVal = fix.check_result?.real_value || 'N/A';
  const errMsg = fix.check_result?.error_message || 'N/A';

  const message = `🔴 *EL CHINO — ESCALACIÓN*

Check #${fix.check_number} falló 2 veces.

*Qué pasó:*
${checkDesc}

*Steve dice:* ${steveVal}
*Real:* ${realVal}
*Error:* ${errMsg}

*Intento 1:* Se intentó fix automático
*Intento 2:* Approach diferente

Ambos fallaron. Necesito que lo mires tú, jefe.`;

  await sendToJM(message);

  // Send screenshot if available
  if (fix.check_result?.screenshot_url) {
    await sendImageToJM(fix.check_result.screenshot_url, 'Screenshot del error');
  }
}

// ─── Critical alert (immediate, during patrol) ──────────────────

export async function sendCriticalAlert(criticalFails: Array<{
  check_number: number;
  description: string;
  error_message?: string;
}>): Promise<void> {
  const message = `🔴 *EL CHINO — ALERTA INMEDIATA*

${criticalFails.length} check(s) CRÍTICOS fallaron:

${criticalFails.map((f) => `• #${f.check_number}: ${f.error_message || f.description}`).join('\n')}

Generando fixes automáticos...`;

  await sendToJM(message);
}

// ─── WhatsApp Command Handlers ──────────────────────────────────
// JM sends a message → handleChinoWhatsApp tries to match a command.
// Returns string response if matched, null if not a chino command.

const CMD_RESUMEN = /qu[eé]\s*(revisas|checks|checkeas)/i;
const CMD_DESACTIVAR = /desactiva\s*(?:check\s*)?#?(\d+)/i;
const CMD_ACTIVAR = /activa\s*(?:check\s*)?#?(\d+)/i;
const CMD_ESTADO = /\b(estado|status|c[oó]mo\s*va)\b/i;
const CMD_REPORTE = /\b([uú]ltimo\s*reporte|reporte)\b/i;
const CMD_FALLOS = /\b(qu[eé]\s*fall[oó]|errores\s*hoy|fallos)\b/i;

async function cmdResumen(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const data = await safeQueryOrDefault<{ platform: string; is_active: boolean }>(
    supabase
      .from('chino_routine')
      .select('platform, is_active'),
    [],
    'chinoWhatsapp.cmdResumen',
  );

  if (data.length === 0) return 'No hay checks configurados todavía.';

  const active = data.filter((r) => r.is_active);
  const byPlatform: Record<string, number> = {};
  for (const row of active) {
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
  }

  const lines = Object.entries(byPlatform)
    .sort((a, b) => b[1] - a[1])
    .map(([p, c]) => `• ${p}: ${c}`);

  return `📋 *EL CHINO — Resumen*
${data.length} checks totales (${active.length} activos)

*Por plataforma:*
${lines.join('\n')}`;
}

async function cmdDesactivar(checkNum: number): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('chino_routine')
    .update({ is_active: false })
    .eq('check_number', checkNum)
    .select('description')
    .maybeSingle();

  if (error) return `Error al desactivar: ${error.message}`;
  if (!data) return `Check #${checkNum} no existe.`;
  return `✅ Check #${checkNum} desactivado: ${data.description}`;
}

async function cmdActivar(checkNum: number): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('chino_routine')
    .update({ is_active: true })
    .eq('check_number', checkNum)
    .select('description')
    .maybeSingle();

  if (error) return `Error al activar: ${error.message}`;
  if (!data) return `Check #${checkNum} no existe.`;
  return `✅ Check #${checkNum} activado: ${data.description}`;
}

async function cmdEstado(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

  const [reports, routine] = await Promise.all([
    safeQueryOrDefault<{ result: string }>(
      supabase.from('chino_reports').select('result').gte('created_at', oneHourAgo),
      [],
      'chinoWhatsapp.cmdEstado.reports',
    ),
    safeQueryOrDefault<{ is_active: boolean }>(
      supabase.from('chino_routine').select('is_active').eq('is_active', true),
      [],
      'chinoWhatsapp.cmdEstado.routine',
    ),
  ]);

  const total = reports.length;
  const passed = reports.filter((r) => r.result === 'pass').length;
  const failed = reports.filter((r) => r.result === 'fail').length;
  const errors = reports.filter((r) => r.result === 'error').length;
  const activeChecks = routine.length;

  if (total === 0) {
    return `🔵 *EL CHINO — Estado*
${activeChecks} checks activos
No hay corridas en la última hora.`;
  }

  const emoji = failed === 0 && errors === 0 ? '✅' : '⚠️';
  return `${emoji} *EL CHINO — Estado*
${activeChecks} checks activos
Última hora: ${total} ejecutados
${passed} ✅ | ${failed} ❌ | ${errors} ⚠️`;
}

async function cmdFallos(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

  const failures = await safeQueryOrDefault<{ check_number: number; error_message: string | null; result: string; created_at: string }>(
    supabase
      .from('chino_reports')
      .select('check_number, error_message, result, created_at')
      .in('result', ['fail', 'error'])
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(15),
    [],
    'chinoWhatsapp.cmdFallos',
  );

  if (failures.length === 0) {
    return '✅ *EL CHINO* — Sin fallos en las últimas 24 horas. Todo limpio jefe.';
  }

  const lines = failures.map((f) => {
    const err = (f.error_message || f.result).substring(0, 60);
    return `• #${f.check_number}: ${err}`;
  });

  return `❌ *EL CHINO — Fallos (24h)*
${failures.length} fallo(s):

${lines.join('\n')}`;
}

export async function handleChinoWhatsApp(message: string): Promise<string | null> {
  try {
    // 1. Match explicit commands
    let match: RegExpMatchArray | null;

    match = message.match(CMD_RESUMEN);
    if (match) return cmdResumen();

    match = message.match(CMD_DESACTIVAR);
    if (match) return cmdDesactivar(parseInt(match[1], 10));

    match = message.match(CMD_ACTIVAR);
    if (match) return cmdActivar(parseInt(match[1], 10));

    match = message.match(CMD_ESTADO);
    if (match) return cmdEstado();

    match = message.match(CMD_REPORTE);
    if (match) {
      await sendPeriodicReport();
      return 'Listo jefe, reporte enviado arriba. ☝️';
    }

    match = message.match(CMD_FALLOS);
    if (match) return cmdFallos();

    // 2. Check if it's a Chino instruction (natural language → new check)
    if (isChinoInstruction(message)) {
      return handleChinoInstruction(message);
    }

    // 3. Not a Chino command — return null so JM falls through to normal merchant flow
    return null;
  } catch (err: any) {
    console.error('[chino/wa] Command handler error:', err.message);
    return `Error procesando comando: ${err.message}`;
  }
}
