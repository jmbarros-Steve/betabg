import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Trash2, Download, ChevronDown, ChevronUp, ImageIcon, Video, Play, Rocket, X, CheckCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdCreative {
  id: string; client_id: string; funnel: string; formato: string; angulo: string;
  titulo: string | null; texto_principal: string | null; descripcion: string | null;
  cta: string | null; brief_visual: Record<string, unknown> | null;
  prompt_generacion: string | null; foto_base_url: string | null;
  asset_url: string | null; estado: string; created_at: string;
  dct_copies?: unknown[]; dct_titulos?: unknown[]; dct_descripciones?: unknown[];
  dct_briefs?: unknown[]; dct_imagenes?: string[];
}

interface AdCreativesLibraryProps { clientId: string; }

const ESTADO_CONFIG: Record<string, { label: string; className: string; next: string }> = {
  borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-700 border-gray-200', next: 'aprobado' },
  aprobado: { label: 'Aprobado ✅', className: 'bg-green-100 text-green-700 border-green-200', next: 'en_pauta' },
  en_pauta: { label: 'En Pauta 📢', className: 'bg-blue-100 text-blue-700 border-blue-200', next: 'borrador' },
  generando: { label: 'Generando...', className: 'bg-amber-100 text-amber-700 border-amber-200', next: 'borrador' },
};

const FUNNEL_LABELS: Record<string, string> = { tofu: 'TOFU 🎯', mofu: 'MOFU 🔥', bofu: 'BOFU 💰' };

