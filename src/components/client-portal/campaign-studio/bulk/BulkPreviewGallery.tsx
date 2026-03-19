import { useState } from 'react';
import { Monitor, Smartphone, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CAMPAIGN_TEMPLATES, CAMPAIGN_TYPE_COLORS, type CampaignType } from '../templates/TemplatePresets';

interface BulkCampaign {
  id: string;
  name: string;
  subject: string;
  campaignType: CampaignType;
  html: string;
  scheduledDate: string;
}

interface BulkPreviewGalleryProps {
  campaigns: BulkCampaign[];
}

export function BulkPreviewGallery({ campaigns }: BulkPreviewGalleryProps) {
  const [selectedId, setSelectedId] = useState<string>(campaigns[0]?.id || '');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  const selected = campaigns.find(c => c.id === selectedId);

  if (!campaigns.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay campañas para previsualizar.
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[500px]">
      {/* Campaign list sidebar */}
      <div className="w-56 flex-shrink-0 overflow-y-auto border rounded-lg">
        {campaigns.map((c, idx) => {
          const color = CAMPAIGN_TYPE_COLORS[c.campaignType] || '#6b7280';
          const template = CAMPAIGN_TEMPLATES[c.campaignType];
          const isSelected = selectedId === c.id;

          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left p-3 border-b last:border-b-0 transition-colors ${
                isSelected ? 'bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs font-medium text-foreground truncate">{c.name}</span>
                {isSelected && <Check className="w-3 h-3 text-green-500 flex-shrink-0" />}
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{c.subject}</p>
              <div className="flex items-center gap-1 mt-1">
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{template?.label}</Badge>
                <span className="text-[9px] text-muted-foreground">{c.scheduledDate}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Preview area */}
      <div className="flex-1 flex flex-col">
        {/* Device toggle */}
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant={device === 'desktop' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDevice('desktop')}
          >
            <Monitor className="w-3.5 h-3.5 mr-1" /> Desktop
          </Button>
          <Button
            variant={device === 'mobile' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDevice('mobile')}
          >
            <Smartphone className="w-3.5 h-3.5 mr-1" /> Mobile
          </Button>
          {selected && (
            <span className="text-xs text-muted-foreground ml-2">
              Asunto: {selected.subject}
            </span>
          )}
        </div>

        {/* Preview iframe */}
        <div className="flex-1 border rounded-lg bg-muted/30 flex items-start justify-center overflow-hidden p-4">
          {selected?.html ? (
            <iframe
              srcDoc={selected.html}
              title="Preview"
              className="border-0 bg-white rounded shadow-sm"
              style={{
                width: device === 'desktop' ? '600px' : '375px',
                height: '100%',
                maxWidth: '100%',
              }}
              sandbox="allow-same-origin allow-scripts"
            />
          ) : (
            <div className="text-sm text-muted-foreground">Selecciona una campaña para previsualizar</div>
          )}
        </div>
      </div>
    </div>
  );
}
