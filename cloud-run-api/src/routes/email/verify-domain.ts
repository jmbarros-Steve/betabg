import { Context } from 'hono';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '../../lib/supabase.js';

let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY!);
  }
  return resendClient;
}

/**
 * Domain verification for email sending (SPF/DKIM/DMARC).
 * POST /api/verify-email-domain
 */
export async function verifyEmailDomain(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'initiate': {
      // Start domain verification in Resend
      const { domain } = body;
      if (!domain) return c.json({ error: 'domain is required' }, 400);

      const cleanDomain = domain.toLowerCase().trim();
      const resend = getResendClient();

      const { data: domainData, error: createErr } = await resend.domains.create({
        name: cleanDomain,
      });

      if (createErr) {
        return c.json({ error: createErr.message }, 500);
      }

      // Map Resend records to our format
      const dnsRecords = (domainData?.records || []).map((r: any) => ({
        type: r.type || r.record,
        name: r.name,
        value: r.value,
        purpose: r.record || r.type,
        status: r.status || 'pending',
      }));

      // Add DMARC recommendation
      dnsRecords.push({
        type: 'TXT',
        name: `_dmarc.${cleanDomain}`,
        value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + cleanDomain,
        purpose: 'DMARC policy',
        status: 'info',
      });

      // Save to database
      const { data, error } = await supabase
        .from('email_domains')
        .upsert({
          client_id,
          domain: cleanDomain,
          status: 'pending',
          resend_domain_id: domainData?.id || null,
          dns_records: dnsRecords,
        }, { onConflict: 'client_id,domain' })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);

      return c.json({
        success: true,
        domain: data,
        dns_records: dnsRecords,
        instructions: 'Add these DNS records to your domain. Verification typically takes a few minutes.',
      });
    }

    case 'check': {
      // Check verification status via Resend
      const { domain } = body;
      if (!domain) return c.json({ error: 'domain is required' }, 400);

      const cleanDomain = domain.toLowerCase().trim();
      const resend = getResendClient();

      // Get resend_domain_id + existing dns_records (to preserve DMARC)
      const { data: domainRecord } = await supabase
        .from('email_domains')
        .select('resend_domain_id, dns_records')
        .eq('client_id', client_id)
        .eq('domain', cleanDomain)
        .single();

      if (!domainRecord?.resend_domain_id) {
        return c.json({ error: 'Domain not found. Please initiate verification first.' }, 404);
      }

      // Trigger verification check
      await resend.domains.verify(domainRecord.resend_domain_id);

      // Get updated status
      const { data: domainInfo } = await resend.domains.get(domainRecord.resend_domain_id);
      const isVerified = domainInfo?.status === 'verified';

      // Parse individual record verification status from Resend
      const records = domainInfo?.records || [];
      // Use r.record label (DKIM/SPF) to avoid type collisions (both are TXT)
      const spfVerified = records.some((r: any) =>
        (r.record === 'SPF' || (r.value?.startsWith('v=spf1') && !r.name?.includes('_domainkey')))
        && r.status === 'verified'
      );
      const dkimVerified = records.some((r: any) =>
        (r.record === 'DKIM' || r.name?.includes('_domainkey'))
        && r.status === 'verified'
      );
      // DMARC is user-managed — check existing DB record
      const existingDmarc = (domainRecord.dns_records || []).find(
        (r: any) => r.name?.includes('_dmarc') || r.purpose?.toLowerCase().includes('dmarc')
      );
      const dmarcVerified = existingDmarc?.status === 'verified';

      // Build updated dns_records: Resend records + preserve existing DMARC recommendation
      const updatedDnsRecords = records.map((r: any) => ({
        type: r.type || r.record,
        name: r.name,
        value: r.value,
        purpose: r.record || r.type,
        status: r.status || 'pending',
      }));
      if (existingDmarc) {
        updatedDnsRecords.push(existingDmarc);
      } else {
        // Add DMARC recommendation if not already present
        updatedDnsRecords.push({
          type: 'TXT',
          name: `_dmarc.${cleanDomain}`,
          value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${cleanDomain}`,
          purpose: 'DMARC policy',
          status: 'info',
        });
      }

      // Update database with verification details
      const updateData: any = {
        spf_verified: spfVerified,
        dkim_verified: dkimVerified,
        dmarc_verified: dmarcVerified,
        dns_records: updatedDnsRecords,
      };

      if (isVerified) {
        updateData.status = 'verified';
        updateData.verified_at = new Date().toISOString();
      }

      await supabase
        .from('email_domains')
        .update(updateData)
        .eq('client_id', client_id)
        .eq('domain', cleanDomain);

      return c.json({
        domain: cleanDomain,
        verified: isVerified,
        status: domainInfo?.status || 'not_started',
        spf_verified: spfVerified,
        dkim_verified: dkimVerified,
        dmarc_verified: dmarcVerified,
        records: records.map((r: any) => ({
          type: r.type || r.record,
          name: r.name,
          status: r.status,
        })),
      });
    }

    case 'list': {
      // List all domains for a client
      const { data, error } = await supabase
        .from('email_domains')
        .select('*')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false });

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ domains: data || [] });
    }

    case 'delete': {
      const { domain } = body;
      if (!domain) return c.json({ error: 'domain is required' }, 400);

      const { error } = await supabase
        .from('email_domains')
        .delete()
        .eq('client_id', client_id)
        .eq('domain', domain.toLowerCase().trim());

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