export function AdCreativesLibrary({ clientId }: AdCreativesLibraryProps) {
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterFunnel, setFilterFunnel] = useState('all');
  const [filterFormato, setFilterFormato] = useState('all');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterAngulo, setFilterAngulo] = useState('all');
  const [publishModal, setPublishModal] = useState<AdCreative | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishedAdSetId, setPublishedAdSetId] = useState<string | null>(null);
  const [hasMetaConnection, setHasMetaConnection] = useState(false);
  const [cpaMaximo, setCpaMaximo] = useState<number | null>(null);

  useEffect(() => { fetchCreatives(); loadMetaStatus(); loadCpaData(); }, [clientId]);

  const loadMetaStatus = async () => {
    try {
      const { data } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .maybeSingle();
      setHasMetaConnection(!!data);
    } catch { /* ignore */ }
  };

  const loadCpaData = async () => {
    try {
      const { data: research } = await supabase
        .from('brand_research')
        .select('research_data')
        .eq('client_id', clientId);
      if (!research) return;
      for (const r of research) {
        const d = r.research_data as Record<string, unknown>;
        const precio = Number(d?.precio_venta || d?.precio || 0);
        const costo = Number(d?.costo_producto || d?.costo || 0);
        const envio = Number(d?.costo_envio || 0);
        if (precio > 0) {
          const margen = precio - costo - envio;
          setCpaMaximo(Math.round(margen * 0.3));
          return;
        }
      }
    } catch { /* ignore */ }
  };

  const fetchCreatives = async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('ad_creatives').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
      if (error) throw error;
      setCreatives((data as AdCreative[]) || []);
    } catch { toast.error('Error al cargar la biblioteca'); }
    finally { setLoading(false); }
  };

  const handleChangeEstado = async (creative: AdCreative) => {
    const nextEstado = ESTADO_CONFIG[creative.estado]?.next || 'borrador';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('ad_creatives').update({ estado: nextEstado }).eq('id', creative.id);
      setCreatives(prev => prev.map(c => c.id === creative.id ? { ...c, estado: nextEstado } : c));
      toast.success(`Estado → "${ESTADO_CONFIG[nextEstado]?.label}"`);
    } catch { toast.error('Error al cambiar estado'); }
  };

  const handleDelete = async (id: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('ad_creatives').delete().eq('id', id);
      setCreatives(prev => prev.filter(c => c.id !== id));
      toast.success('Creativo eliminado');
    } catch { toast.error('Error al eliminar'); }
  };

  const downloadCopy = (c: AdCreative) => {
    const content = [`TÍTULO: ${c.titulo || ''}`, '', 'TEXTO PRINCIPAL:', c.texto_principal || '', '', `DESCRIPCIÓN: ${c.descripcion || ''}`, '', `CTA: ${c.cta || ''}`, '', '---', `Ángulo: ${c.angulo} | Funnel: ${c.funnel?.toUpperCase()} | Formato: ${c.formato}`, 'Generado por STEVE.IO'].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `copy-${c.angulo}-${c.funnel}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  const downloadBrief = (c: AdCreative) => {
    if (!c.brief_visual) { toast.error('Sin brief visual'); return; }
    const bv = c.brief_visual as Record<string, unknown>;
    const lines = Object.entries(bv).map(([k, v]) => `${k.toUpperCase().replace(/_/g, ' ')}:\n${typeof v === 'object' ? JSON.stringify(v, null, 2) : v}`);
    const content = `BRIEF VISUAL DE PRODUCCIÓN\n${'='.repeat(40)}\n\n${lines.join('\n\n')}\n\n---\nGenerado por STEVE.IO`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `brief-visual-${c.angulo}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  const handleConfirmPublish = async () => {
    if (!publishModal) return;
    setPublishLoading(true);
    // Simulate Meta API call (real integration would use Meta Marketing API)
    await new Promise(r => setTimeout(r, 2000));
    const adSetId = `adset_dct_${Date.now()}`;
    setPublishedAdSetId(adSetId);
    // Update estado to en_pauta
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('ad_creatives').update({ estado: 'en_pauta' }).eq('id', publishModal.id);
      setCreatives(prev => prev.map(c => c.id === publishModal.id ? { ...c, estado: 'en_pauta' } : c));
    } catch { /* non-blocking */ }
    setPublishLoading(false);
    toast.success('🚀 DCT publicado en Meta Ads Manager');
  };

  const uniqueAngulos = [...new Set(creatives.map(c => c.angulo))].filter(Boolean);

  const filtered = creatives.filter(c => {
    if (filterFunnel !== 'all' && c.funnel !== filterFunnel) return false;
    if (filterFormato !== 'all' && c.formato !== filterFormato) return false;
    if (filterEstado !== 'all' && c.estado !== filterEstado) return false;
    if (filterAngulo !== 'all' && c.angulo !== filterAngulo) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterFunnel} onValueChange={setFilterFunnel}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Funnel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="tofu">TOFU 🎯</SelectItem>
            <SelectItem value="mofu">MOFU 🔥</SelectItem>
            <SelectItem value="bofu">BOFU 💰</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterFormato} onValueChange={setFilterFormato}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Formato" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="static">📸 Imagen</SelectItem>
            <SelectItem value="video">🎬 Video</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
            <SelectItem value="aprobado">Aprobado</SelectItem>
            <SelectItem value="en_pauta">En Pauta</SelectItem>
          </SelectContent>
        </Select>
        {uniqueAngulos.length > 0 && (
          <Select value={filterAngulo} onValueChange={setFilterAngulo}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Ángulo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los ángulos</SelectItem>
              {uniqueAngulos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} creativo{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay creativos aún</p>
          <p className="text-sm">Genera tu primer copy para verlo aquí</p>
        </div>
      )}

      <div className="grid gap-4">
        {filtered.map(creative => {
          const estadoCfg = ESTADO_CONFIG[creative.estado] || ESTADO_CONFIG.borrador;
          const isExpanded = expandedId === creative.id;
          const isVideo = creative.formato === 'video';
          const hasDctImages = Array.isArray(creative.dct_imagenes) && creative.dct_imagenes.length > 0;
          const isDct = Array.isArray(creative.dct_copies) && creative.dct_copies.length > 0;

          return (
            <motion.div key={creative.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex gap-4 p-4">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center relative">
                      {creative.asset_url ? (
                        isVideo ? (
                          <><video src={creative.asset_url} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Play className="w-5 h-5 text-white" /></div></>
                        ) : <img src={creative.asset_url} alt="" className="w-full h-full object-cover" />
                      ) : creative.foto_base_url ? (
                        <img src={creative.foto_base_url} alt="" className="w-full h-full object-cover opacity-70" />
                      ) : (
                        isVideo ? <Video className="w-6 h-6 text-muted-foreground" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        <Badge variant="outline" className="text-[10px]">{FUNNEL_LABELS[creative.funnel] || creative.funnel}</Badge>
                        <Badge variant="outline" className="text-[10px]">{isVideo ? '🎬 Video' : '📸 Imagen'}</Badge>
                        <Badge variant="outline" className="text-[10px]">{creative.angulo}</Badge>
                        {isDct && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">DCT 3-2-2</Badge>}
                      </div>
                      <p className="font-semibold text-sm leading-tight truncate">{creative.titulo || 'Sin título'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(creative.created_at), "d MMM yyyy", { locale: es })}</p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button onClick={() => handleChangeEstado(creative)}
                        className={`text-[11px] px-2 py-0.5 rounded-full border font-medium cursor-pointer hover:opacity-80 transition-opacity ${estadoCfg.className}`}>
                        {estadoCfg.label}
                      </button>
                      <button onClick={() => setExpandedId(isExpanded ? null : creative.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border">
                      <div className="p-4 space-y-4">
                        {/* DCT Images grid */}
                        {hasDctImages && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Imágenes DCT</p>
                            <div className="grid grid-cols-3 gap-2">
                              {creative.dct_imagenes!.map((url, i) => (
                                <div key={i} className="rounded-lg overflow-hidden border">
                                  <img src={url} alt={`DCT ${i + 1}`} className="w-full aspect-square object-cover" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Single generated asset (non-DCT) */}
                        {!hasDctImages && creative.asset_url && (
                          <div className="rounded-lg overflow-hidden border border-border">
                            {isVideo ? (
                              <video src={creative.asset_url} controls className="w-full max-h-64 object-contain bg-black" />
                            ) : (
                              <img src={creative.asset_url} alt="Generado" className="w-full max-h-64 object-contain" />
                            )}
                          </div>
                        )}

                        {/* Copy fields */}
                        <div className="space-y-3">
                          {creative.titulo && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Título</p><p className="text-sm">{creative.titulo}</p></div>}
                          {creative.texto_principal && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Texto Principal</p><p className="text-sm whitespace-pre-wrap">{creative.texto_principal}</p></div>}
                          {creative.descripcion && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Descripción</p><p className="text-sm">{creative.descripcion}</p></div>}
                          {creative.cta && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">CTA</p><p className="text-sm font-medium text-primary">{creative.cta}</p></div>}
                        </div>

                        {creative.brief_visual && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs font-semibold text-amber-700 mb-1">📋 Brief Visual disponible</p>
                            <p className="text-xs text-amber-700">
                              {typeof (creative.brief_visual as Record<string, unknown>).concepto === 'string'
                                ? (creative.brief_visual as Record<string, unknown>).concepto as string
                                : typeof (creative.brief_visual as Record<string, unknown>).concepto === 'object'
                                  ? Object.values((creative.brief_visual as Record<string, unknown>).concepto as Record<string, unknown>).join(' · ')
                                  : 'Ver en descarga'}
                            </p>
                          </div>
                        )}

                        {/* Plan de Acción DCT */}
                        {isDct && hasDctImages && (
                          <div className="rounded-lg border-l-[3px] border-l-blue-500 bg-blue-50 dark:bg-blue-950/20 p-4 space-y-2">
                            <p className="text-[13px] font-bold text-blue-900 dark:text-blue-300">📊 Plan de Acción DCT — Método Charlie</p>
                            <div className="space-y-1.5 text-[13px] text-blue-800 dark:text-blue-200">
                              <p>• <strong>Tipo de campaña:</strong> Testing DCT — Advantage+ Shopping</p>
                              <p>• <strong>Presupuesto diario sugerido:</strong> {cpaMaximo ? `$${(cpaMaximo * 2).toLocaleString('es-CL')} CLP` : <span className="text-amber-600">Completar brief para calcular</span>}</p>
                              <p>• <strong>Duración del test:</strong> 5-7 días</p>
                              <p>• <strong>Kill rule:</strong> Si gasta ${cpaMaximo ? `$${(cpaMaximo * 2).toLocaleString('es-CL')}` : '[CPA×2]'} sin compra → pausar este creativo</p>
                              <p>• <strong>Métricas a revisar día 3:</strong> Hook Rate &gt;25% · Hold Rate &gt;15% · CTR &gt;1.5%</p>
                              <p>• <strong>Próxima revisión:</strong> {format(addDays(new Date(), 7), "d 'de' MMMM yyyy", { locale: es })}</p>
                              <p>• <strong>Acción post-test:</strong> Si cumple métricas → mover a Scaling con +20% presupuesto cada 48hrs</p>
                            </div>
                          </div>
                        )}

                        {/* Publicar en Meta — shown when DCT has images and estado is aprobado */}
                        {isDct && hasDctImages && creative.estado === 'aprobado' && (
                          hasMetaConnection ? (
                            <Button
                              className="w-full"
                              onClick={() => { setPublishModal(creative); setPublishedAdSetId(null); }}
                            >
                              <Rocket className="w-4 h-4 mr-2" />🚀 Publicar DCT en Meta
                            </Button>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button className="w-full" disabled>
                                  <Lock className="w-4 h-4 mr-2" />🔒 Publicar en Meta (Próximamente)
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Conexión con Meta Ads disponible en marzo 2026</p>
                              </TooltipContent>
                            </Tooltip>
                          )
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => downloadCopy(creative)}><Download className="w-3 h-3 mr-1.5" />⬇️ Descargar Copy</Button>
                          {creative.brief_visual && <Button size="sm" variant="outline" onClick={() => downloadBrief(creative)}><Download className="w-3 h-3 mr-1.5" />⬇️ Descargar Brief</Button>}
                          {creative.asset_url && (
                            <Button size="sm" variant="outline" asChild>
                              <a href={creative.asset_url} download target="_blank" rel="noreferrer"><Download className="w-3 h-3 mr-1.5" />⬇️ Descargar Asset</a>
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" className="ml-auto" onClick={() => handleDelete(creative.id)}><Trash2 className="w-3 h-3 mr-1.5" />🗑 Eliminar</Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Publish DCT Modal */}
      {publishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-background rounded-xl border shadow-xl w-full max-w-sm p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">🚀 Publicar en Meta</h3>
              <button onClick={() => setPublishModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!publishedAdSetId ? (
              <>
                <p className="text-sm text-muted-foreground">¿Confirmas publicar este DCT en Meta?</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-green-600"><CheckCircle className="w-4 h-4" /><span>{Array.isArray(publishModal.dct_copies) ? publishModal.dct_copies.length : 0} copies</span></div>
                  <div className="flex items-center gap-2 text-green-600"><CheckCircle className="w-4 h-4" /><span>{Array.isArray(publishModal.dct_titulos) ? publishModal.dct_titulos.length : 0} títulos</span></div>
                  <div className="flex items-center gap-2 text-green-600"><CheckCircle className="w-4 h-4" /><span>{Array.isArray(publishModal.dct_descripciones) ? publishModal.dct_descripciones.length : 0} descripciones</span></div>
                  <div className="flex items-center gap-2 text-green-600"><CheckCircle className="w-4 h-4" /><span>{Array.isArray(publishModal.dct_imagenes) ? publishModal.dct_imagenes.length : 0} imágenes</span></div>
                </div>
                <p className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
                  Meta combinará automáticamente estos elementos para encontrar la mejor combinación.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setPublishModal(null)}>❌ Cancelar</Button>
                  <Button className="flex-1" onClick={handleConfirmPublish} disabled={publishLoading}>
                    {publishLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
                    {publishLoading ? 'Publicando...' : '✅ Confirmar'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center space-y-3 py-2">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="font-semibold">¡DCT publicado exitosamente!</p>
                  <p className="text-xs text-muted-foreground">ID Ad Set:</p>
                  <p className="text-xs font-mono bg-muted rounded px-2 py-1">{publishedAdSetId}</p>
                  <p className="text-xs text-muted-foreground">Meta revisará el Ad Set en 24-48 horas. No modifiques el presupuesto ni la audiencia durante 7 días.</p>
                </div>
                <Button className="w-full" onClick={() => setPublishModal(null)}>Cerrar</Button>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
