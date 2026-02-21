import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  Upload, Loader2, Globe, Search,
  Camera, Palette, FileImage, X, Key, Trophy,
  CheckCircle2, Sparkles
} from 'lucide-react';

interface BrandAssetUploaderProps {
  clientId: string;
  onResearchComplete?: () => void;
}

type AssetCategory = 'logo' | 'products' | 'ads';

const CATEGORY_CONFIG: Record<AssetCategory, { label: string; icon: React.ReactNode; description: string; accept: string }> = {
  logo: { label: 'Logo', icon: <Palette className="h-5 w-5" />, description: 'Logo de tu marca (PNG, SVG, JPG)', accept: 'image/*' },
  products: { label: 'Productos', icon: <Camera className="h-5 w-5" />, description: 'Fotos de tus productos principales', accept: 'image/*' },
  ads: { label: 'Anuncios', icon: <FileImage className="h-5 w-5" />, description: 'Creativos de anuncios actuales', accept: 'image/*,video/*' },
};

const PERFORMANCE_QUOTES = [
  { quote: "Make an offer so good, people feel stupid saying no.", author: "Alex Hormozi", role: "Founder, Acquisition.com" },
  { quote: "The money is in the list. The fortune is in the follow-up.", author: "Russell Brunson", role: "Co-Founder, ClickFunnels" },
  { quote: "Price is only an issue in the absence of value.", author: "Alex Hormozi", role: "Founder, Acquisition.com" },
  { quote: "Speed of implementation separates the rich from the broke.", author: "Alex Hormozi", role: "Founder, Acquisition.com" },
  { quote: "Your ad creative is dead after 3 days. Refresh or die.", author: "Charlie Tichenor", role: "Founder, The Facebook Disruptor" },
  { quote: "The offer is the strategy. Everything else is just execution.", author: "Charlie Tichenor", role: "Founder, The Facebook Disruptor" },
  { quote: "Whoever can spend the most to acquire a customer wins.", author: "Dan Kennedy", role: "Direct Response Marketing Legend" },
  { quote: "Creatives are 70% of your ad performance. Test relentlessly.", author: "Andrew Foxwell", role: "Foxwell Digital" },
  { quote: "If you can't measure it, you can't improve it.", author: "Peter Drucker", role: "Management Consultant" },
  { quote: "Your ROAS is a vanity metric. Profit per customer is what matters.", author: "Andrew Wilkinson", role: "Tiny Capital" },
];

