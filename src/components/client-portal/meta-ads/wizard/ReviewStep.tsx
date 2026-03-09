import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Megaphone, FolderOpen, FileImage, Target, DollarSign } from 'lucide-react';
import AdPreviewMockup from '../AdPreviewMockup';

interface ReviewStepProps {
  // Campaign
  existingCampaignId: string | null;
  existingCampaignName: string;
  campName: string;
  budgetType: string;
  objective: string;
  campBudget: string;
  startDate: string;
  // Ad Set
  existingAdsetId: string | null;
  existingAdsetName: string;
  adsetName: string;
  audienceDesc: string;
  adsetBudget: string;
  // Funnel
  funnelStage: string;
  // Ad
  headline: string;
  primaryText: string;
  description: string;
  imageUrl: string;
  cta: string;
  destinationUrl: string;
  pageName: string;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  CONVERSIONS: 'Conversiones',
  TRAFFIC: 'Tráfico',
  AWARENESS: 'Reconocimiento',
  ENGAGEMENT: 'Interacción',
  CATALOG: 'Catálogo',
};

const FUNNEL_LABELS: Record<string, { label: string; color: string }> = {
  tofu: { label: 'TOFU — Awareness', color: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  mofu: { label: 'MOFU — Consideración', color: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30' },
  bofu: { label: 'BOFU — Conversión', color: 'bg-green-500/15 text-green-700 border-green-500/30' },
};

export default function ReviewStep(props: ReviewStepProps) {
  const {
    existingCampaignId, existingCampaignName, campName, budgetType, objective, campBudget, startDate,
    existingAdsetId, existingAdsetName, adsetName, audienceDesc, adsetBudget,
    funnelStage,
    headline, primaryText, description, imageUrl, cta, destinationUrl, pageName,
  } = props;

  const campaignLabel = existingCampaignId ? existingCampaignName : campName;
  const adsetLabel = existingAdsetId ? existingAdsetName : adsetName;
  const funnel = FUNNEL_LABELS[funnelStage] || FUNNEL_LABELS.tofu;
  const budget = budgetType === 'CBO' ? campBudget : adsetBudget;

  return (
    <div className="space-y-4">
      {/* Campaign summary */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Campaña</span>
            {existingCampaignId && <Badge variant="outline" className="text-[9px]">Existente</Badge>}
            {!existingCampaignId && <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-700">Nueva</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Nombre:</span>
            <span className="font-medium truncate">{campaignLabel || '—'}</span>
            {!existingCampaignId && (
              <>
                <span className="text-muted-foreground">Objetivo:</span>
                <span className="font-medium">{OBJECTIVE_LABELS[objective] || objective}</span>
                <span className="text-muted-foreground">Tipo:</span>
                <Badge className={`text-[10px] w-fit ${budgetType === 'CBO' ? 'bg-purple-500/15 text-purple-700' : 'bg-blue-500/15 text-blue-700'}`}>{budgetType}</Badge>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ad Set summary */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-semibold">Ad Set</span>
            {existingAdsetId && <Badge variant="outline" className="text-[9px]">Existente</Badge>}
            {!existingAdsetId && <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-700">Nuevo</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Nombre:</span>
            <span className="font-medium truncate">{adsetLabel || '—'}</span>
            {!existingAdsetId && audienceDesc && (
              <>
                <span className="text-muted-foreground">Audiencia:</span>
                <span className="font-medium truncate">{audienceDesc}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Funnel + Budget */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-500" />
            <Badge className={`text-[10px] ${funnel.color}`}>{funnel.label}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium">
              {budget ? `$${Number(budget).toLocaleString('es-CL')}/día` : 'Sin definir'}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Ad preview */}
      {(primaryText || headline || imageUrl) && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileImage className="w-4 h-4 text-pink-500" />
            <span className="text-sm font-semibold">Preview del Anuncio</span>
          </div>
          <div className="flex justify-center">
            <AdPreviewMockup
              imageUrl={imageUrl}
              primaryText={primaryText}
              headline={headline}
              description={description}
              cta={cta}
              pageName={pageName || 'Tu Marca'}
              destinationUrl={destinationUrl}
            />
          </div>
        </div>
      )}
    </div>
  );
}
