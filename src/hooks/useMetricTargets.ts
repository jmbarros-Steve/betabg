import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MetricKey } from '@/lib/metric-utils';

export interface MetricTarget {
  metric_key: MetricKey;
  target_value: number;
}

/**
 * Hook to load campaign metric targets for a client.
 * Reads from client_financial_config.metric_targets JSONB field.
 * Falls back to empty targets if not configured.
 */
export function useMetricTargets(clientId: string | undefined) {
  const [targets, setTargets] = useState<MetricTarget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    async function fetchTargets() {
      try {
        const { data } = await supabase
          .from('client_financial_config')
          .select('metric_targets')
          .eq('client_id', clientId)
          .maybeSingle();

        if (data?.metric_targets && Array.isArray(data.metric_targets)) {
          setTargets(data.metric_targets as MetricTarget[]);
        }
      } catch {
        // Targets unavailable — non-critical
      } finally {
        setLoading(false);
      }
    }

    fetchTargets();
  }, [clientId]);

  const targetMap = useMemo(() => {
    const map = new Map<MetricKey, number>();
    for (const t of targets) {
      map.set(t.metric_key, t.target_value);
    }
    return map;
  }, [targets]);

  function getTarget(metric: MetricKey): number | undefined {
    return targetMap.get(metric);
  }

  function getAggregateTarget(metrics: MetricKey[]): number {
    let total = 0;
    for (const m of metrics) {
      total += targetMap.get(m) ?? 0;
    }
    return total;
  }

  return { targets, loading, getTarget, getAggregateTarget, targetMap };
}
