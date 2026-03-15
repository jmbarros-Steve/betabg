import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Loader2,
  MousePointerClick,
  ExternalLink,
  BarChart3,
  Layers,
  List,
} from 'lucide-react';

interface LinkData {
  url: string;
  link_text: string;
  clicks: number;
  unique_clicks: number;
  percentage: number;
}

interface ClickHeatmapPanelProps {
  campaignId: string;
  clientId: string;
  htmlContent: string;
}

type HeatLevel = 'hot' | 'warm' | 'mild' | 'cold';

function getHeatLevel(percentage: number, maxPercentage: number): HeatLevel {
  if (maxPercentage === 0) return 'cold';
  const ratio = percentage / maxPercentage;
  if (ratio >= 0.8) return 'hot';
  if (ratio >= 0.5) return 'warm';
  if (ratio >= 0.2) return 'mild';
  return 'cold';
}

const heatColors: Record<HeatLevel, { bg: string; border: string; text: string; badge: string; overlay: string }> = {
  hot:  { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', badge: 'bg-red-500 text-white', overlay: 'rgba(239, 68, 68, 0.35)' },
  warm: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', badge: 'bg-orange-500 text-white', overlay: 'rgba(249, 115, 22, 0.30)' },
  mild: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', badge: 'bg-yellow-500 text-white', overlay: 'rgba(234, 179, 8, 0.25)' },
  cold: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', badge: 'bg-blue-500 text-white', overlay: 'rgba(59, 130, 246, 0.20)' },
};

const heatLabels: Record<HeatLevel, string> = {
  hot: 'Caliente',
  warm: 'Tibio',
  mild: 'Moderado',
  cold: 'Frío',
};

function truncateUrl(url: string, maxLen = 50): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > maxLen ? display.slice(0, maxLen) + '...' : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + '...' : url;
  }
}

