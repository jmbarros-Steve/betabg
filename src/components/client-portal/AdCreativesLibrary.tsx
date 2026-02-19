import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Trash2, Download, ChevronDown, ChevronUp, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdCreative {
  id: string;
  client_id: string;
  funnel: string;
  formato: string;
  angulo: string;
  titulo: string | null;
  texto_principal: string | null;
  descripcion: string | null;
  cta: string | null;
  brief_visual: Record<string, unknown> | null;
  prompt_generacion: string | null;
  foto_base_url: string | null;
  asset_url: string | null;
  estado: string;
  created_at: string;
}

interface AdCreativesLibraryProps {
  clientId: string;
}

const ESTADO_CONFIG: Record<string, { label: string; className: string; next: string }> = {
  borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-700 border-gray-200', next: 'aprobado' },
  aprobado: { label: 'Aprobado', className: 'bg-green-100 text-green-700 border-green-200', next: 'en_pauta' },
  en_pauta: { label: 'En Pauta', className: 'bg-blue-100 text-blue-700 border-blue-200', next: 'borrador' },
};

const FUNNEL_LABELS: Record<string, string> = {
  tofu: 'TOFU 🎯',
  mofu: 'MOFU 🔥',
  bofu: 'BOFU 💰',
};

export function AdCreativesLibrary({ clientId }: AdCreativesLibraryProps) {
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterFunnel, setFilterFunnel] = useState('all');
  const [filterFormato, setFilterFormato] = useState('all');
  const [filterEstado, setFilterEstado] = useState('all');

  useEffect(() => {
    fetchCreatives();
  }, [clientId]);

  const fetchCreatives = async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ad_creatives')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCreatives((data as AdCreative[]) || []);
    } catch (err) {
      toast.error('Error al cargar la biblioteca');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEstado = async (creative: AdCreative) => {
    const nextEstado = ESTADO_CONFIG[creative.estado]?.next || 'borrador';
    try {
      await (supabase as any).from('ad_creatives').update({ estado: nextEstado }).eq('id', creative.id);
      setCreatives(prev => prev.map(c => c.id === creative.id ? { ...c, estado: nextEstado } : c));
      toast.success(`Estado actualizado a "${ESTADO_CONFIG[nextEstado]?.label}"`);
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await (supabase as any).from('ad_creatives').delete().eq('id', id);
      setCreatives(prev => prev.filter(c => c.id !== id));
      toast.success('Creativo eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const downloadCopy = (c: AdCreative) => {
    const content = [
      `TÍTULO: ${c.titulo || ''}`,
      ``,
      `TEXTO PRINCIPAL:`,
      c.texto_principal || '',
      ``,
      `DESCRIPCIÓN: ${c.descripcion || ''}`,
      ``,
      `CTA: ${c.cta || ''}`,
      ``,
      `---`,
      `Ángulo: ${c.angulo} | Funnel: ${c.funnel?.toUpperCase()} | Formato: ${c.formato}`,
      `Generado por STEVE.IO`,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `copy-${c.angulo}-${c.funnel}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBrief = (c: AdCreative) => {
    if (!c.brief_visual) { toast.error('Sin brief visual'); return; }
    const bv = c.brief_visual as Record<string, unknown>;
    const lines = Object.entries(bv).map(([k, v]) =>
      `${k.toUpperCase().replace(/_/g, ' ')}:\n${typeof v === 'object' ? JSON.stringify(v, null, 2) : v}`
    );
    const content = `BRIEF VISUAL DE PRODUCCIÓN\n${'='.repeat(40)}\n\n${lines.join('\n\n')}\n\n---\nGenerado por STEVE.IO`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brief-visual-${c.angulo}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = creatives.filter(c => {
    if (filterFunnel !== 'all' && c.funnel !== filterFunnel) return false;
    if (filterFormato !== 'all' && c.formato !== filterFormato) return false;
    if (filterEstado !== 'all' && c.estado !== filterEstado) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterFunnel} onValueChange={setFilterFunnel}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Funnel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los funnels</SelectItem>
            <SelectItem value="tofu">TOFU</SelectItem>
            <SelectItem value="mofu">MOFU</SelectItem>
            <SelectItem value="bofu">BOFU</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterFormato} onValueChange={setFilterFormato}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Formato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los formatos</SelectItem>
            <SelectItem value="static">Imagen</SelectItem>
            <SelectItem value="video">Video</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
            <SelectItem value="aprobado">Aprobado</SelectItem>
            <SelectItem value="en_pauta">En Pauta</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground self-center ml-auto">
          {filtered.length} creativo{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay creativos aún</p>
          <p className="text-sm">Genera tu primer copy para verlo aquí</p>
        </div>
      )}

      {/* Grid */}
      <div className="grid gap-4">
        {filtered.map(creative => {
          const estadoCfg = ESTADO_CONFIG[creative.estado] || ESTADO_CONFIG.borrador;
          const isExpanded = expandedId === creative.id;

          return (
            <motion.div
              key={creative.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex gap-4 p-4">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {creative.foto_base_url ? (
                        <img src={creative.foto_base_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        <Badge variant="outline" className="text-[10px]">{FUNNEL_LABELS[creative.funnel] || creative.funnel}</Badge>
                        <Badge variant="outline" className="text-[10px]">{creative.formato === 'video' ? '🎬 Video' : '📸 Imagen'}</Badge>
                        <Badge variant="outline" className="text-[10px]">{creative.angulo}</Badge>
                      </div>
                      <p className="font-semibold text-sm leading-tight truncate">{creative.titulo || 'Sin título'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(creative.created_at), "d MMM yyyy", { locale: es })}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        onClick={() => handleChangeEstado(creative)}
                        className={`text-[11px] px-2 py-0.5 rounded-full border font-medium cursor-pointer hover:opacity-80 transition-opacity ${estadoCfg.className}`}
                      >
                        {estadoCfg.label}
                      </button>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : creative.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border"
                    >
                      <div className="p-4 space-y-4">
                        {/* Copy fields */}
                        <div className="space-y-3">
                          {creative.titulo && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Título</p>
                              <p className="text-sm">{creative.titulo}</p>
                            </div>
                          )}
                          {creative.texto_principal && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Texto Principal</p>
                              <p className="text-sm whitespace-pre-wrap">{creative.texto_principal}</p>
                            </div>
                          )}
                          {creative.descripcion && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Descripción</p>
                              <p className="text-sm">{creative.descripcion}</p>
                            </div>
                          )}
                          {creative.cta && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">CTA</p>
                              <p className="text-sm font-medium">{creative.cta}</p>
                            </div>
                          )}
                        </div>

                        {/* Brief visual summary */}
                        {creative.brief_visual && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs font-semibold text-amber-700 mb-2">📋 Brief Visual</p>
                            <p className="text-xs text-amber-800">
                              {(creative.brief_visual as Record<string, unknown>).concepto as string ||
                               (creative.brief_visual as Record<string, unknown>).escena_1 ? 'Ver brief completo en descarga' : 'Brief disponible'}
                            </p>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => downloadCopy(creative)}>
                            <Download className="w-3 h-3 mr-1.5" />
                            Descargar Copy
                          </Button>
                          {creative.brief_visual && (
                            <Button size="sm" variant="outline" onClick={() => downloadBrief(creative)}>
                              <Download className="w-3 h-3 mr-1.5" />
                              Descargar Brief
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            className="ml-auto"
                            onClick={() => handleDelete(creative.id)}
                          >
                            <Trash2 className="w-3 h-3 mr-1.5" />
                            Eliminar
                          </Button>
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
    </div>
  );
}
