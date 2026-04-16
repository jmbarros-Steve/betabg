import { useState } from 'react';
import { callApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Sparkles, X, Check } from 'lucide-react';

interface SteveRecommendationProps {
  connectionId: string;
  recommendationType: 'campaign_setup' | 'pmax_assets' | 'bid_strategy' | 'campaign_name' | 'targeting' | 'cta_sitelinks';
  channelType?: string;
  context?: string;
  clientId?: string;
  onApply: (recommendation: any) => void;
}

export default function SteveRecommendation({
  connectionId,
  recommendationType,
  channelType,
  context,
  clientId,
  onApply,
}: SteveRecommendationProps) {
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendation = async () => {
    setLoading(true);
    setError(null);

    const { data, error: apiError } = await callApi('manage-google-campaign', {
      body: {
        action: 'get_recommendations',
        connection_id: connectionId,
        data: {
          recommendation_type: recommendationType,
          channel_type: channelType,
          context,
          client_id: clientId,
        },
      },
    });

    setLoading(false);

    if (apiError) {
      setError(apiError);
      return;
    }

    if (data?.recommendation) {
      setRecommendation(data.recommendation);
    }
  };

  if (dismissed) return null;

  // Not yet fetched — show trigger button
  if (!recommendation && !loading) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-blue-500 gap-1.5"
        onClick={fetchRecommendation}
      >
        <Sparkles className="w-3.5 h-3.5" />
        Steve recomienda
      </Button>
    );
  }

  if (loading) {
    return (
      <Card className="p-3 bg-blue-50/50 border-blue-200">
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Steve esta analizando...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-3 bg-red-50/50 border-red-200">
        <p className="text-sm text-red-600">Error: {error}</p>
      </Card>
    );
  }

  // Show recommendation
  const reasoning = recommendation?.reasoning || '';

  return (
    <Card className="p-3 bg-blue-50/50 border-blue-200">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
            <p className="font-medium text-blue-700">Steve recomienda</p>
            {reasoning && <p className="text-blue-600">{reasoning}</p>}

            {recommendationType === 'campaign_setup' && recommendation?.bid_strategy && (
              <div className="text-xs text-blue-500 space-y-0.5 mt-1">
                <p>Estrategia: <strong>{recommendation.bid_strategy}</strong></p>
                {recommendation.daily_budget && <p>Presupuesto: <strong>${recommendation.daily_budget}</strong>/dia</p>}
              </div>
            )}

            {recommendationType === 'pmax_assets' && recommendation?.headlines && (
              <div className="text-xs text-blue-500 mt-1">
                <p>{recommendation.headlines.length} headlines + {recommendation.descriptions?.length || 0} descripciones sugeridas</p>
              </div>
            )}

            {recommendationType === 'campaign_name' && recommendation?.name && (
              <div className="text-xs text-blue-500 mt-1">
                <p>Nombre: <strong>{recommendation.name}</strong></p>
              </div>
            )}

            {recommendationType === 'targeting' && (recommendation?.locations || recommendation?.languages) && (
              <div className="text-xs text-blue-500 space-y-0.5 mt-1">
                {recommendation.locations?.length > 0 && (
                  <p>Paises: <strong>{recommendation.locations.map((l: any) => l.name).join(', ')}</strong></p>
                )}
                {recommendation.languages?.length > 0 && (
                  <p>Idiomas: <strong>{recommendation.languages.map((l: any) => l.name).join(', ')}</strong></p>
                )}
              </div>
            )}

            {recommendationType === 'cta_sitelinks' && (recommendation?.call_to_action || recommendation?.sitelinks) && (
              <div className="text-xs text-blue-500 space-y-0.5 mt-1">
                {recommendation.call_to_action && <p>CTA: <strong>{recommendation.call_to_action}</strong></p>}
                {recommendation.sitelinks?.length > 0 && <p>{recommendation.sitelinks.length} sitelinks sugeridos</p>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-blue-600 hover:bg-blue-100"
            onClick={() => onApply(recommendation)}
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Aplicar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-blue-400 hover:bg-blue-100"
            onClick={() => setDismissed(true)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
