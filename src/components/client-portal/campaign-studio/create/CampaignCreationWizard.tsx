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
  collectionId: string;
  collectionName: string;
}

const STEP_LABELS = ['Tipo', 'Contenido', 'Preview', 'Programar'];

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
      subject: editCampaign.subject || template.defaultSubject,
      previewText: editCampaign.previewText || '',
      title: editCampaign.title || template.defaultTitle,
      introText: editCampaign.introText || template.defaultIntro,
      products: editCampaign.products || [],
      customBlocks: editCampaign.customBlocks || [],
      heroImageUrl: editCampaign.heroImageUrl || '',
      couponCode: editCampaign.couponCode || '',
      couponDescription: editCampaign.couponDescription || '',
      couponExpiry: editCampaign.couponExpiry || '',
      ctaText: editCampaign.ctaText || template.defaultCtaText,
      ctaUrl: editCampaign.ctaUrl || '',
      htmlContent: editCampaign.htmlContent || '',
      collectionId: editCampaign.collectionId || '',
      collectionName: editCampaign.collectionName || '',
    };
  }

  return {
    type,
    subject: template.defaultSubject,
    previewText: '',
    title: template.defaultTitle,
    introText: template.defaultIntro,
    products: [],
    customBlocks: [],
    heroImageUrl: '',
    couponCode: '',
    couponDescription: '',
    couponExpiry: '',
    ctaText: template.defaultCtaText,
    ctaUrl: '',
    htmlContent: '',
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
    const template = CAMPAIGN_TEMPLATES[type];
    setCampaignData(prev => ({
      ...prev,
      type,
      subject: template.defaultSubject,
      title: template.defaultTitle,
      introText: template.defaultIntro,
      ctaText: template.defaultCtaText,
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

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return !!campaignData.type;
      case 1:
        return !!campaignData.subject.trim() && !!campaignData.title.trim();
      case 2:
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  }, [step, campaignData]);

  const handleNext = useCallback(() => {
    if (step < 3 && canAdvance) {
      setStep(s => s + 1);
    }
  }, [step, canAdvance]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep(s => s - 1);
    }
  }, [step]);

  const handlePublish = useCallback((result: any) => {
    setPublishing(false);
    onCreated?.();
  }, [onCreated]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-lg font-semibold">
            {editCampaign ? 'Editar Campana' : 'Crear Campana'}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {CAMPAIGN_TEMPLATES[campaignData.type].label} — Paso {step + 1} de 4
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
            <PreviewEditor
              brand={brand}
              campaignType={campaignData.type}
              campaignData={campaignData}
              onUpdate={handleUpdate}
              htmlContent={htmlContent}
            />
          )}

          {step === 3 && (
            <SchedulePublish
              clientId={clientId}
              brand={brand}
              campaignData={campaignData}
              htmlContent={htmlContent}
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
                Atras
              </>
            )}
          </Button>

          {step < 3 && (
            <Button onClick={handleNext} disabled={!canAdvance}>
              Siguiente
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
