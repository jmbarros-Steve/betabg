import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, Smartphone, RefreshCw } from 'lucide-react';
import type { CampaignType } from '../templates/TemplatePresets';
import { CAMPAIGN_TEMPLATES } from '../templates/TemplatePresets';
import type { BrandIdentity } from '../templates/BrandHtmlGenerator';
import type { CampaignData } from './CampaignCreationWizard';

interface PreviewEditorProps {
  brand: BrandIdentity;
  campaignType: CampaignType;
  campaignData: CampaignData;
  onUpdate: (data: Partial<CampaignData>) => void;
  htmlContent: string;
}

export function PreviewEditor({
  brand,
  campaignType,
  campaignData,
  onUpdate,
  htmlContent,
}: PreviewEditorProps) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const template = CAMPAIGN_TEMPLATES[campaignType];

  // Update the stored HTML content whenever it changes — but only if user hasn't edited via GrapesJS
  useEffect(() => {
    if (htmlContent && htmlContent !== campaignData.htmlContent && !campaignData.designJson) {
      onUpdate({ htmlContent });
    }
  }, [htmlContent]);

  const previewWidth = device === 'desktop' ? 600 : 375;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Vista Previa</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Asi se vera tu email de "{template.label}" en la bandeja de entrada.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onUpdate({ htmlContent: '', designJson: null })}
          className="flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Regenerar
        </Button>
      </div>

      {/* Subject and preview text display */}
      <div className="border rounded-lg p-3 bg-muted/30 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Asunto:</span>
          <span className="text-sm font-medium truncate">{campaignData.subject || '(sin asunto)'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Preview:</span>
          <span className="text-sm text-muted-foreground truncate">
            {campaignData.previewText || '(sin texto de vista previa)'}
          </span>
        </div>
      </div>

      {/* Device toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={device === 'desktop' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDevice('desktop')}
          className="flex items-center gap-1.5"
        >
          <Monitor className="w-4 h-4" />
          Desktop
        </Button>
        <Button
          variant={device === 'mobile' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDevice('mobile')}
          className="flex items-center gap-1.5"
        >
          <Smartphone className="w-4 h-4" />
          Mobile
        </Button>
        <Badge variant="secondary" className="text-[10px] ml-auto">
          {previewWidth}px
        </Badge>
      </div>

      {/* Email preview iframe */}
      <div
        className="border rounded-lg overflow-hidden bg-white mx-auto transition-all duration-300"
        style={{ maxWidth: previewWidth }}
      >
        <div className="bg-muted/50 px-3 py-1.5 border-b flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            {device === 'desktop' ? 'gmail.com' : 'Mail App'}
          </span>
        </div>

        {htmlContent ? (
          <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            className="w-full border-0"
            sandbox="allow-same-origin allow-scripts"
            title="Email preview"
            style={{ height: '500px', minHeight: '400px' }}
          />
        ) : (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground text-sm">
            Generando preview...
          </div>
        )}
      </div>

      {/* Brand info footer */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground justify-center">
        <span>
          Font: {brand.fonts.heading} / {brand.fonts.body}
        </span>
        <span className="flex items-center gap-1">
          Color:
          <span
            className="inline-block w-3 h-3 rounded-full border"
            style={{ backgroundColor: brand.colors.primary }}
          />
          <span
            className="inline-block w-3 h-3 rounded-full border"
            style={{ backgroundColor: brand.colors.accent }}
          />
        </span>
        <span>
          Botones: {brand.buttons.style} ({brand.buttons.borderRadius}px)
        </span>
      </div>
    </div>
  );
}
