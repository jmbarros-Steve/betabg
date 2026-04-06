import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { CampaignType } from '../templates/TemplatePresets';
import { CAMPAIGN_TEMPLATES } from '../templates/TemplatePresets';
import type { BrandIdentity, ProductItem } from '../templates/BrandHtmlGenerator';
import { generateBrandEmail } from '../templates/BrandHtmlGenerator';
import { TemplateSelector } from './TemplateSelector';
import { ContentConfigurator } from './ContentConfigurator';
import { PreviewEditor } from './PreviewEditor';
import { SchedulePublish } from './SchedulePublish';
import { GrapesStudioEmailEditor } from '../shared/GrapesStudioEmailEditor';
import type { EmailBlock } from '../../email-blocks/blockTypes';

export interface CampaignData {
  type: CampaignType;
  subject: string;
  previewText: string;
  title: string;
  introText: string;
  products: ProductItem[];
  customBlocks: EmailBlock[];
  heroImageUrl: string;
  couponCode: string;
  couponDescription: string;
  couponExpiry: string;
  ctaText: string;
  ctaUrl: string;
  htmlContent: string;
  designJson?: any | null;
  collectionId: string;
  collectionName: string;
}

const STEP_LABELS = ['Tipo', 'Contenido', 'Editar', 'Preview', 'Programar'];

interface CampaignCreationWizardProps {
  clientId: string;
  brand: BrandIdentity;
  campaignType: CampaignType;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  editCampaign?: any;
}

function buildInitialData(type: CampaignType, editCampaign?: any): CampaignData {
  const template = CAMPAIGN_TEMPLATES[type];

  if (editCampaign) {
    return {
      type,
      subject: editCampaign.subject || '',
      previewText: editCampaign.previewText || '',
      title: editCampaign.title || '',
      introText: editCampaign.introText || '',
      products: editCampaign.products || [],
      customBlocks: editCampaign.customBlocks || [],
      heroImageUrl: editCampaign.heroImageUrl || '',
      couponCode: editCampaign.couponCode || '',
      couponDescription: editCampaign.couponDescription || '',
      couponExpiry: editCampaign.couponExpiry || '',
      ctaText: editCampaign.ctaText || '',
      ctaUrl: editCampaign.ctaUrl || '',
      htmlContent: editCampaign.htmlContent || '',
      designJson: editCampaign.designJson || null,
      collectionId: editCampaign.collectionId || '',
      collectionName: editCampaign.collectionName || '',
    };
  }

  return {
    type,
    subject: '',
    previewText: '',
    title: '',
    introText: '',
    products: [],
    customBlocks: [],
    heroImageUrl: '',
    couponCode: '',
    couponDescription: '',
    couponExpiry: '',
    ctaText: '',
    ctaUrl: '',
    htmlContent: '',
    designJson: null,
    collectionId: '',
    collectionName: '',
  };
}