function AnalysisBanner({ progressStep }: { progressStep: { step: string; detail: string; pct: number } }) {
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setQuoteIdx(prev => (prev + 1) % PERFORMANCE_QUOTES.length);
        setVisible(true);
      }, 400);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const quote = PERFORMANCE_QUOTES[quoteIdx];
  const phases = [
    { keys: ['inicio', 'sitio_web'], icon: <Globe className="h-4 w-4 mx-auto mb-1" />, label: 'Tu Sitio Web', threshold: 0 },
    { keys: ['detectando'], icon: <Search className="h-4 w-4 mx-auto mb-1" />, label: 'Detectando', threshold: 20 },
    { keys: ['competidor_0', 'competidor_1', 'competidor_2', 'competidor_3', 'competidor_4', 'competidor_5'], icon: <Trophy className="h-4 w-4 mx-auto mb-1" />, label: 'Competidores', threshold: 25 },
    { keys: ['ia'], icon: <Sparkles className="h-4 w-4 mx-auto mb-1" />, label: 'Estrategia IA', threshold: 70 },
  ];

  return (
    <div className="bg-primary/5 border border-primary/30 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary truncate">
            {progressStep.detail}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Analizando con el equipo de Marketing.</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Progreso</span>
          <span className="text-[10px] font-bold text-primary">{progressStep.pct}%</span>
        </div>
        <Progress value={progressStep.pct} className="h-2" />
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {phases.map((phase, i) => {
          const isActive = phase.keys.includes(progressStep.step);
          const pct = progressStep.pct;
          const isDone = pct > phase.threshold && !isActive;
          return (
            <div key={i} className={`rounded-lg p-2 border transition-all duration-300 ${isActive ? 'bg-primary/10 border-primary/40' : isDone ? 'bg-green-50 dark:bg-green-950/20 border-green-400/40' : 'bg-background border-border'}`}>
              <div className={isActive ? 'text-primary' : isDone ? 'text-green-500' : 'text-muted-foreground'}>
                {isDone ? <CheckCircle2 className="h-4 w-4 mx-auto mb-1" /> : phase.icon}
              </div>
              <p className={`text-[10px] font-medium ${isActive ? 'text-primary' : isDone ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>{phase.label}</p>
            </div>
          );
        })}
      </div>

      <div
        className="rounded-xl border border-primary/20 bg-background/60 p-3"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(6px)', transition: 'opacity 0.4s ease, transform 0.4s ease' }}
      >
        <div className="flex gap-2 items-start">
          <span className="text-2xl leading-none text-primary/30 font-serif select-none flex-shrink-0 -mt-0.5">"</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground leading-snug italic">{quote.quote}</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="h-px flex-1 bg-border" />
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] font-bold text-primary">{quote.author}</p>
                <p className="text-[10px] text-muted-foreground">{quote.role}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandAssetUploader({ clientId, onResearchComplete }: BrandAssetUploaderProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState<AssetCategory | null>(null);
  const [assets, setAssets] = useState<Record<AssetCategory, string[]>>({ logo: [], products: [], ads: [] });
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [competitorUrls, setCompetitorUrls] = useState(['', '', '']);
  const analyzingRef = useRef(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressStep, setProgressStep] = useState<{ step: string; detail: string; pct: number }>({ step: 'inicio', detail: 'Iniciando análisis de marca...', pct: 2 });
  const [autoTriggered, setAutoTriggered] = useState(false);
  const fileRefs = useRef<Record<AssetCategory, HTMLInputElement | null>>({ logo: null, products: null, ads: null });
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mutex: prevents double launchAnalysis calls (from auto-trigger + manual click)
  const isLaunchingRef = useRef(false);
  // Realtime channel ref for cleanup (bonus channel — primary detection is polling)
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ─── Cleanup helper ───────────────────────────────────────────────
  function clearAll() {
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
    if (statusPollingRef.current) { clearInterval(statusPollingRef.current); statusPollingRef.current = null; }
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  }

  // ─── Helper: close banner and reset state ────────────────────────
  function finishAnalysis(success: boolean) {
    clearAll();
    isLaunchingRef.current = false;
    analyzingRef.current = false;
    setAnalyzing(false);
    setProgressStep({ step: 'inicio', detail: 'Iniciando análisis de marca...', pct: 2 });
    if (success) {
      toast.success('¡Análisis SEO, Keywords y Competencia completado!');
      onResearchComplete?.();
    } else {
      toast.error('Error en el análisis. Intenta de nuevo.');
    }
  }

  // ─── Progress polling (cosmetic bar only) ───────────────────────
  function startProgressPolling() {
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); }
    progressIntervalRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('brand_research')
        .select('research_data')
        .eq('client_id', clientId)
        .eq('research_type', 'analysis_progress')
        .maybeSingle();
      if (data?.research_data) {
        const p = data.research_data as any;
        setProgressStep({ step: p.step, detail: p.detail, pct: p.pct });
      }
    }, 3000);
  }

  // ─── Status polling (PRIMARY — reliable, no RLS/INSERT issues) ──
  function startStatusPolling() {
    if (statusPollingRef.current) { clearInterval(statusPollingRef.current); }
    console.log('[StatusPoll] Starting status polling every 4s');
    statusPollingRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('brand_research')
        .select('research_data, updated_at')
        .eq('client_id', clientId)
        .eq('research_type', 'analysis_status')
        .maybeSingle();

      if (!data) return;
      const status = (data.research_data as any)?.status;
      // Guard: convert both to numeric ms to avoid JS ISO vs Postgres space-separator comparison bug
      const updatedMs = new Date(data.updated_at || 0).getTime();
      const startedMs = parseInt(sessionStorage.getItem(`analysis_started_${clientId}`) || '0', 10);
      console.log('[StatusPoll] status:', status, '| updatedMs:', updatedMs, '| startedMs:', startedMs, '| diff:', updatedMs - startedMs);

      if (status === 'complete' && updatedMs > startedMs) {
        console.log('[StatusPoll] ✅ complete detected — closing banner');
        finishAnalysis(true);
      } else if (status === 'error' && updatedMs > startedMs) {
        console.log('[StatusPoll] ❌ error detected — closing banner');
        finishAnalysis(false);
      }
    }, 4000);
  }

  // ─── Realtime subscription (BONUS — extra coverage if it works) ──
  function subscribeToStatus() {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }
    console.log('[Realtime] Subscribing as bonus channel for client:', clientId);
    const channel = supabase
      .channel(`brand-analysis-${clientId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to both INSERT and UPDATE
          schema: 'public',
          table: 'brand_research',
        },
        (payload) => {
          const row = payload.new as any;
          if (row.client_id !== clientId) return;
          if (row.research_type !== 'analysis_status') return;
          const status = row.research_data?.status;
          const updatedMs = new Date(row.updated_at || 0).getTime();
          const startedMs = parseInt(sessionStorage.getItem(`analysis_started_${clientId}`) || '0', 10);
          console.log('[Realtime] Received event — status:', status, '| updatedMs:', updatedMs, '| startedMs:', startedMs, '| diff:', updatedMs - startedMs);

          if (status === 'complete' && updatedMs > startedMs) {
            console.log('[Realtime] ✅ complete via Realtime — closing banner early');
            finishAnalysis(true);
          } else if (status === 'error' && updatedMs > startedMs) {
            console.log('[Realtime] ❌ error via Realtime — closing banner');
            finishAnalysis(false);
          }
        }
      )
      .subscribe((subscriptionStatus) => {
        console.log('[Realtime] Subscription status:', subscriptionStatus);
      });
    realtimeChannelRef.current = channel;
  }

  // ─── Mount effect ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: statusRow } = await supabase
        .from('brand_research')
        .select('research_data')
        .eq('client_id', clientId)
        .eq('research_type', 'analysis_status')
        .maybeSingle();
      if ((statusRow?.research_data as any)?.status === 'pending') {
        console.log('[BrandAssetUploader] Resuming in-progress analysis on mount');
        // If no sessionStorage timestamp, set one to "far in the past" so poll detects complete
        if (!sessionStorage.getItem(`analysis_started_${clientId}`)) {
          sessionStorage.setItem(`analysis_started_${clientId}`, (Date.now() - 3600000).toString());
        }
        analyzingRef.current = true;
        isLaunchingRef.current = true;
        setAnalyzing(true);
        startStatusPolling();
        startProgressPolling();
        subscribeToStatus();
      }
    })();
    loadAssets();
    return () => {
      clearAll();
    };
  }, [clientId]);

  // ─── Main launch function (mutex-protected) ─────────────────────
  async function launchAnalysis(url: string, compUrls: string[]) {
    if (!url.trim()) {
      console.warn('[launchAnalysis] No URL provided, aborting');
      return;
    }

    // MUTEX: prevent double execution from auto-trigger + manual click
    if (isLaunchingRef.current) {
      console.warn('[launchAnalysis] Already launching — ignoring duplicate call');
      return;
    }

    // ── SYNCHRONOUS: show banner & save timestamp IMMEDIATELY ──────
    const startedMs = Date.now();
    sessionStorage.setItem(`analysis_started_${clientId}`, startedMs.toString());
    isLaunchingRef.current = true;
    analyzingRef.current = true;
    setAnalyzing(true);
    setProgressStep({ step: 'inicio', detail: 'Iniciando análisis de marca...', pct: 2 });

    console.log('[launchAnalysis] STARTING — url:', url, '| startedMs:', startedMs);

    // Kill any lingering intervals/channels
    clearAll();

    // Write 'pending' to DB
    await supabase.from('brand_research').upsert({
      client_id: clientId,
      research_type: 'analysis_status',
      research_data: { status: 'pending' },
    }, { onConflict: 'client_id,research_type' });
    console.log('[launchAnalysis] DB status set to pending ✓');

    await supabase.from('brand_research').upsert({
      client_id: clientId,
      research_type: 'analysis_progress',
      research_data: { step: 'inicio', detail: 'Iniciando análisis de marca...', pct: 2, ts: new Date(startedMs).toISOString() },
    }, { onConflict: 'client_id,research_type' });

    // Start PRIMARY status polling (every 4s — reliable fallback)
    startStatusPolling();
    // Start progress bar polling (cosmetic)
    startProgressPolling();
    // Subscribe Realtime as bonus
    subscribeToStatus();

    // Two-phase analysis: research (scraping ~30s) → strategy (Claude Opus ~60s)
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const projectId = 'jnqivntlkemzcpomkvwv';
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    };

    console.log('[launchAnalysis] Phase 1 — research (scraping)');
    let research: any = null;
    try {
      const researchRes = await fetch(`https://${projectId}.supabase.co/functions/v1/analyze-brand-research`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          client_id: clientId,
          website_url: url.trim(),
          competitor_urls: compUrls.filter(u => u.trim()),
        }),
      });
      if (researchRes.ok) {
        const researchData = await researchRes.json();
        research = researchData.research;
        console.log('[launchAnalysis] Phase 1 complete — competitors scraped:', research?.competitorContents?.length);
      } else {
        console.error('[launchAnalysis] Phase 1 error:', researchRes.status);
      }
    } catch (err) {
      console.error('[launchAnalysis] Phase 1 failed:', err);
    }

    // Phase 2: fire and forget (polling tracks completion)
    if (research) {
      console.log('[launchAnalysis] Phase 2 — strategy (Claude Opus)');
      fetch(`https://${projectId}.supabase.co/functions/v1/analyze-brand-strategy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ client_id: clientId, research }),
      }).catch((err) => {
        console.log('[launchAnalysis] Phase 2 ended (polling tracks status):', err?.message);
      });
    } else {
      console.error('[launchAnalysis] Skipping Phase 2 — research failed');
    }
  }

  async function loadAssets() {
    if (!user) return;
    const categories: AssetCategory[] = ['logo', 'products', 'ads'];
    const loaded: Record<AssetCategory, string[]> = { logo: [], products: [], ads: [] };

    for (const cat of categories) {
      const { data } = await supabase.storage.from('client-assets').list(`${user.id}/${cat}`, { limit: 20 });
      if (data) {
        loaded[cat] = data.map(f => {
          const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(`${user.id}/${cat}/${f.name}`);
          return urlData.publicUrl;
        });
      }
    }
    setAssets(loaded);

    const [clientResult, personaResult] = await Promise.all([
      supabase.from('clients').select('website_url').eq('id', clientId).single(),
      supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).maybeSingle(),
    ]);

    const savedWebUrl = clientResult.data?.website_url || '';
    if (savedWebUrl) setWebsiteUrl(savedWebUrl);

    let extractedCompUrls: string[] = [];
    if (personaResult.data?.persona_data) {
      const pd = personaResult.data.persona_data as any;
      const questions: string[] = pd.questions || [];
      const responses: string[] = pd.raw_responses || [];
      const competitorIdx = questions.indexOf('competitors');
      if (competitorIdx >= 0 && responses[competitorIdx]) {
        const raw = String(responses[competitorIdx]);
        const fromComp: string[] = [];
        const compUrlRegex = /comp[123]_url\s*:\s*([^\s\n,]+)/gi;
        let match: RegExpExecArray | null;
        while ((match = compUrlRegex.exec(raw)) !== null) {
          const u = match[1].trim();
          if (u && u.length > 4) fromComp.push(u.startsWith('http') ? u : `https://${u}`);
        }
        if (fromComp.length === 0) {
          const urlMatches = raw.match(/(?:https?:\/\/)?(?:www\.)?[\w.-]+\.(?:com|cl|mx|ar|co|pe|es|io|store|shop)(?:\/\S*)?/gi) || [];
          const domains = raw.match(/\b[\w-]+\.(?:cl|com|com\.ar|mx|pe|co|es|io)\b/g) || [];
          extractedCompUrls = [...urlMatches, ...domains].slice(0, 6).map((u: string) => u.startsWith('http') ? u : `https://${u}`);
        } else {
          extractedCompUrls = fromComp.slice(0, 6);
        }
      }
    }

    if (extractedCompUrls.length > 0) {
      setCompetitorUrls(prev => {
        const newUrls = [...prev];
        extractedCompUrls.forEach((url: string, i: number) => { if (url) newUrls[i] = url; });
        return newUrls;
      });
    }

    // Auto-trigger if no research exists yet (and not already launching)
    if (savedWebUrl && !autoTriggered && !isLaunchingRef.current) {
      const { data: existingResearch } = await supabase
        .from('brand_research').select('id').eq('client_id', clientId).limit(1);
      if (!existingResearch || existingResearch.length === 0) {
        console.log('[loadAssets] No research found, auto-triggering analysis');
        setAutoTriggered(true);
        setTimeout(() => launchAnalysis(savedWebUrl, extractedCompUrls), 800);
      }
    }
  }

  async function handleUpload(category: AssetCategory, files: FileList | null) {
    if (!files || !user) return;
    setUploading(category);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop();
        const path = `${user.id}/${category}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('client-assets').upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(path);
        newUrls.push(urlData.publicUrl);
      }
      setAssets(prev => ({ ...prev, [category]: [...prev[category], ...newUrls] }));
      if (category === 'logo' && newUrls.length > 0) {
        await supabase.from('clients').update({ logo_url: newUrls[newUrls.length - 1] }).eq('id', clientId);
      }
      toast.success(`${files.length} archivo(s) subido(s)`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error al subir archivo');
    } finally {
      setUploading(null);
    }
  }

  async function handleDeleteAsset(category: AssetCategory, url: string) {
    if (!user) return;
    try {
      const pathMatch = url.match(/client-assets\/(.+)$/);
      if (pathMatch) await supabase.storage.from('client-assets').remove([pathMatch[1]]);
      setAssets(prev => ({ ...prev, [category]: prev[category].filter(u => u !== url) }));
      toast.success('Archivo eliminado');
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.entries(CATEGORY_CONFIG) as [AssetCategory, typeof CATEGORY_CONFIG.logo][]).map(([cat, config]) => (
          <Card key={cat} className="relative">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">{config.icon}{config.label}</CardTitle>
              <CardDescription className="text-xs">{config.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {assets[cat].length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {assets[cat].map((url, i) => (
                    <div key={i} className="relative group">
                      <img src={url} alt={`${config.label} ${i + 1}`} className="h-16 w-16 object-cover rounded-lg border border-border" />
                      <button onClick={() => handleDeleteAsset(cat, url)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input type="file" ref={el => fileRefs.current[cat] = el} accept={config.accept} multiple={cat !== 'logo'} onChange={e => handleUpload(cat, e.target.files)} className="hidden" />
              <Button variant="outline" size="sm" className="w-full" disabled={uploading === cat} onClick={() => fileRefs.current[cat]?.click()}>
                {uploading === cat ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subiendo...</> : <><Upload className="h-4 w-4 mr-2" /> Subir {config.label}</>}
              </Button>
              {assets[cat].length > 0 && <Badge variant="secondary" className="mt-2 text-xs">{assets[cat].length} archivo(s)</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Análisis Automático — SEO, Keywords & Competencia
          </CardTitle>
          <CardDescription>Steve analizará tu sitio web y el de tus competidores para generar un informe completo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {analyzing && <AnalysisBanner key="analysis-banner" progressStep={progressStep} />}

          <div>
            <Label className="text-sm font-medium">Tu Sitio Web *</Label>
            <div className="flex gap-2 mt-1">
              <Globe className="h-4 w-4 mt-2.5 text-muted-foreground flex-shrink-0" />
              <Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://tusitio.com" type="url" />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium flex items-center gap-2">
              URLs de Competidores (hasta 3)
              <Badge variant="secondary" className="text-xs font-normal">Auto-detectados del brief</Badge>
            </Label>
            {competitorUrls.map((url, i) => (
              <div key={i} className="flex gap-2 mt-1.5">
                <Badge variant="outline" className="flex-shrink-0 mt-1.5 text-xs w-6 justify-center">{i + 1}</Badge>
                <Input
                  value={url}
                  onChange={e => { const newUrls = [...competitorUrls]; newUrls[i] = e.target.value; setCompetitorUrls(newUrls); }}
                  placeholder={`https://competidor${i + 1}.com`}
                  type="url"
                  className={url ? 'border-primary/40' : ''}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 py-2">
            {[
              { icon: <Globe className="h-3.5 w-3.5" />, label: 'Auditoría SEO' },
              { icon: <Key className="h-3.5 w-3.5" />, label: 'Keywords' },
              { icon: <Trophy className="h-3.5 w-3.5" />, label: 'Competencia' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                <span className="text-primary">{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>

          <Button
            onClick={() => {
              console.log('[Button] Clicked — analyzing:', analyzing, 'websiteUrl:', websiteUrl);
              launchAnalysis(websiteUrl, competitorUrls);
            }}
            disabled={analyzing || !websiteUrl.trim()}
            className="w-full"
            size="lg"
          >
            {analyzing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando...</>
            ) : (
              <><Search className="h-4 w-4 mr-2" /> 🐕 Que Steve Analice Todo</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