export function ClickHeatmapPanel({ campaignId, clientId, htmlContent }: ClickHeatmapPanelProps) {
  const [links, setLinks] = useState<LinkData[]>([]);
  const [totalClicks, setTotalClicks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<string>('overlay');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadHeatmap = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<{ heatmap: LinkData[]; total_clicks: number }>(
        'email-campaign-analytics',
        { body: { action: 'click_heatmap', client_id: clientId, campaign_id: campaignId } }
      );
      if (error) {
        toast.error(error);
        return;
      }
      setLinks(data?.heatmap || []);
      setTotalClicks(data?.total_clicks || 0);
    } finally {
      setLoading(false);
    }
  }, [campaignId, clientId]);

  useEffect(() => {
    loadHeatmap();
  }, [loadHeatmap]);

  // Build a URL -> heat map for the overlay
  const maxPercentage = links.length > 0 ? links[0].percentage : 0;
  const urlHeatMap = new Map<string, { level: HeatLevel; clicks: number; percentage: number }>();
  for (const link of links) {
    const level = getHeatLevel(link.percentage, maxPercentage);
    urlHeatMap.set(link.url, { level, clicks: link.clicks, percentage: link.percentage });
  }

  // Inject overlay styles into email HTML
  const buildOverlayHtml = useCallback(() => {
    if (!htmlContent) return '';

    // Build CSS for link overlays
    const styleBlock = `
      <style>
        a[href] { position: relative !important; display: inline-block !important; }
        .steve-heat-overlay {
          position: absolute !important;
          top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
          pointer-events: none !important;
          z-index: 1000 !important;
          border-radius: 3px !important;
          transition: opacity 0.2s ease !important;
        }
        .steve-heat-badge {
          position: absolute !important;
          top: -8px !important; right: -8px !important;
          background: #111 !important;
          color: #fff !important;
          font-size: 10px !important;
          font-family: system-ui, sans-serif !important;
          padding: 2px 6px !important;
          border-radius: 10px !important;
          z-index: 1001 !important;
          pointer-events: none !important;
          white-space: nowrap !important;
          line-height: 1.4 !important;
        }
      </style>
    `;

    // Parse and inject overlays into anchors
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const anchors = doc.querySelectorAll('a[href]');

    anchors.forEach((a) => {
      const href = a.getAttribute('href');
      if (!href) return;

      // Try to match against tracked URLs
      const info = urlHeatMap.get(href);
      if (!info) return;

      const colors = heatColors[info.level];

      // Make the anchor a positioning context
      (a as HTMLElement).style.position = 'relative';
      (a as HTMLElement).style.display = 'inline-block';

      // Create overlay div
      const overlay = doc.createElement('div');
      overlay.className = 'steve-heat-overlay';
      overlay.style.backgroundColor = colors.overlay;
      a.appendChild(overlay);

      // Create badge
      const badge = doc.createElement('div');
      badge.className = 'steve-heat-badge';
      badge.textContent = `${info.clicks} clicks`;
      a.appendChild(badge);
    });

    // Disable all link navigation in the iframe
    const scriptBlock = `
      <script>
        document.addEventListener('click', function(e) {
          var a = e.target.closest('a');
          if (a) { e.preventDefault(); e.stopPropagation(); }
        }, true);
      </script>
    `;

    const headClose = doc.querySelector('head');
    if (headClose) {
      headClose.insertAdjacentHTML('beforeend', styleBlock);
    } else {
      // No head, prepend styles
      doc.documentElement.insertAdjacentHTML('afterbegin', styleBlock);
    }
    doc.body.insertAdjacentHTML('beforeend', scriptBlock);

    return doc.documentElement.outerHTML;
  }, [htmlContent, urlHeatMap]);

  // Write to iframe when overlay view is active
  useEffect(() => {
    if (view !== 'overlay' || loading || !iframeRef.current) return;
    const overlayHtml = buildOverlayHtml();
    const iframeDoc = iframeRef.current.contentDocument;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(overlayHtml);
      iframeDoc.close();
    }
  }, [view, loading, buildOverlayHtml]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (links.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <MousePointerClick className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground text-sm max-w-xs">
            No se han registrado clicks en esta campana. Los datos aparecen una vez que los suscriptores interactuan con los enlaces.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MousePointerClick className="w-4 h-4" />
            Mapa de calor de clicks
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {totalClicks} clicks totales
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="mb-4">
            <TabsTrigger value="overlay" className="gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Vista previa
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5">
              <List className="w-3.5 h-3.5" />
              Lista de enlaces
            </TabsTrigger>
          </TabsList>

          {/* Overlay view: email preview with heatmap */}
          <TabsContent value="overlay">
            <div className="flex gap-4 flex-col lg:flex-row">
              {/* Email preview iframe */}
              <div className="flex-1 border rounded-lg overflow-hidden bg-white">
                <iframe
                  ref={iframeRef}
                  title="Email heatmap"
                  className="w-full border-0"
                  style={{ minHeight: 500, height: 600 }}
                  sandbox="allow-same-origin"
                />
              </div>

              {/* Side legend */}
              <div className="lg:w-64 shrink-0 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Leyenda</p>
                <div className="space-y-2">
                  {(['hot', 'warm', 'mild', 'cold'] as HeatLevel[]).map((level) => (
                    <div key={level} className={`flex items-center gap-2 px-3 py-2 rounded-md ${heatColors[level].bg} border ${heatColors[level].border}`}>
                      <div
                        className="w-4 h-4 rounded-sm shrink-0"
                        style={{ backgroundColor: heatColors[level].overlay.replace(/[\d.]+\)$/, '1)') }}
                      />
                      <span className={`text-xs font-medium ${heatColors[level].text}`}>
                        {heatLabels[level]}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Top links mini list */}
                <div className="pt-3 border-t">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Top enlaces</p>
                  <div className="space-y-1.5">
                    {links.slice(0, 5).map((link, i) => {
                      const level = getHeatLevel(link.percentage, maxPercentage);
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${heatColors[level].badge}`}>
                            {i + 1}
                          </span>
                          <span className="truncate flex-1 text-muted-foreground" title={link.url}>
                            {truncateUrl(link.url, 25)}
                          </span>
                          <span className="font-semibold tabular-nums">{link.clicks}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* List view: detailed link table */}
          <TabsContent value="list">
            <div className="space-y-2">
              {links.map((link, i) => {
                const level = getHeatLevel(link.percentage, maxPercentage);
                const colors = heatColors[level];
                const barWidth = maxPercentage > 0 ? (link.percentage / maxPercentage) * 100 : 0;

                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${colors.border} ${colors.bg} transition-colors`}
                  >
                    {/* Rank */}
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${colors.badge}`}>
                      {i + 1}
                    </span>

                    {/* Link info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {link.link_text && (
                          <span className="text-sm font-medium truncate">{link.link_text}</span>
                        )}
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`text-xs ${colors.text} hover:underline flex items-center gap-0.5 truncate`}
                          title={link.url}
                        >
                          {truncateUrl(link.url)}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>

                      {/* Bar chart */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 bg-white/70 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: colors.overlay.replace(/[\d.]+\)$/, '0.8)'),
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold tabular-nums w-12 text-right">
                          {link.percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Click stats */}
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-bold tabular-nums ${colors.text}`}>{link.clicks}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {link.unique_clicks} unicos
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="mt-4 flex items-center gap-4 px-3 py-2.5 bg-muted/50 rounded-lg text-sm">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Total clicks:</span>
              <span className="font-semibold">{totalClicks}</span>
              <span className="text-muted-foreground mx-1">|</span>
              <span className="text-muted-foreground">Enlaces rastreados:</span>
              <span className="font-semibold">{links.length}</span>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