export function CampaignCreationWizard({
  clientId,
  brand,
  campaignType,
  open,
  onClose,
  onCreated,
  editCampaign,
}: CampaignCreationWizardProps) {
  const [step, setStep] = useState(0);
  const [campaignData, setCampaignData] = useState<CampaignData>(
    buildInitialData(campaignType, editCampaign)
  );
  const [publishing, setPublishing] = useState(false);
  const [showGrapesEditor, setShowGrapesEditor] = useState(false);

  useEffect(() => {
    if (open) {
      setCampaignData(buildInitialData(campaignType, editCampaign));
      setStep(0);
      setPublishing(false);
    }
  }, [open, campaignType, editCampaign]);

  const handleUpdate = useCallback((partial: Partial<CampaignData>) => {
    setCampaignData(prev => ({ ...prev, ...partial }));
  }, []);

  const handleTypeChange = useCallback((type: CampaignType) => {
    setCampaignData(prev => ({
      ...prev,
      type,
      subject: '',
      title: '',
      introText: '',
      ctaText: '',
      products: [],
      customBlocks: [],
      heroImageUrl: '',
      couponCode: '',
      couponDescription: '',
      couponExpiry: '',
      collectionId: '',
      collectionName: '',
    }));
  }, []);

  const htmlContent = useMemo(() => {
    const template = CAMPAIGN_TEMPLATES[campaignData.type];
    return generateBrandEmail({
      brand,
      sections: template.sections,
      products: campaignData.products,
      customBlocks: campaignData.customBlocks,
      title: campaignData.title,
      introText: campaignData.introText,
      heroImageUrl: campaignData.heroImageUrl,
      ctaText: campaignData.ctaText,
      ctaUrl: campaignData.ctaUrl || brand.shopUrl,
      couponCode: campaignData.couponCode,
      couponDescription: campaignData.couponDescription,
      couponExpiry: campaignData.couponExpiry,
    });
  }, [brand, campaignData]);

  // Effective HTML: user-edited takes priority over auto-generated
  const effectiveHtml = campaignData.htmlContent || htmlContent;

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return !!campaignData.type;
      case 1:
        return !!campaignData.subject.trim() && !!campaignData.title.trim();
      case 2: // Editar — always passable (editor is optional)
        return true;
      case 3: // Preview
        return true;
      case 4: // Programar
        return true;
      default:
        return false;
    }
  }, [step, campaignData]);

  const handleNext = useCallback(() => {
    if (step === 2) {
      // Step "Editar": open fullscreen GrapesJS editor
      setShowGrapesEditor(true);
      return;
    }
    if (step < 4 && canAdvance) {
      setStep(s => s + 1);
    }
  }, [step, canAdvance]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep(s => s - 1);
    }
  }, [step]);

  const handleGrapesEditorSave = useCallback((emails: { subject: string; previewText: string; htmlContent: string; designJson?: any }[]) => {
    const edited = emails[0];
    if (edited) {
      setCampaignData(prev => ({
        ...prev,
        htmlContent: edited.htmlContent,
        designJson: edited.designJson || null,
        subject: edited.subject || prev.subject,
        previewText: edited.previewText || prev.previewText,
      }));
    }
    setShowGrapesEditor(false);
    setStep(3); // Advance to Preview
  }, []);

  const handleGrapesEditorCancel = useCallback(() => {
    setShowGrapesEditor(false);
  }, []);

  const handlePublish = useCallback((result: any) => {
    setPublishing(false);
    onCreated?.();
  }, [onCreated]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-lg font-semibold">
            {editCampaign ? 'Editar Campaña' : 'Crear Campaña'}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {CAMPAIGN_TEMPLATES[campaignData.type].label} — Paso {step + 1} de 5
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      i < step
                        ? 'bg-primary text-white'
                        : i === step
                        ? 'bg-primary text-white ring-2 ring-primary/30'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {i < step ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-[10px] mt-1 font-medium ${
                    i <= step ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className={`w-12 sm:w-20 h-0.5 mx-1 mt-[-12px] ${
                      i < step ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="p-6 min-h-[300px]">
          {step === 0 && (
            <TemplateSelector
              selectedType={campaignData.type}
              onSelect={handleTypeChange}
            />
          )}

          {step === 1 && (
            <ContentConfigurator
              clientId={clientId}
              brand={brand}
              campaignType={campaignData.type}
              campaignData={campaignData}
              onUpdate={handleUpdate}
            />
          )}

          {step === 2 && (
            <div className="space-y-4 text-center py-8">
              <h3 className="font-semibold text-base">Editar con drag & drop</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Abre el editor visual para personalizar tu email: arrastra bloques, cambia colores, agrega productos y mas.
              </p>
              {campaignData.designJson && (
                <p className="text-xs text-green-600">Ya editaste este email. Puedes editarlo de nuevo o continuar.</p>
              )}
              <Button variant="ghost" size="sm" onClick={() => setStep(3)} className="text-xs text-muted-foreground">
                Saltar y usar template original
              </Button>
            </div>
          )}

          {step === 3 && (
            <PreviewEditor
              brand={brand}
              campaignType={campaignData.type}
              campaignData={campaignData}
              onUpdate={handleUpdate}
              htmlContent={effectiveHtml}
            />
          )}

          {step === 4 && (
            <SchedulePublish
              clientId={clientId}
              brand={brand}
              campaignData={campaignData}
              htmlContent={effectiveHtml}
              onPublish={handlePublish}
            />
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between p-6 pt-0 border-t mt-2">
          <Button
            variant="ghost"
            onClick={step === 0 ? onClose : handleBack}
            disabled={publishing}
          >
            {step === 0 ? (
              'Cancelar'
            ) : (
              <>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Atrás
              </>
            )}
          </Button>

          {step < 4 && (
            <Button onClick={handleNext} disabled={!canAdvance}>
              {step === 2 ? 'Abrir editor' : 'Siguiente'}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>

      {/* GrapesJS fullscreen editor — rendered outside DialogContent */}
      {showGrapesEditor && (
        <GrapesStudioEmailEditor
          emails={[{
            subject: campaignData.subject,
            previewText: campaignData.previewText,
            htmlContent: campaignData.htmlContent || htmlContent,
            designJson: campaignData.designJson,
          }]}
          onSave={handleGrapesEditorSave}
          onCancel={handleGrapesEditorCancel}
          clientId={clientId}
          brandColor={brand.colors.primary}
        />
      )}
    </Dialog>
  );
}
