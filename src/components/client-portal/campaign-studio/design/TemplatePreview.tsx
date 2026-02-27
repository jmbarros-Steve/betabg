import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, Smartphone } from 'lucide-react';
import { generateBrandEmail, type BrandIdentity, type ProductItem } from '../templates/BrandHtmlGenerator';

interface TemplatePreviewProps {
  brand: BrandIdentity;
  title?: string;
  introText?: string;
  heroImageUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
  products?: ProductItem[];
}

const SAMPLE_SECTIONS = [
  { type: 'header' as const },
  { type: 'hero_image' as const },
  { type: 'title' as const },
  { type: 'intro' as const },
  { type: 'product_grid' as const, props: { limit: 3, layout: 'grid_3x1', showPrice: true, showButton: true } },
  { type: 'cta' as const },
  { type: 'spacer' as const, props: { height: 8 } },
  { type: 'farewell' as const },
  { type: 'social' as const },
  { type: 'footer' as const },
];

export function TemplatePreview({
  brand,
  title,
  introText,
  heroImageUrl,
  ctaText,
  ctaUrl,
  products,
}: TemplatePreviewProps) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  const html = useMemo(() => {
    return generateBrandEmail({
      brand,
      sections: SAMPLE_SECTIONS,
      title: title || 'Tu titulo va aqui',
      introText: introText || 'Este es un texto de ejemplo para que veas como se ve tu template.',
      heroImageUrl: heroImageUrl || '',
      ctaText: ctaText || 'Boton de ejemplo',
      ctaUrl: ctaUrl || brand.shopUrl || '#',
      products: products,
      previewText: 'Vista previa de tu email',
    });
  }, [brand, title, introText, heroImageUrl, ctaText, ctaUrl, products]);

  const width = device === 'desktop' ? 600 : 375;

  return (
    <div className="space-y-4">
      {/* ---------- Device toggle bar ---------- */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest select-none">
          Preview
        </span>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={`
                h-8 px-3 text-xs font-medium rounded-md transition-all duration-200
                ${device === 'desktop'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
              onClick={() => setDevice('desktop')}
            >
              <Monitor className="w-4 h-4 mr-1.5" />
              Desktop
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`
                h-8 px-3 text-xs font-medium rounded-md transition-all duration-200
                ${device === 'mobile'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
              onClick={() => setDevice('mobile')}
            >
              <Smartphone className="w-4 h-4 mr-1.5" />
              Mobile
            </Button>
          </div>

          <Badge
            variant="secondary"
            className="text-[10px] font-mono tabular-nums px-2 py-0.5 select-none"
          >
            {width}px
          </Badge>
        </div>
      </div>

      {/* ---------- Browser chrome + iframe ---------- */}
      <div
        className="mx-auto transition-all duration-500 ease-in-out"
        style={{ maxWidth: width }}
      >
        <div className="rounded-xl border border-border/60 bg-white shadow-lg overflow-hidden">
          {/* --- Chrome title bar --- */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 select-none"
            style={{
              background: 'linear-gradient(to bottom, #f7f7f8, #ededef)',
              borderBottom: '1px solid #e0e0e3',
            }}
          >
            {/* Traffic lights */}
            <div className="flex items-center gap-[7px] shrink-0">
              <span
                className="block w-[13px] h-[13px] rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #ff6058 0%, #e0443e 100%)',
                  boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.12), 0 0.5px 0.5px rgba(0,0,0,0.06)',
                }}
              />
              <span
                className="block w-[13px] h-[13px] rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #ffc130 0%, #dea123 100%)',
                  boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.12), 0 0.5px 0.5px rgba(0,0,0,0.06)',
                }}
              />
              <span
                className="block w-[13px] h-[13px] rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #27ca40 0%, #1aad30 100%)',
                  boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.12), 0 0.5px 0.5px rgba(0,0,0,0.06)',
                }}
              />
            </div>

            {/* URL bar */}
            <div className="flex-1 flex justify-center">
              <div
                className="flex items-center gap-1.5 rounded-md px-4 py-1"
                style={{
                  background: '#ffffff',
                  border: '1px solid #d5d5d8',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                  minWidth: 180,
                  maxWidth: 320,
                  width: '60%',
                }}
              >
                {/* Lock icon */}
                <svg
                  width="10"
                  height="12"
                  viewBox="0 0 10 12"
                  fill="none"
                  style={{ flexShrink: 0 }}
                >
                  <rect
                    x="0.5"
                    y="4.5"
                    width="9"
                    height="7"
                    rx="1.5"
                    fill="#8e8e93"
                    opacity="0.35"
                    stroke="#8e8e93"
                    strokeWidth="0.6"
                  />
                  <path
                    d="M2.5 4.5V3.5C2.5 2.12 3.62 1 5 1C6.38 1 7.5 2.12 7.5 3.5V4.5"
                    stroke="#8e8e93"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                <span
                  className="text-[11px] font-normal tracking-tight truncate"
                  style={{ color: '#636366' }}
                >
                  {device === 'desktop' ? 'mail.google.com' : 'Mail App'}
                </span>
              </div>
            </div>

            {/* Spacer to balance traffic lights */}
            <div className="w-[55px] shrink-0" />
          </div>

          {/* --- Email content iframe --- */}
          <iframe
            srcDoc={html}
            className="w-full border-0"
            sandbox="allow-same-origin"
            title="Template preview"
            style={{ minHeight: 700, height: 'auto', display: 'block' }}
          />
        </div>
      </div>
    </div>
  );
}
