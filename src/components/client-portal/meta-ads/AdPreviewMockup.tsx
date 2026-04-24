import { Button } from '@/components/ui/button';
import { ThumbsUp, MessageCircle, Share2 } from 'lucide-react';

interface AdPreviewMockupProps {
  imageUrl: string;
  primaryText: string;
  headline: string;
  description?: string;
  cta?: string;
  pageName?: string;
  pageImageUrl?: string;
  destinationUrl?: string;
  compact?: boolean;
}

const CTA_LABELS: Record<string, string> = {
  SHOP_NOW: 'Comprar',
  LEARN_MORE: 'Más información',
  SIGN_UP: 'Registrarse',
  SUBSCRIBE: 'Suscribirse',
  CONTACT_US: 'Contactar',
  GET_OFFER: 'Obtener oferta',
  BOOK_NOW: 'Reservar',
  DOWNLOAD: 'Descargar',
  APPLY_NOW: 'Postular',
  GET_QUOTE: 'Cotizar',
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url?.replace(/^https?:\/\//, '').split('/')[0] || '';
  }
}

export default function AdPreviewMockup({
  imageUrl,
  primaryText,
  headline,
  description,
  cta = 'SHOP_NOW',
  pageName = 'Tu Marca',
  pageImageUrl,
  destinationUrl,
  compact = false,
}: AdPreviewMockupProps) {
  const ctaLabel = CTA_LABELS[cta] || cta;
  const domain = destinationUrl ? extractDomain(destinationUrl) : '';

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden ${compact ? 'max-w-[280px]' : 'max-w-[400px]'}`}>
      {/* Page header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {pageImageUrl ? (
          <img src={pageImageUrl} alt="Página" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
            {pageName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-gray-900 truncate ${compact ? 'text-xs' : 'text-sm'}`}>{pageName}</p>
          <p className="text-[10px] text-gray-500">Publicidad · 🌐</p>
        </div>
      </div>

      {/* Primary text */}
      {primaryText && (
        <div className={`px-3 pb-2 ${compact ? 'text-xs' : 'text-sm'} text-gray-800`}>
          <p className={compact ? 'line-clamp-2' : 'line-clamp-4'}>
            {primaryText}
          </p>
        </div>
      )}

      {/* Creative — render <video> if the URL ends in a video extension,
          otherwise <img>. Without this the preview shows a broken image for
          video creatives (Veo output, uploaded mp4, etc.). */}
      <div className="w-full aspect-square bg-gray-100 relative overflow-hidden">
        {imageUrl ? (
          /\.(mp4|mov|webm|m4v)(\?|$)/i.test(imageUrl) ? (
            <video
              src={imageUrl}
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              onError={(e) => {
                (e.target as HTMLVideoElement).style.display = 'none';
              }}
            />
          ) : (
            <img
              src={imageUrl}
              alt="Ad creative"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '';
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">🖼️</div>
              <p className="text-xs">Vista previa de imagen</p>
            </div>
          </div>
        )}
      </div>

      {/* Link preview bar */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            {domain && (
              <p className="text-[10px] text-gray-500 uppercase truncate">{domain}</p>
            )}
            <p className={`font-semibold text-gray-900 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
              {headline || 'Título del anuncio'}
            </p>
            {description && !compact && (
              <p className="text-xs text-gray-500 truncate">{description}</p>
            )}
          </div>
          <Button
            size="sm"
            variant="default"
            className={`shrink-0 ${compact ? 'text-[10px] h-7 px-2' : 'text-xs h-8 px-3'}`}
            disabled
          >
            {ctaLabel}
          </Button>
        </div>
      </div>

      {/* Reactions bar */}
      {!compact && (
        <div className="px-3 py-1.5 border-t border-gray-100 flex items-center justify-between text-gray-500">
          <div className="flex items-center gap-1 text-xs">
            <span className="text-sm">👍❤️</span>
            <span>12</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span>3 comentarios</span>
            <span>1 compartido</span>
          </div>
        </div>
      )}
      {!compact && (
        <div className="px-3 py-1.5 border-t border-gray-100 flex items-center justify-around text-gray-500">
          <button className="flex items-center gap-1.5 text-xs hover:text-gray-700 py-1">
            <ThumbsUp className="w-3.5 h-3.5" /> Me gusta
          </button>
          <button className="flex items-center gap-1.5 text-xs hover:text-gray-700 py-1">
            <MessageCircle className="w-3.5 h-3.5" /> Comentar
          </button>
          <button className="flex items-center gap-1.5 text-xs hover:text-gray-700 py-1">
            <Share2 className="w-3.5 h-3.5" /> Compartir
          </button>
        </div>
      )}
    </div>
  );
}
