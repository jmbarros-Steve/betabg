import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { FLOW_TEMPLATES, type FlowTemplate } from './FlowTemplates';
import { FlowCard } from './FlowCard';
import { FlowDetail } from './FlowDetail';

type FlowStatus = 'not_created' | 'draft' | 'active' | 'paused';

interface FlowStatusMap {
  [flowId: string]: {
    status: FlowStatus;
    metrics?: { revenue: number; sent: number; openRate: number };
  };
}

interface FlowsPanelProps {
  clientId: string;
}

export function FlowsPanel({ clientId }: FlowsPanelProps) {
  const [selectedFlow, setSelectedFlow] = useState<FlowTemplate | null>(null);
  const [flowStatuses, setFlowStatuses] = useState<FlowStatusMap>({});
  const [loading, setLoading] = useState(true);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFlowStatuses();
  }, [clientId]);

  const loadFlowStatuses = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get Klaviyo connection
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!conn) {
        setError('No hay conexión activa de Klaviyo. Conecta Klaviyo en la sección de Conexiones para usar flujos automáticos.');
        setLoading(false);
        return;
      }

      setConnectionId(conn.id);

      // Fetch existing flows from Klaviyo
      const { data, error: fetchError } = await callApi('klaviyo-manage-flows', {
        body: { action: 'list_flows', connectionId: conn.id },
      });

      if (fetchError) throw fetchError;

      const existingFlows = data?.flows || [];

      // Match existing flows to templates by name
      const statusMap: FlowStatusMap = {};
      for (const template of FLOW_TEMPLATES) {
        const match = existingFlows.find(
          (f: any) =>
            f.name?.toLowerCase().includes(template.name.toLowerCase()) ||
            f.name?.toLowerCase().includes(template.nameEs.toLowerCase())
        );

        if (match) {
          const status: FlowStatus =
            match.status === 'live' || match.status === 'active'
              ? 'active'
              : match.status === 'draft'
              ? 'draft'
              : match.status === 'paused'
              ? 'paused'
              : 'draft';

          statusMap[template.id] = {
            status,
            metrics: match.metrics
              ? {
                  revenue: match.metrics.revenue || 0,
                  sent: match.metrics.sent || 0,
                  openRate: match.metrics.open_rate || 0,
                }
              : undefined,
          };
        } else {
          statusMap[template.id] = { status: 'not_created' };
        }
      }

      setFlowStatuses(statusMap);
    } catch (err: any) {
      console.error('Error loading flows:', err);
      // Don't show error toast for initial load failures, just set default statuses
      const defaultMap: FlowStatusMap = {};
      for (const template of FLOW_TEMPLATES) {
        defaultMap[template.id] = { status: 'not_created' };
      }
      setFlowStatuses(defaultMap);
    } finally {
      setLoading(false);
    }
  };

  const handleFlowAction = (flowId: string, _action: 'create' | 'view' | 'activate') => {
    const template = FLOW_TEMPLATES.find((t) => t.id === flowId);
    if (template) {
      setSelectedFlow(template);
    }
  };

  const handleFlowCreated = () => {
    setSelectedFlow(null);
    loadFlowStatuses();
  };

  const priorityFlows = FLOW_TEMPLATES.filter(
    (t) => t.priority === 'critical' || t.priority === 'high'
  );
  const recommendedFlows = FLOW_TEMPLATES.filter((t) => t.priority === 'medium');

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Flujos Automáticos</h2>
            <p className="text-sm text-muted-foreground">Cargando flujos...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Flujos Automáticos</h2>
            <p className="text-sm text-muted-foreground">
              Steve propone los flujos más efectivos para tu marca
            </p>
          </div>
        </div>
        <Card className="p-8 text-center">
          <Zap className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Zap className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">Flujos Automáticos</h2>
          <p className="text-sm text-muted-foreground">
            Steve propone los flujos más efectivos para tu marca
          </p>
        </div>
      </div>

      {/* Priority flows section */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          Prioritarios
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Estos flujos tienen el mayor impacto en ingresos y retención. Recomendamos activarlos primero.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {priorityFlows.map((template) => {
            const flowStatus = flowStatuses[template.id];
            return (
              <FlowCard
                key={template.id}
                template={template}
                status={flowStatus?.status || 'not_created'}
                metrics={flowStatus?.metrics}
                recommended={template.priority === 'critical'}
                onAction={handleFlowAction}
              />
            );
          })}
        </div>
      </div>

      {/* Recommended flows section */}
      <div>
        <h3 className="text-base font-semibold mb-3">Recomendados</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Flujos adicionales que complementan tu estrategia de email marketing.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recommendedFlows.map((template) => {
            const flowStatus = flowStatuses[template.id];
            return (
              <FlowCard
                key={template.id}
                template={template}
                status={flowStatus?.status || 'not_created'}
                metrics={flowStatus?.metrics}
                onAction={handleFlowAction}
              />
            );
          })}
        </div>
      </div>

      {/* Flow detail dialog */}
      {selectedFlow && (
        <FlowDetail
          template={selectedFlow}
          clientId={clientId}
          open={!!selectedFlow}
          onClose={() => setSelectedFlow(null)}
          onFlowCreated={handleFlowCreated}
        />
      )}
    </div>
  );
}
