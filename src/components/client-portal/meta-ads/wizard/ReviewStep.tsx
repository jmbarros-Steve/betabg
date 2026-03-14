import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { JargonTooltip } from '@/components/client-portal/JargonTooltip';
import { Megaphone, FolderOpen, FileImage, Target, DollarSign, Info, AlertTriangle, Calendar, Layers, CheckCircle2, XCircle, Rocket, Save, Loader2 } from 'lucide-react';
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
  // Actions
  onPublish?: () => void;
  onSaveDraft?: () => void;
  submitting?: boolean;
  savingDraft?: boolean;
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
    onPublish, onSaveDraft, submitting, savingDraft,
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

  // --- Validation checklist ---
  const checks: Array<{ label: string; ok: boolean; step?: string }> = [
    { label: 'Al menos 1 imagen', ok: allImages.some(Boolean), step: 'Anuncio' },
    { label: 'Texto principal', ok: allPrimaryTexts.some((t) => t.trim()), step: 'Anuncio' },
    { label: 'Titulo / headline', ok: allHeadlines.some((h) => h.trim()), step: 'Anuncio' },
    { label: 'URL de destino', ok: !!destinationUrl.trim(), step: 'Anuncio' },
    { label: 'Presupuesto definido', ok: !!budget || !!existingAdsetId, step: 'Ad Set' },
    { label: 'Audiencia definida', ok: !!audienceDesc.trim() || !!existingAdsetId, step: 'Ad Set' },
    { label: 'Nombre de campana', ok: !!campaignLabel?.trim(), step: 'Campana' },
  ];
  const allPassed = checks.every((c) => c.ok);
  const failedChecks = checks.filter((c) => !c.ok);

  return (
    <div className="space-y-4">
      {/* Readiness banner */}
      {allPassed ? (
        <Card className="border-green-400 bg-green-50">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-800">Todo listo para publicar</p>
              <p className="text-xs text-green-700">Tu campana se creara en PAUSA. No se gastara dinero hasta que la actives en Meta.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm font-bold text-red-800">Faltan datos para publicar</p>
            </div>
            <ul className="space-y-1 ml-7">
              {failedChecks.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-red-700">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{c.label}</span>
                  {c.step && <Badge variant="outline" className="text-[9px] ml-1 border-red-300 text-red-600">{c.step}</Badge>}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-red-600 ml-7">Vuelve al paso correspondiente para completar los datos faltantes.</p>
          </CardContent>
        </Card>
      )}

      {/* PAUSA notice */}
      <Card className="border-blue-300 bg-blue-50">
        <CardContent className="py-3 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800">
            <span className="font-semibold">Tu campana se creara en PAUSA en Meta.</span>{' '}
            Esto te permite revisarla antes de activarla. No se gastara dinero hasta que la actives manualmente.
          </div>
        </CardContent>
      </Card>

      {/* Validation checklist */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <span className="text-xs font-semibold text-muted-foreground">Checklist</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {checks.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                {c.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                )}
                <span className={c.ok ? 'text-muted-foreground' : 'text-red-700 font-medium'}>{c.label}</span>
              </div>
            ))}
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
                Sin fecha de inicio definida — la campana comenzara al activarla
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
              Angulo: {selectedAngle}
            </Badge>
          )}
        </div>
      )}

      {/* Campaign summary */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Campana</span>
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
                <Badge className={`text-[10px] w-fit ${budgetType === 'CBO' ? 'bg-purple-500/15 text-purple-700' : 'bg-blue-500/15 text-blue-700'}`}><JargonTooltip term={budgetType} /></Badge>
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
              {budget ? `$${Number(budget).toLocaleString('es-CL')}/dia` : 'Sin definir'}
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
                <JargonTooltip term="DCT" /> {allImages.filter(Boolean).length}:{allPrimaryTexts.filter(Boolean).length}:{allHeadlines.filter(Boolean).length}
              </Badge>
            )}
          </div>

          {/* Images grid */}
          {allImages.filter(Boolean).length > 1 ? (
            <div className="space-y-3 mb-4">
              <span className="text-xs font-medium text-muted-foreground">Imagenes ({allImages.filter(Boolean).length})</span>
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
              <span className="text-xs font-medium text-muted-foreground">Titulos ({allHeadlines.filter(Boolean).length})</span>
              {allHeadlines.filter(Boolean).map((h, i) => (
                <div key={i} className="bg-muted/50 rounded-md p-2 text-xs">
                  <span className="text-muted-foreground font-medium">Titulo {i + 1}:</span> {h}
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

      {/* Publish / Draft action buttons */}
      {(onPublish || onSaveDraft) && (
        <div className="pt-2 space-y-3">
          <div className="border-t pt-4" />
          {onPublish && (
            <Button
              onClick={onPublish}
              disabled={!allPassed || submitting}
              size="lg"
              className="w-full bg-green-600 hover:bg-green-700 text-white text-base font-bold py-6 disabled:opacity-50"
            >
              {submitting ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Creando campana en Meta...</>
              ) : !allPassed ? (
                <>Completa los datos faltantes para publicar</>
              ) : (
                <><Rocket className="w-5 h-5 mr-2" />Publicar Campana en Meta</>
              )}
            </Button>
          )}
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={savingDraft}
              size="lg"
              className="w-full"
            >
              {savingDraft ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando borrador...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" />Guardar como Borrador</>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
