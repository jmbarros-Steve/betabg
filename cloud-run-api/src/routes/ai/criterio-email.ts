import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface EmailData {
  id?: string;
  subject?: string;
  preview_text?: string;
  html?: string;
  from_email?: string;
  angle?: string;
  theme?: string;
  send_hour?: number;
  timezone?: string;
  segment_size?: number;
  segment_excludes_unsubscribed?: boolean;
  product_ids?: string[];
}

interface RuleResult {
  passed: boolean;
  actual: string;
  expected: string;
  details: string | null;
}

function evaluateEmailRule(
  rule: any,
  email: EmailData,
  brief: any,
  recentEmails: any[] | null,
  history: any[] | null,
): RuleResult {
  const cat = rule.category;
  const name = rule.name;

  // === EMAIL SUBJECT ===
  if (cat === 'EMAIL SUBJECT') {
    if (name.includes('max 50')) {
      const len = (email.subject || '').length;
      return { passed: len <= 50, actual: `${len} chars`, expected: 'Max 50', details: null };
    }

    if (name.includes('min 15')) {
      const len = (email.subject || '').length;
      return { passed: len >= 15, actual: `${len} chars`, expected: 'Min 15', details: null };
    }

    if (name.includes('Preview text')) {
      const len = (email.preview_text || '').length;
      return { passed: len >= 40 && len <= 130, actual: len === 0 ? 'VACÍO' : `${len} chars`, expected: '40-130 chars', details: null };
    }

    if (name.includes('spam')) {
      const forbidden = ['gratis', 'free', 'ganador', 'urgente', '$$$', '100%', 'winner'];
      const subject = (email.subject || '').toLowerCase();
      const found = forbidden.filter(f => subject.includes(f));
      return { passed: found.length === 0, actual: found.length > 0 ? `Spam: ${found.join(', ')}` : 'Clean', expected: 'No spam words', details: null };
    }

    if (name.includes('ALL CAPS') || name.includes('mayúsculas')) {
      const subject = email.subject || '';
      const upper = (subject.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
      const total = (subject.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ]/g) || []).length;
      const pct = total > 0 ? Math.round(upper / total * 100) : 0;
      return { passed: pct < 40, actual: `${pct}%`, expected: '<40%', details: null };
    }

    if (name.includes('emojis')) {
      const emojis = (email.subject || '').match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
      return { passed: emojis.length <= 2, actual: `${emojis.length}`, expected: 'Max 2', details: null };
    }

    if (name.includes('Distinto últimos')) {
      const lastSubjects = (recentEmails || []).map(e => e.subject);
      const current = email.subject || '';
      const similar = lastSubjects.some(s => {
        const words1 = current.toLowerCase().split(' ').slice(0, 5).join(' ');
        const words2 = (s || '').toLowerCase().split(' ').slice(0, 5).join(' ');
        return words1 === words2;
      });
      return { passed: !similar, actual: similar ? 'Similar a reciente' : 'Único', expected: 'Distinto a últimos 5', details: null };
    }
  }

  // === EMAIL BODY ===
  if (cat === 'EMAIL BODY') {
    if (name.includes('CTA principal')) {
      const hasCTA = (email.html || '').match(/<a[^>]+href[^>]+>(.*?)<\/a>/i) ||
                     (email.html || '').match(/<button[^>]*>/i);
      return { passed: !!hasCTA, actual: hasCTA ? 'CTA found' : 'No CTA', expected: 'Button with href', details: null };
    }

    if (name.includes('desuscripción') || name.includes('unsubscribe')) {
      const hasUnsub = (email.html || '').includes('unsubscribe') ||
                       (email.html || '').includes('desuscri') ||
                       (email.html || '').includes('{{ unsubscribe_url }}');
      return { passed: hasUnsub, actual: hasUnsub ? 'Has unsubscribe' : 'NO UNSUBSCRIBE', expected: 'Unsubscribe link', details: hasUnsub ? null : 'OBLIGATORIO POR LEY' };
    }

    if (name.includes('Largo') && name.includes('palabras')) {
      const text = (email.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const words = text.split(' ').length;
      return { passed: words >= 50 && words <= 500, actual: `${words} palabras`, expected: '50-500', details: null };
    }

    if (name.includes('alt text')) {
      const imgs = (email.html || '').match(/<img[^>]*>/gi) || [];
      const noAlt = imgs.filter(img => !img.match(/alt=["'][^"']+["']/i));
      return { passed: noAlt.length === 0, actual: noAlt.length > 0 ? `${noAlt.length} sin alt` : 'All have alt', expected: 'All imgs with alt', details: null };
    }

    if (name.includes('JavaScript')) {
      const hasScript = (email.html || '').includes('<script');
      return { passed: !hasScript, actual: hasScript ? 'HAS SCRIPT' : 'Clean', expected: 'No <script>', details: null };
    }

    if (name.includes('Ancho max 600')) {
      const widthMatch = (email.html || '').match(/width[=:]["'\s]*(\d+)/i);
      const width = widthMatch ? parseInt(widthMatch[1]) : 600;
      return { passed: width <= 600, actual: `${width}px`, expected: 'Max 600px', details: null };
    }

    if (name.includes('HTTPS')) {
      const httpLinks = (email.html || '').match(/href=["']http:\/\//gi) || [];
      return { passed: httpLinks.length === 0, actual: httpLinks.length > 0 ? `${httpLinks.length} HTTP links` : 'All HTTPS', expected: 'All HTTPS', details: null };
    }

    if (name.includes('UTM')) {
      const links = (email.html || '').match(/href=["'][^"']+["']/gi) || [];
      const externalLinks = links.filter(l => !l.includes('unsubscribe') && !l.includes('mailto'));
      const withUTM = externalLinks.filter(l => l.includes('utm_'));
      return { passed: externalLinks.length === 0 || withUTM.length > 0, actual: `${withUTM.length}/${externalLinks.length} with UTM`, expected: 'UTMs present', details: null };
    }
  }

  // === EMAIL TIMING ===
  if (cat === 'EMAIL TIMING') {
    if (name.includes('Hora 8-21') || name.includes('8-21')) {
      const hour = email.send_hour || new Date().getHours();
      return { passed: hour >= 8 && hour <= 21, actual: `${hour}:00`, expected: '8-21hrs', details: null };
    }

    if (name.includes('Min 3 días')) {
      if (!recentEmails?.length) return { passed: true, actual: 'No recent', expected: 'N/A', details: null };
      const lastSent = new Date(recentEmails[0].sent_at || recentEmails[0].created_at);
      const daysSince = Math.floor((Date.now() - lastSent.getTime()) / 86400000);
      return { passed: daysSince >= 3, actual: `${daysSince} días`, expected: 'Min 3 días', details: daysSince < 3 ? `Último envío hace ${daysSince} día(s)` : null };
    }

    if (name.includes('Timezone')) {
      const tz = email.timezone || 'America/Santiago';
      return { passed: tz === 'America/Santiago', actual: tz, expected: 'America/Santiago', details: null };
    }
  }

  // === SEGMENT ===
  if (cat?.includes('SEG')) {
    if (name.includes('unsubscribed') || name.includes('desuscritos')) {
      const excludesUnsub = email.segment_excludes_unsubscribed !== false;
      return { passed: excludesUnsub, actual: excludesUnsub ? 'Excluded' : 'NOT EXCLUDED', expected: 'Exclude unsubscribed', details: excludesUnsub ? null : 'ILEGAL ENVIAR A DESUSCRITOS' };
    }

    if (name.includes('Min 100')) {
      const size = email.segment_size || 0;
      return { passed: size >= 100, actual: `${size}`, expected: 'Min 100', details: null };
    }
  }

  // Default: pass (rule not yet implemented)
  return { passed: true, actual: 'Not yet implemented', expected: rule.check_rule, details: `TODO: ${rule.name}` };
}

interface CriterioResult {
  can_publish: boolean;
  score: number;
  reason: string;
  failed_rules: Array<{ rule_id: string; severity: string; details: string }>;
  [key: string]: any;
}

async function criterioEmailEvaluate(emailData: EmailData, shopId: string): Promise<CriterioResult> {
  const supabase = getSupabaseAdmin();

  // 1. Fetch active EMAIL rules
  const { data: rules } = await supabase
    .from('criterio_rules')
    .select('*')
    .eq('organ', 'CRITERIO')
    .like('category', 'EMAIL%')
    .eq('active', true);

  // 2. Fetch context data
  const { data: brief } = await supabase
    .from('brand_research')
    .select('*')
    .eq('shop_id', shopId)
    .single();

  const { data: recentEmails } = await supabase
    .from('email_campaigns')
    .select('subject, sent_at')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: history } = await supabase
    .from('creative_history')
    .select('angle, theme')
    .eq('shop_id', shopId)
    .eq('channel', 'email')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!rules || rules.length === 0) {
    return { can_publish: true, score: 100, reason: 'No active EMAIL rules found', failed_rules: [] };
  }

  // 3. Evaluate each rule
  const results = [];
  for (const rule of rules) {
    const result = evaluateEmailRule(rule, emailData, brief, recentEmails, history);
    results.push({
      rule_id: rule.id,
      passed: result.passed,
      actual_value: result.actual,
      expected_value: result.expected,
      details: result.details,
      severity: rule.severity,
    });
  }

  // 4. Call evaluate-rules edge function
  const evalResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/evaluate-rules`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organ: 'CRITERIO',
        shop_id: shopId,
        entity_type: 'email_campaign',
        entity_id: emailData.id || 'pre-create',
        results,
      }),
    },
  ).then(r => r.json()) as CriterioResult;

  // 5. Save to creative_history if approved
  if (evalResponse.can_publish) {
    await supabase.from('creative_history').insert({
      shop_id: shopId,
      channel: 'email',
      type: 'campaign',
      angle: emailData.angle || 'unknown',
      theme: emailData.theme || null,
      content_summary: emailData.subject,
      cqs_score: evalResponse.score,
    });
  }

  // 6. Create task if rejected
  if (!evalResponse.can_publish) {
    const failedSummary = (evalResponse.failed_rules || [])
      .slice(0, 10)
      .map((r: any) => `• [${r.severity}] ${r.rule_id}: ${r.details || r.actual_value || 'Failed'}`)
      .join('\n');

    await supabase.from('tasks').insert({
      shop_id: shopId,
      title: `CRITERIO rechazó email: score ${evalResponse.score ?? 0}%`,
      description: [
        `Subject: "${emailData.subject || '(sin subject)'}"`,
        `Score: ${evalResponse.score ?? 0}% | Blockers: ${evalResponse.blockers ?? 0} | Failed: ${evalResponse.failed ?? 0}`,
        '',
        'Reglas fallidas:',
        failedSummary || '(sin detalle)',
      ].join('\n'),
      priority: (evalResponse.blockers ?? 0) > 0 ? 'critical' : 'high',
      type: 'fix',
      source: 'criterio',
      assigned_squad: 'email',
      spec: {
        entity_type: 'email_campaign',
        entity_id: emailData.id || null,
        score: evalResponse.score,
        blockers: evalResponse.blockers,
        failed_rules: evalResponse.failed_rules,
      },
    }).then(({ error }) => {
      if (error) console.error('[criterio-email] Failed to create task:', error.message);
    });
  }

  return evalResponse;
}

export async function criterioEmail(c: Context) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { email_data, shop_id } = await c.req.json();

    if (!email_data || !shop_id) {
      return c.json({ error: 'email_data and shop_id are required' }, 400);
    }

    const result = await criterioEmailEvaluate(email_data, shop_id);
    return c.json(result);
  } catch (error: unknown) {
    console.error('Error in criterio-email:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
}

// Export for use by other routes (klaviyo-push-emails, upload-klaviyo-drafts)
export { criterioEmailEvaluate };
