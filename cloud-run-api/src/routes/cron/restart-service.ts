import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * POST /api/cron/restart-service
 * Called by OJOS health-check when an endpoint has 2+ consecutive failures.
 * Triggers a Cloud Run service restart by updating an env var (forces new revision).
 *
 * Auth: X-Cron-Secret or SUPABASE_SERVICE_ROLE_KEY
 * Body: { endpoint: string, reason: string }
 */
export async function restartService(c: Context) {
  // Auth: X-Cron-Secret
  const cronSecret = c.req.header('X-Cron-Secret');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = c.req.header('Authorization')?.replace('Bearer ', '');

  if (cronSecret !== serviceKey && authHeader !== serviceKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { endpoint, reason } = await c.req.json().catch(() => ({ endpoint: '', reason: '' }));

  if (!endpoint) {
    return c.json({ error: 'Missing endpoint' }, 400);
  }

  const supabase = getSupabaseAdmin();

  // Check cooldown: don't restart more than once per 10 minutes
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentRestart } = await supabase
    .from('qa_log')
    .select('id')
    .eq('check_type', 'service_restart')
    .gte('created_at', tenMinAgo)
    .limit(1);

  if (recentRestart && recentRestart.length > 0) {
    console.log(`[restart-service] Cooldown active, skipping restart for ${endpoint}`);
    return c.json({ restarted: false, reason: 'cooldown_active' });
  }

  // Determine service type from endpoint name
  const isCloudRun = !endpoint.startsWith('edge-');
  const isFrontend = endpoint === 'frontend';

  if (isFrontend) {
    return c.json({ restarted: false, reason: 'frontend_cannot_restart' });
  }

  // For Cloud Run: use the Cloud Run Admin API to force a new revision
  if (isCloudRun) {
    try {
      // Get access token from metadata server (works inside Cloud Run)
      const tokenRes = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        { headers: { 'Metadata-Flavor': 'Google' } },
      );

      if (!tokenRes.ok) {
        console.error('[restart-service] Failed to get metadata token:', tokenRes.status);
        return c.json({ restarted: false, reason: 'metadata_token_failed' }, 500);
      }

      const { access_token } = await tokenRes.json() as { access_token: string };

      const project = process.env.GCP_PROJECT || 'steveapp-agency';
      const region = 'us-central1';
      const serviceName = 'steve-api';

      // Get current service config
      const svcRes = await fetch(
        `https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${serviceName}`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      );

      if (!svcRes.ok) {
        const errText = await svcRes.text();
        console.error('[restart-service] Failed to get service:', svcRes.status, errText);
        return c.json({ restarted: false, reason: `get_service_failed: ${svcRes.status}` }, 500);
      }

      const svc = await svcRes.json() as any;

      // Update FORCE_RESTART env var to trigger new revision
      const containers = svc.template?.containers || [];
      if (containers.length > 0) {
        const envVars = containers[0].env || [];
        const existingIdx = envVars.findIndex((e: any) => e.name === 'FORCE_RESTART');
        const newVal = Date.now().toString();

        if (existingIdx >= 0) {
          envVars[existingIdx].value = newVal;
        } else {
          envVars.push({ name: 'FORCE_RESTART', value: newVal });
        }
        containers[0].env = envVars;
      }

      // PATCH the service
      const patchRes = await fetch(
        `https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${serviceName}?updateMask=template.containers`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ template: { containers } }),
        },
      );

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        console.error('[restart-service] Failed to patch service:', patchRes.status, errText);
        return c.json({ restarted: false, reason: `patch_failed: ${patchRes.status}` }, 500);
      }

      console.log(`[restart-service] Cloud Run restart triggered for endpoint: ${endpoint}`);

      // Log the restart
      await supabase.from('qa_log').insert({
        check_type: 'service_restart',
        status: 'info',
        details: {
          endpoint,
          service: serviceName,
          reason: reason || '2+ consecutive health-check failures',
          triggered_at: new Date().toISOString(),
        },
      });

      return c.json({ restarted: true, service: serviceName, endpoint });
    } catch (err: any) {
      console.error('[restart-service] Error:', err.message);
      return c.json({ restarted: false, reason: err.message }, 500);
    }
  }

  return c.json({ restarted: false, reason: 'unsupported_service_type' });
}
