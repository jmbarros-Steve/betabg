import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, Eye, Layers, Sparkles, Megaphone, Paintbrush, Check,
} from 'lucide-react';
import { CAMPAIGN_TEMPLATES, CAMPAIGN_TYPE_LIST, type CampaignType } from '../templates/TemplatePresets';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp,
  Eye,
  Layers,
  Sparkles,
  Megaphone,
  Paintbrush,
};

const DATA_SOURCE_LABELS: Record<string, string> = {
  klaviyo_ordered: 'Klaviyo Orders',
  klaviyo_viewed: 'Klaviyo Views',
  shopify_collection: 'Shopify Collection',
  shopify_newest: 'Shopify Newest',
  manual: 'Manual',
};

interface TemplateSelectorProps {
  selectedType: CampaignType;
  onSelect: (type: CampaignType) => void;
}

export function TemplateSelector({ selectedType, onSelect }: TemplateSelectorProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-base">Tipo de Campaña</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Selecciona el tipo de email que quieres crear. Cada tipo tiene secciones y fuentes de datos optimizadas.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {CAMPAIGN_TYPE_LIST.map((type) => {
          const template = CAMPAIGN_TEMPLATES[type];
          const Icon = ICON_MAP[template.icon] || Sparkles;
          const isSelected = selectedType === type;

          return (
            <Card
              key={type}
              className={`cursor-pointer transition-all duration-200 hover:shadow-sm relative ${
                isSelected
                  ? 'ring-2 ring-primary border-primary'
                  : 'hover:border-primary/40'
              }`}
              onClick={() => onSelect(type)}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">{template.label}</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                    {template.description}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[9px] w-fit mt-auto">
                  {DATA_SOURCE_LABELS[template.dataSource] || template.dataSource}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
