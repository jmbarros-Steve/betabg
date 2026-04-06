import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import dns from 'node:dns';

const resolveTxt = (hostname: string): Promise<string[][]> =>
  new Promise((ok, fail) => dns.resolveTxt(hostname, (err, records) => err ? fail(err) : ok(records)));
const resolveMx = (hostname: string): Promise<Array<{ exchange: string; priority: number }>> =>
  new Promise((ok, fail) => dns.resolveMx(hostname, (err, records) => err ? fail(err) : ok(records)));

/**
 * GET /api/email/domain-health?domain=example.com
 * Checks SPF, DKIM, DMARC, and MX records for a domain.
 */
export async function domainHealth(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const isInternal = c.get('isInternal') === true;

    if (!isInternal) {
      const authHeader = c.req.header('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    }

    const domain = c.req.query('domain');
    if (!domain) {
      return c.json({ error: 'domain query parameter is required' }, 400);
    }

    // Validate domain format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
      return c.json({ error: 'Invalid domain format' }, 400);
    }

    const checks: Record<string, { status: 'pass' | 'fail' | 'warn'; record?: string; detail?: string }> = {};

    // SPF check
    try {
      const txtRecords = await resolveTxt(domain);
      const flat = txtRecords.map((r: any) => (Array.isArray(r) ? r.join('') : r));
      const spfRecord = flat.find((r: string) => r.startsWith('v=spf1'));
      if (spfRecord) {
        const hasHardFail = spfRecord.includes('-all');
        const hasSoftFail = spfRecord.includes('~all');
        checks.spf = {
          status: hasHardFail ? 'pass' : hasSoftFail ? 'warn' : 'warn',
          record: spfRecord,
          detail: hasHardFail ? 'SPF with -all (strict)' : hasSoftFail ? 'SPF with ~all (soft fail, consider -all)' : 'SPF found but missing -all or ~all',
        };
      } else {
        checks.spf = { status: 'fail', detail: 'No SPF record found' };
      }
    } catch {
      checks.spf = { status: 'fail', detail: 'DNS lookup failed for SPF' };
    }

    // DKIM check (common selectors)
    const dkimSelectors = ['google', 'default', 'selector1', 'selector2', 'k1', 'kl', 'kl2', 'resend'];
    let dkimFound = false;
    for (const sel of dkimSelectors) {
      try {
        const dkimRecords = await resolveTxt(`${sel}._domainkey.${domain}`);
        if (dkimRecords.length > 0) {
          const flat = dkimRecords.map((r: any) => (Array.isArray(r) ? r.join('') : r));
          checks.dkim = {
            status: 'pass',
            record: `${sel}._domainkey.${domain}`,
            detail: `DKIM found with selector "${sel}": ${flat[0]?.substring(0, 80)}...`,
          };
          dkimFound = true;
          break;
        }
      } catch {
        // Try next selector
      }
    }
    if (!dkimFound) {
      checks.dkim = {
        status: 'warn',
        detail: `No DKIM found for common selectors (${dkimSelectors.join(', ')}). DKIM may use a custom selector.`,
      };
    }

    // DMARC check
    try {
      const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
      const flat = dmarcRecords.map((r: any) => (Array.isArray(r) ? r.join('') : r));
      const dmarcRecord = flat.find((r: string) => r.startsWith('v=DMARC1'));
      if (dmarcRecord) {
        const policy = dmarcRecord.match(/p=(\w+)/)?.[1] || 'none';
        checks.dmarc = {
          status: policy === 'reject' ? 'pass' : policy === 'quarantine' ? 'warn' : 'warn',
          record: dmarcRecord,
          detail: `DMARC policy: ${policy}${policy === 'none' ? ' (consider upgrading to quarantine or reject)' : ''}`,
        };
      } else {
        checks.dmarc = { status: 'fail', detail: 'No DMARC record found' };
      }
    } catch {
      checks.dmarc = { status: 'fail', detail: 'No DMARC record found' };
    }

    // MX check
    try {
      const mxRecords = await resolveMx(domain);
      if (Array.isArray(mxRecords) && mxRecords.length > 0) {
        checks.mx = {
          status: 'pass',
          record: mxRecords.map((r: any) => `${r.priority} ${r.exchange}`).join(', '),
          detail: `${mxRecords.length} MX record(s) found`,
        };
      } else {
        checks.mx = { status: 'fail', detail: 'No MX records found' };
      }
    } catch {
      checks.mx = { status: 'fail', detail: 'DNS lookup failed for MX' };
    }

    // Overall score
    const results = Object.values(checks);
    const passing = results.filter(r => r.status === 'pass').length;
    const total = results.length;
    const overallScore = Math.round((passing / total) * 100);

    return c.json({
      domain,
      score: overallScore,
      checks,
      summary: overallScore >= 75 ? 'Healthy' : overallScore >= 50 ? 'Needs improvement' : 'Critical issues',
    });
  } catch (error: any) {
    console.error('[email/domain-health] Error:', error);
    return c.json({ error: error.message }, 500);
  }
}
