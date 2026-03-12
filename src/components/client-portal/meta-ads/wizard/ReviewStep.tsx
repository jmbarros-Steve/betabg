import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Megaphone, FolderOpen, FileImage, Target, DollarSign, Info, AlertTriangle, Calendar, Layers } from 'lucide-react';
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
  // Ad (single values for backward compat)
  headline: string;
  primaryText: string;
  description: string;
  imageUrl: string;
  cta: string;
  destinationUrl: string;
  pageName: string;
  // New array props (optional, fall back to single values)
  images?: string[];
  headlines?: string[];
  primaryTexts?: string[];
  descriptions?: string[];
  adSetFormat?: string;
  selectedAngle?: string;
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

const FORMAT_LABELS: Record<string, string> = {
  flexible: 'Flexible (DCT 3:2:2)',
  carousel: 'Carrusel',
  single: 'Imagen Única',
};

export default function ReviewStep(props: ReviewStepProps) {
  const {
    existingCampaignId, existingCampaignName, campName, budgetType, objective, campBudget, startDate,
    existingAdsetId, existingAdsetName, adsetName, audienceDesc, adsetBudget,
    funnelStage,
    headline, primaryText, description, imageUrl, cta, destinationUrl, pageName,
    images, headlines, primaryTexts, descriptions, adSetFormat, selectedAngle,
  } = props;

  const campaignLabel = existingCampaignId ? existingCampaignName : campName;
  const adsetLabel = existingAdsetId ? existingAdsetName : adsetName;
  const funnel = FUNNEL_LABELS[funnelStage] || FUNNEL_LABELS.tofu;
  const budget = budgetType === 'CBO' ? campBudget : adsetBudget;

  // Resolve arrays (fall back to single values)
  const allImages = (images && images.length > 0) ? images : (imageUrl ? [imageUrl] : []);
  const allHeadlines = (headlines && headlines.length > 0) ? headlines : (headline ? [headline] : []);
  const allPrimaryTexts = (primaryTexts && primaryTexts.length > 0) ? primaryTexts : (primaryText ? [primaryText] : []);
  const allDescriptions = (descriptions && descriptions.length > 0) ? descriptions : (description ? [description] : []);

  const hasMultipleCreatives = allImages.length > 1 || allHeadlines.length > 1 || allPrimaryTexts.length > 1;

  const formatStartDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return d; }
  };

  return (
    <div className="space-y-4">
      {/* PAUSA notice */}
      <Card className="border-blue-300 bg-blue-50">
        <CardContent className="py-3 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800">
            <span className="font-semibold">Tu campaña se creará en PAUSA en Meta.</span>{' '}
            Esto te permite revisarla antes de activarla. No se gastará dinero hasta que la actives manualmente.
          </div>
        </CardContent>
      </Card>

      {/* Start date */}
      <Card className={startDate ? 'border-green-300 bg-green-50/50' : 'border-yellow-300 bg-yellow-50'}>
        <CardContent className="py-3 flex items-center gap-3">
          {startDate ? (
            <>
              <Calendar className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-sm font-medium text-green-800">
                Inicio: {formatStartDate(startDate)}
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
              <span className="text-sm text-yellow-800">
                Sin fecha de inicio definida — la campaña comenzará al activarla
              </span>
            </>
          )}
        </CardContent>
      </Card>

      {/* Format + Angle badges */}
      {(adSetFormat || selectedAngle) && (
        <div className="flex flex-wrap items-center gap-2">
          {adSetFormat && (
            <Badge variant="outline" className="text-xs gap-1 border-purple-400 text-purple-700 bg-purple-50">
              <Layers className="w-3 h-3" />
              Formato: {FORMAT_LABELS[adSetFormat] || adSetFormat}
            </Badge>
          )}
          {selectedAngle && (
            <Badge variant="outline" className="text-xs gap-1 border-indigo-400 text-indigo-700 bg-indigo-50">
              Ángulo: {selectedAngle}
            </Badge>
          )}
        </div>
      )}

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

      {/* Ad creative review */}
      {(allPrimaryTexts.some(Boolean) || allHeadlines.some(Boolean) || allImages.some(Boolean)) && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileImage className="w-4 h-4 text-pink-500" />
            <span className="text-sm font-semibold">Creatividades del Anuncio</span>
            {hasMultipleCreatives && (
              <Badge variant="outline" className="text-[9px] border-purple-400 text-purple-700">
                DCT {allImages.filter(Boolean).length}:{allPrimaryTexts.filter(Boolean).length}:{allHeadlines.filter(Boolean).length}
              </Badge>
            )}
          </div>

          {/* Images grid */}
          {allImages.filter(Boolean).length > 1 ? (
            <div className="space-y-3 mb-4">
              <span className="text-xs font-medium text-muted-foreground">Imágenes ({allImages.filter(Boolean).length})</span>
              <div className="grid grid-cols-3 gap-2">
                {allImages.filter(Boolean).map((img, i) => (
                  <div key={i} className="space-y-1">
                    <div className="aspect-square rounded-md overflow-hidden border bg-muted">
                      <img src={img} alt={`Imagen ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center block">Imagen {i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Texts list */}
          {allPrimaryTexts.filter(Boolean).length > 1 && (
            <div className="space-y-2 mb-4">
              <span className="text-xs font-medium text-muted-foreground">Textos principales ({allPrimaryTexts.filter(Boolean).length})</span>
              {allPrimaryTexts.filter(Boolean).map((txt, i) => (
                <div key={i} className="bg-muted/50 rounded-md p-2 text-xs">
                  <span className="text-muted-foreground font-medium">Texto {i + 1}:</span>{' '}
                  <span className="whitespace-pre-wrap">{txt}</span>
                </div>
              ))}
            </div>
          )}

          {/* Headlines list */}
          {allHeadlines.filter(Boolean).length > 1 && (
            <div className="space-y-2 mb-4">
              <span className="text-xs font-medium text-muted-foreground">Títulos ({allHeadlines.filter(Boolean).length})</span>
              {allHeadlines.filter(Boolean).map((h, i) => (
                <div key={i} className="bg-muted/50 rounded-md p-2 text-xs">
                  <span className="text-muted-foreground font-medium">Título {i + 1}:</span> {h}
                </div>
              ))}
            </div>
          )}

          {/* Descriptions list */}
          {allDescriptions.filter(Boolean).length > 1 && (
            <div className="space-y-2 mb-4">
              <span className="text-xs font-medium text-muted-foreground">Descripciones ({allDescriptions.filter(Boolean).length})</span>
              {allDescriptions.filter(Boolean).map((d, i) => (
                <div key={i} className="bg-muted/50 rounded-md p-2 text-xs">
                  <span className="text-muted-foreground font-medium">Desc {i + 1}:</span> {d}
                </div>
              ))}
            </div>
          )}

          {/* Single-creative preview (original AdPreviewMockup) */}
          <div className="flex justify-center">
            <AdPreviewMockup
              imageUrl={allImages.find(Boolean) || ''}
              primaryText={allPrimaryTexts.find(Boolean) || ''}
              headline={allHeadlines.find(Boolean) || ''}
              description={allDescriptions.find(Boolean) || ''}
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
