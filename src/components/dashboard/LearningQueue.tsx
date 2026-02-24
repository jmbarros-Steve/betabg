import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Youtube, FileText, Globe, Type, Loader2, Play, Pause, Trash2,
  Clock, CheckCircle2, AlertCircle, ListPlus, RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';

interface QueueRow {
  id: string;
  source_type: string;
  source_content: string;
  source_title: string | null;
  status: string | null;
  rules_extracted: number | null;
  error_message: string | null;
  created_at: string | null;
  processed_at: string | null;
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  youtube: <Youtube className="w-4 h-4 text-red-500" />,
  pdf: <FileText className="w-4 h-4 text-blue-500" />,
  url: <Globe className="w-4 h-4 text-green-500" />,
  text: <Type className="w-4 h-4 text-muted-foreground" />,
  document: <FileText className="w-4 h-4 text-blue-500" />,
};

function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)/.test(url.trim());
}

export function LearningQueue() {
  const [bulkUrls, setBulkUrls] = useState('');
  const [items, setItems] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentItemTitle, setCurrentItemTitle] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const pauseRef = useRef(false);
  const processingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch queue ──
  const fetchQueue = useCallback(async () => {
    const { data, error } = await supabase
      .from('learning_queue')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setItems(data as QueueRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // ── Polling while processing ──
  useEffect(() => {
    if (isProcessing) {
      pollRef.current = setInterval(fetchQueue, 3000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isProcessing, fetchQueue]);

  // ── Stats ──
  const pending = items.filter(i => i.status === 'pending').length;
  const processing = items.filter(i => i.status === 'processing').length;
  const completed = items.filter(i => i.status === 'completed' || i.status === 'done').length;
  const totalRules = items.reduce((sum, i) => sum + (i.rules_extracted || 0), 0);
  const activeProcessing = isProcessing || processing > 0;
  const progressPercent = totalToProcess > 0
    ? Math.round(((currentIndex) / totalToProcess) * 100)
    : 0;
  const estimatedMinutes = Math.max(0, (pending + processing) * 2);

  // ── Bulk add YouTube URLs ──
  async function handleBulkAdd() {
    const lines = bulkUrls
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const valid = lines.filter(isYouTubeUrl);
    if (valid.length === 0) {
      toast.error('No se encontraron URLs de YouTube válidas');
      return;
    }

    const inserts = valid.map(url => ({
      source_type: 'youtube',
      source_content: url,
      source_title: `YouTube: ${url.slice(0, 60)}`,
      status: 'pending',
    }));

    const { error } = await supabase.from('learning_queue').insert(inserts);
    if (error) {
      toast.error('Error al agregar a la cola');
      return;
    }

    toast.success(`${valid.length} videos agregados a la cola`);
    if (valid.length < lines.length) {
      toast.warning(`${lines.length - valid.length} líneas ignoradas (no son URLs de YouTube válidas)`);
    }
    setBulkUrls('');
    fetchQueue();
  }

  // ── Start processing ──
  async function startProcessing() {
    if (processingRef.current) return;
    processingRef.current = true;
    pauseRef.current = false;
    setIsProcessing(true);

    // Count pending items
    const pendingItems = items.filter(i => i.status === 'pending');
    setTotalToProcess(pendingItems.length);
    setCurrentIndex(0);

    let idx = 0;
    while (!pauseRef.current) {
      // Fetch fresh pending item
      const { data: nextItems } = await supabase
        .from('learning_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

      if (!nextItems || nextItems.length === 0) break;
      const item = nextItems[0] as QueueRow;

      idx++;
      setCurrentIndex(idx);
      setCurrentItemTitle(item.source_title || item.source_content.slice(0, 60));

      await fetchQueue();

      try {
        const { data, error } = await supabase.functions.invoke('learn-from-source', {
          body: {
            sourceType: item.source_type,
            content: item.source_content,
            title: item.source_title,
            queueId: item.id,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        // Handle duplicate response — skip, don't retry
        if (data?.status === 'duplicate') {
          await supabase.from('learning_queue').update({
            status: 'completed',
            error_message: 'Duplicado — ya existía en la cola',
            processed_at: new Date().toISOString(),
            rules_extracted: 0,
          }).eq('id', item.id);
          await fetchQueue();
          continue;
        }

        if (data?.status !== 'processing' || !data?.queueId) {
          throw new Error('Respuesta inválida al encolar procesamiento');
        }

        setCurrentItemTitle(`${item.source_title || 'Fuente'} — procesamiento en background...`);

        // Fire-and-forget
        void supabase.functions.invoke('process-queue-item', {
          body: { queueId: data.queueId },
        }).catch((invokeErr) => {
          console.error('process-queue-item invoke error:', invokeErr);
        });

        // Polling cada 5s hasta completar/error — with max timeout (10 min)
        const maxPollTime = 10 * 60 * 1000;
        const pollStart = Date.now();
        while (!pauseRef.current) {
          await new Promise(r => setTimeout(r, 5000));

          if (Date.now() - pollStart > maxPollTime) {
            // Timeout — mark as error, DON'T retry
            await supabase.from('learning_queue').update({
              status: 'error',
              error_message: 'Timeout — procesamiento excedió 10 minutos',
              processed_at: new Date().toISOString(),
            }).eq('id', item.id);
            break;
          }

          const { data: refreshed, error: pollErr } = await supabase
            .from('learning_queue')
            .select('status, error_message')
            .eq('id', data.queueId)
            .maybeSingle();

          if (pollErr || !refreshed) break;
          if (refreshed.status === 'completed' || refreshed.status === 'done') break;
          if (refreshed.status === 'error') break; // Don't throw — just skip to next
        }
      } catch (err) {
        // Mark as error but DON'T retry — advance to next item
        console.error('Queue processing error:', err);
        await supabase
          .from('learning_queue')
          .update({
            status: 'error',
            error_message: err instanceof Error ? err.message : 'Error desconocido',
            processed_at: new Date().toISOString(),
          })
          .eq('id', item.id);
      }

      await fetchQueue();

      if (pauseRef.current) break;

      // Wait 5 seconds between items
      await new Promise(r => setTimeout(r, 5000));
    }

    processingRef.current = false;
    setIsProcessing(false);
    setCurrentItemTitle('');
    fetchQueue();
  }

  function pauseProcessing() {
    pauseRef.current = true;
    toast.info('Pausando después del item actual...');
  }

  async function clearItems(statusFilter: string[]) {
    const targetIds = items
      .filter(i => statusFilter.includes(i.status || ''))
      .map(i => i.id);
    if (targetIds.length === 0) return;

    // First, nullify FK references in steve_knowledge to avoid 409 conflict
    await supabase
      .from('steve_knowledge')
      .update({ source_id: null })
      .in('source_id', targetIds);

    const { error } = await supabase
      .from('learning_queue')
      .delete()
      .in('id', targetIds);

    if (!error) {
      toast.success(`${targetIds.length} items eliminados`);
      fetchQueue();
    } else {
      toast.error('Error al eliminar: ' + error.message);
    }
  }

  async function deleteItem(id: string) {
    await supabase.from('steve_knowledge').update({ source_id: null }).eq('source_id', id);
    const { error } = await supabase.from('learning_queue').delete().eq('id', id);
    if (!error) fetchQueue();
    else toast.error('Error al eliminar: ' + error.message);
  }

  async function retryItem(id: string) {
    // Reset to pending so the queue picks it up again
    const { error } = await supabase.from('learning_queue').update({
      status: 'pending',
      error_message: null,
      processed_at: null,
      rules_extracted: null,
    }).eq('id', id);
    if (!error) {
      toast.success('Item reencolado para reintentar');
      fetchQueue();
    } else {
      toast.error('Error al reintentar: ' + error.message);
    }
  }

  // ── Status badge ──
  function StatusBadge({ item }: { item: QueueRow }) {
    const s = item.status;
    if (s === 'pending') {
      return <Badge variant="outline" className="text-xs bg-yellow-500/15 text-yellow-700 border-yellow-300">🟡 Pendiente</Badge>;
    }
    if (s === 'processing') {
      return (
        <Badge variant="outline" className="text-xs bg-blue-500/15 text-blue-700 border-blue-300">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Procesando
        </Badge>
      );
    }
    if (s === 'completed' || s === 'done') {
      return (
        <Badge variant="outline" className="text-xs bg-green-500/15 text-green-700 border-green-300">
          🟢 {item.rules_extracted || 0} reglas
        </Badge>
      );
    }
    if (s === 'error') {
      return (
        <Badge variant="outline" className="text-xs bg-red-500/15 text-red-700 border-red-300" title={item.error_message || ''}>
          🔴 Error
        </Badge>
      );
    }
    return <Badge variant="outline" className="text-xs">{s}</Badge>;
  }

  if (loading) return null;

  return (
    <Card className="border-border">
      <CardContent className="pt-5 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          📋 Cola de Aprendizaje
        </h3>

        {/* ── Bulk YouTube input ── */}
        <div className="space-y-2">
          <Textarea
            value={bulkUrls}
            onChange={e => setBulkUrls(e.target.value)}
            placeholder="Pega múltiples URLs de YouTube, una por línea..."
            className="text-sm resize-none"
            style={{ minHeight: '80px' }}
          />
          <Button
            onClick={handleBulkAdd}
            disabled={!bulkUrls.trim()}
            variant="outline"
            size="sm"
          >
            <ListPlus className="w-4 h-4 mr-1" /> Agregar todas a la cola
          </Button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg border border-border p-2.5 text-center">
            <p className="text-lg font-bold">{pending}</p>
            <p className="text-xs text-muted-foreground">En cola</p>
          </div>
          <div className="rounded-lg border border-border p-2.5 text-center">
            <p className="text-lg font-bold">{processing}</p>
            <p className="text-xs text-muted-foreground">Procesando</p>
          </div>
          <div className="rounded-lg border border-border p-2.5 text-center">
            <p className="text-lg font-bold">{completed}</p>
            <p className="text-xs text-muted-foreground">Completados</p>
          </div>
          <div className="rounded-lg border border-border p-2.5 text-center">
            <p className="text-lg font-bold">{totalRules}</p>
            <p className="text-xs text-muted-foreground">Reglas extraídas</p>
          </div>
        </div>

        {/* ── Progress bar ── */}
        {activeProcessing && (
          <div className="space-y-1.5">
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Procesando {currentIndex}/{totalToProcess} — {currentItemTitle}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> ~{estimatedMinutes} min restantes
              </span>
            </div>
          </div>
        )}

        {/* ── Controls ── */}
        <div className="flex gap-2">
          {!isProcessing ? (
            <Button
              onClick={startProcessing}
              disabled={pending === 0}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Play className="w-4 h-4 mr-1" /> Iniciar procesamiento
            </Button>
          ) : (
            <Button
              onClick={pauseProcessing}
              size="sm"
              variant="outline"
              className="border-yellow-400 text-yellow-700 hover:bg-yellow-50"
            >
              <Pause className="w-4 h-4 mr-1" /> Pausar
            </Button>
          )}
          <Button
            onClick={() => clearItems(['completed', 'done'])}
            disabled={completed === 0}
            size="sm"
            variant="outline"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Limpiar completados
          </Button>
          <Button
            onClick={() => clearItems(['error'])}
            disabled={items.filter(i => i.status === 'error').length === 0}
            size="sm"
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Limpiar errores
          </Button>
        </div>

        {/* ── Queue table ── */}
        {items.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8">Tipo</TableHead>
                  <TableHead className="text-xs">Título</TableHead>
                  <TableHead className="text-xs w-28">Status</TableHead>
                  <TableHead className="text-xs w-24">Fecha</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="py-2">
                      {SOURCE_ICONS[item.source_type] || <Type className="w-4 h-4" />}
                    </TableCell>
                    <TableCell className="py-2 text-xs max-w-[200px] truncate" title={item.source_title || item.source_content}>
                      {(item.source_title || item.source_content).slice(0, 60)}
                    </TableCell>
                    <TableCell className="py-2">
                      <StatusBadge item={item} />
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {item.created_at ? format(new Date(item.created_at), 'dd/MM HH:mm') : '-'}
                    </TableCell>
                    <TableCell className="py-2 flex gap-1">
                      {item.status === 'error' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => retryItem(item.id)}
                          title="Reintentar"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                        </Button>
                      )}
                      {(item.status === 'pending' || item.status === 'error') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => deleteItem(item.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            La cola está vacía. Agrega fuentes usando los tabs de arriba o pega URLs de YouTube.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
