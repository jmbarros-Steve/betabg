// El Chino — token_health executor
// Checks 4-5: verify tokens are valid and not expired

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChinoCheck, MerchantConn, CheckResult } from '../types.js';

export async function executeTokenHealth(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant: MerchantConn,
  decryptedToken: string | null
): Promise<CheckResult> {
  const start = Date.now();

  if (!decryptedToken) {
    return {
      result: 'fail',
      error_message: 'No hay token',
      duration_ms: Date.now() - start,
    };
  }

  try {
    if (check.check_number === 4) {
      // Shopify: token doesn't expire, just verify it responds 200
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(
          `https://${merchant.store_url}/admin/api/2025-01/shop.json`,
          {
            headers: { 'X-Shopify-Access-Token': decryptedToken },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);
        if (res.ok) {
          return { result: 'pass', duration_ms: Date.now() - start };
        }
        return {
          result: 'fail',
          error_message: `Shopify token check returned ${res.status}`,
          duration_ms: Date.now() - start,
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    if (check.check_number === 5) {
      // Meta: verify token works + check age
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(
          'https://graph.facebook.com/v21.0/me?fields=id,name',
          {
            headers: { Authorization: `Bearer ${decryptedToken}` },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (!res.ok) {
          return {
            result: 'fail',
            error_message: `Meta token check returned ${res.status}`,
            duration_ms: Date.now() - start,
          };
        }

        // Check token age if max_age_days is configured
        const maxAgeDays = check.check_config?.max_age_days as number | undefined;
        if (maxAgeDays && merchant.connection_id) {
          const { data: conn } = await supabase
            .from('platform_connections')
            .select('updated_at')
            .eq('id', merchant.connection_id)
            .single();

          if (conn?.updated_at) {
            const ageDays = (Date.now() - new Date(conn.updated_at).getTime()) / 86400_000;
            if (ageDays > maxAgeDays) {
              return {
                result: 'fail',
                steve_value: `${ageDays.toFixed(1)} days`,
                real_value: `max ${maxAgeDays} days`,
                error_message: `Token tiene ${ageDays.toFixed(1)} días (máximo: ${maxAgeDays})`,
                duration_ms: Date.now() - start,
              };
            }
          }
        }

        return { result: 'pass', duration_ms: Date.now() - start };
      } finally {
        clearTimeout(timeout);
      }
    }

    return {
      result: 'skip',
      error_message: `token_health not implemented for check #${check.check_number}`,
      duration_ms: Date.now() - start,
    };
  } catch (err: any) {
    return {
      result: 'error',
      error_message: err.name === 'AbortError' ? 'Timeout (30s)' : err.message,
      duration_ms: Date.now() - start,
    };
  }
}
