import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { callApi } from '@/lib/api';

interface DynamicSteveTipProps {
  clientId: string;
  stepKey: string;
  context: Record<string, any>;
  fallback: string;
}

const STEP_PROMPTS: Record<string, string> = {
  'campaign-config': 'Estoy configurando una campaña Meta Ads (nombre, objetivo, presupuesto). Dame UNA recomendación corta y accionable.',
  'select-campaign': 'Necesito elegir una campaña existente para agregar un Ad Set. Qué debería considerar para elegir la campaña correcta?',
  'adset-config': 'Estoy configurando un Ad Set (audiencia, presupuesto). Dame UNA recomendación corta sobre segmentación.',
  'select-adset': 'Necesito elegir un Ad Set existente para agregar un anuncio. Qué criterios debería usar?',
  'funnel-stage': 'Estoy eligiendo la etapa del funnel (TOFU/MOFU/BOFU) para mi anuncio. Ayúdame a decidir.',
  'ad-creative': 'Estoy creando el creativo del anuncio (imagen, copy, CTA). Dame UNA recomendación accionable sobre copy o creativo.',
  'review': 'Estoy por publicar mi campaña. Dame un check final rápido de qué verificar antes de lanzar.',
};

export default function DynamicSteveTip({ clientId, stepKey, context, fallback }: DynamicSteveTipProps) {
  const [recommendation, setRecommendation] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchRecommendation = useCallback(async () => {
    setLoading(true);
    setRecommendation('');
    try {
      const stepPrompt = STEP_PROMPTS[stepKey] || 'Dame una recomendación para este paso.';
      const contextParts = [];
      if (context.objective) contextParts.push(`Objetivo: ${context.objective}`);
      if (context.audienceDesc) contextParts.push(`Audiencia: ${context.audienceDesc}`);
      if (context.budgetType) contextParts.push(`Presupuesto: ${context.budgetType}`);
      if (context.funnelStage) contextParts.push(`Funnel: ${context.funnelStage}`);
      if (context.headline) contextParts.push(`Headline actual: ${context.headline}`);

      const fullPrompt = `${stepPrompt}\n\nContexto: ${contextParts.join('. ') || 'Sin datos aún'}\n\nResponde en 2-3 oraciones máximo, en español. Sé específico y práctico.`;

      const { data, error } = await callApi('steve-chat', {
        body: {
          client_id: clientId,
          messages: [{ role: 'user', content: fullPrompt }],
          mode: 'quick',
        },
      });

      if (!error && data?.response) {
        setRecommendation(data.response);
      } else {
        setRecommendation(fallback);
      }
    } catch {
      setRecommendation(fallback);
    } finally {
      setLoading(false);
    }
  }, [clientId, stepKey, context, fallback]);

  useEffect(() => {
    fetchRecommendation();
  }, [stepKey]); // Only refetch when step changes

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/20">
      <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : (
          <p className="text-xs text-foreground leading-relaxed">{recommendation || fallback}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">IA</Badge>
        <button
          onClick={fetchRecommendation}
          disabled={loading}
          className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
