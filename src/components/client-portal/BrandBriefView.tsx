import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import ReactMarkdown from 'react-markdown';
import { BrandAssetUploader } from './BrandAssetUploader';
import avatarSteve from '@/assets/avatar-steve.png';
import logo from '@/assets/logo.jpg';
import {
  FileText, RefreshCw, CheckCircle2, AlertCircle, Download,
  Building2, Users, Trophy, MessageSquare, DollarSign, Store,
  Target, Heart, Shield, TrendingUp, Gem, Gift,
  Search, Globe, BarChart3, Key, Megaphone, Image,
  Sparkles, Award, AlertTriangle, TrendingDown, Lightbulb
} from 'lucide-react';

interface BrandBriefViewProps {
  clientId: string;
  onEditBrief: () => void;
}

interface BriefData {
  raw_responses?: string[];
  summary?: string;
  completed_at?: string;
  questions?: string[];
  answered_count?: number;
  total_questions?: number;
}

interface ResearchData {
  seo_audit?: any;
  competitor_analysis?: any;
  keywords?: any;
  ads_library_analysis?: any;
  executive_summary?: any;
}

const QUESTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; section: string }> = {
  business_pitch: { label: 'El Negocio', icon: <Building2 className="h-4 w-4" />, section: 'negocio' },
  numbers: { label: 'Números Clave', icon: <DollarSign className="h-4 w-4" />, section: 'negocio' },
  sales_channels: { label: 'Canales de Venta', icon: <Store className="h-4 w-4" />, section: 'negocio' },
  persona_profile: { label: 'Perfil del Cliente', icon: <Users className="h-4 w-4" />, section: 'persona' },
  persona_pain: { label: 'Dolor y Vergüenza', icon: <Heart className="h-4 w-4" />, section: 'persona' },
  persona_words: { label: 'Palabras y Objeciones', icon: <MessageSquare className="h-4 w-4" />, section: 'persona' },
  persona_transformation: { label: 'Transformación', icon: <TrendingUp className="h-4 w-4" />, section: 'persona' },
  persona_lifestyle: { label: 'Estilo de Vida', icon: <Gem className="h-4 w-4" />, section: 'persona' },
  competitors: { label: 'Competidores', icon: <Trophy className="h-4 w-4" />, section: 'competencia' },
  competitors_weakness: { label: 'Fallas Competencia', icon: <Shield className="h-4 w-4" />, section: 'competencia' },
  your_advantage: { label: 'Tu Ventaja', icon: <Trophy className="h-4 w-4" />, section: 'competencia' },
  purple_cow_promise: { label: 'Vaca Púrpura', icon: <Gem className="h-4 w-4" />, section: 'estrategia' },
  villain_guarantee: { label: 'Villano y Garantía', icon: <Shield className="h-4 w-4" />, section: 'estrategia' },
  proof_tone: { label: 'Prueba y Tono', icon: <Target className="h-4 w-4" />, section: 'estrategia' },
  offer_urgency: { label: 'Oferta y Urgencia', icon: <Gift className="h-4 w-4" />, section: 'estrategia' },
};

const SECTIONS = [
  { id: 'negocio', title: 'El Negocio', icon: Building2 },
  { id: 'persona', title: 'Buyer Persona', icon: Users },
  { id: 'competencia', title: 'Análisis Competitivo', icon: Trophy },
  { id: 'estrategia', title: 'Estrategia', icon: MessageSquare },
];

export function BrandBriefView({ clientId, onEditBrief }: BrandBriefViewProps) {
  const { user } = useAuth();
  const [briefData, setBriefData] = useState<BriefData | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [research, setResearch] = useState<ResearchData>({});
  const [clientInfo, setClientInfo] = useState<{ name?: string; company?: string; logo_url?: string; website_url?: string } | null>(null);
  const [assets, setAssets] = useState<{ logo: string[]; products: string[]; ads: string[] }>({ logo: [], products: [], ads: [] });

  useEffect(() => {
    fetchAll();
  }, [clientId]);

  async function fetchAll() {
    setLoading(true);
    try {
      await Promise.all([fetchBrief(), fetchResearch(), fetchClientInfo(), fetchAssets()]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchBrief() {
    const { data } = await supabase
      .from('buyer_personas')
      .select('persona_data, is_complete')
      .eq('client_id', clientId)
      .maybeSingle();
    if (data) {
      setBriefData(data.persona_data as BriefData);
      setIsComplete(data.is_complete);
    }
  }

  async function fetchResearch() {
    const { data } = await supabase
      .from('brand_research')
      .select('research_type, research_data')
      .eq('client_id', clientId);
    if (data) {
      const r: ResearchData = {};
      for (const row of data) {
        (r as any)[row.research_type] = row.research_data;
      }
      setResearch(r);
    }
  }

  async function fetchClientInfo() {
    const { data } = await supabase
      .from('clients')
      .select('name, company, logo_url, website_url')
      .eq('id', clientId)
      .single();
    if (data) setClientInfo(data);
  }

  async function fetchAssets() {
    if (!user) return;
    const loaded: typeof assets = { logo: [], products: [], ads: [] };
    for (const cat of ['logo', 'products', 'ads'] as const) {
      const { data } = await supabase.storage
        .from('client-assets')
        .list(`${user.id}/${cat}`, { limit: 20 });
      if (data) {
        loaded[cat] = data.map(f => {
          const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(`${user.id}/${cat}/${f.name}`);
          return urlData.publicUrl;
        });
      }
    }
    setAssets(loaded);
  }

  function handleDownloadPDF() {
    if (!briefData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    // Logo
    try {
      const logoImg = new window.Image();
      logoImg.src = logo;
    } catch {}

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(30, 60, 150);
    doc.text('BRIEF ESTRATÉGICO DE MARCA', margin, y);
    y += 8;

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(clientInfo?.name || 'Cliente', margin, y);
    if (clientInfo?.company) {
      doc.text(` — ${clientInfo.company}`, margin + doc.getTextWidth(clientInfo?.name || 'Cliente') + 2, y);
    }
    y += 6;

    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);
    doc.setTextColor(0);
    y += 4;

    doc.setDrawColor(30, 60, 150);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Brief sections
    const questions = briefData.questions || [];
    const responses = briefData.raw_responses || [];

    for (const section of SECTIONS) {
      const sectionQs = questions
        .map((qId, i) => ({ qId, response: responses[i], config: QUESTION_CONFIG[qId] }))
        .filter(q => q.config?.section === section.id);
      if (sectionQs.length === 0) continue;
      if (y > 250) { doc.addPage(); y = 20; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 60, 150);
      doc.text(section.title.toUpperCase(), margin, y);
      doc.setTextColor(0);
      y += 7;

      for (const q of sectionQs) {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(q.config?.label || q.qId, margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(q.response || 'Sin respuesta', maxWidth);
        doc.text(lines, margin, y);
        y += lines.length * 4 + 5;
      }
      y += 3;
    }

    // Research sections
    if (research.competitor_analysis?.competitors) {
      if (y > 200) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 60, 150);
      doc.text('ANÁLISIS DE COMPETENCIA', margin, y);
      doc.setTextColor(0);
      y += 7;
      for (const comp of research.competitor_analysis.competitors) {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(comp.name || comp.url, margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        if (comp.strengths?.length) {
          const t = `Fortalezas: ${comp.strengths.join(', ')}`;
          const lines = doc.splitTextToSize(t, maxWidth);
          doc.text(lines, margin, y);
          y += lines.length * 4 + 2;
        }
        if (comp.weaknesses?.length) {
          const t = `Debilidades: ${comp.weaknesses.join(', ')}`;
          const lines = doc.splitTextToSize(t, maxWidth);
          doc.text(lines, margin, y);
          y += lines.length * 4 + 4;
        }
      }
    }

    if (research.seo_audit) {
      if (y > 200) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 60, 150);
      doc.text('AUDITORÍA SEO', margin, y);
      doc.setTextColor(0);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const seoText = `Score: ${research.seo_audit.score || 'N/A'}/100\n${research.seo_audit.meta_analysis || ''}\n${research.seo_audit.content_quality || ''}`;
      const seoLines = doc.splitTextToSize(seoText, maxWidth);
      doc.text(seoLines, margin, y);
      y += seoLines.length * 4 + 5;
    }

    if (research.keywords) {
      if (y > 200) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 60, 150);
      doc.text('PALABRAS CLAVE', margin, y);
      doc.setTextColor(0);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const kw = research.keywords;
      const kwText = `Principales: ${(kw.primary || []).join(', ')}\nLong-tail: ${(kw.long_tail || []).join(', ')}\nEstrategia: ${kw.recommended_strategy || ''}`;
      const kwLines = doc.splitTextToSize(kwText, maxWidth);
      doc.text(kwLines, margin, y);
      y += kwLines.length * 4 + 5;
    }

    // Signature
    if (y > 240) { doc.addPage(); y = 20; }
    y += 10;
    doc.setDrawColor(30, 60, 150);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Firmado por:', margin, y);
    y += 6;
    doc.setFontSize(14);
    doc.setTextColor(30, 60, 150);
    doc.text('🐕 Steve Dogs', margin, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('PhD Performance Marketing — Stanford Dog University', margin, y);
    y += 4;
    doc.text('Director de Estrategia, BG Consult', margin, y);
    doc.setTextColor(0);

    // Footer on all pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`BG Consult — Brief Estratégico | Pág ${i}/${pageCount}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    }

    doc.save(`Brief_${clientInfo?.name || 'Marca'}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF descargado con éxito');
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  const questions = briefData?.questions || [];
  const responses = briefData?.raw_responses || [];
  const answeredCount = briefData?.answered_count || responses.length;
  const totalQuestions = briefData?.total_questions || 15;
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);
  const hasResearch = Object.keys(research).length > 0;

  return (
    <div className="space-y-6">
      {/* Header with logo */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {(clientInfo?.logo_url || assets.logo[0]) && (
            <img
              src={clientInfo?.logo_url || assets.logo[0]}
              alt="Logo"
              className="h-14 w-14 object-contain rounded-xl border border-border bg-card p-1"
            />
          )}
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Brief Estratégico
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {clientInfo?.name}{clientInfo?.company ? ` — ${clientInfo.company}` : ''}
              {briefData?.completed_at && ` • ${new Date(briefData.completed_at).toLocaleDateString('es-CL')}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isComplete && (
            <Button onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-2" />
              Descargar PDF
            </Button>
          )}
          <Button variant="outline" onClick={onEditBrief}>
            <MessageSquare className="h-4 w-4 mr-2" />
            {isComplete ? 'Editar con Steve' : 'Hablar con Steve'}
          </Button>
        </div>
      </div>

      {/* Progress bar for in-progress briefs */}
      {!isComplete && answeredCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progreso del Brief</span>
              <span className="font-semibold">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3 mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SECTIONS.map(section => {
                const sectionQs = questions
                  .map((qId, i) => ({ qId, answered: !!responses[i], config: QUESTION_CONFIG[qId] }))
                  .filter(q => q.config?.section === section.id);
                const done = sectionQs.filter(q => q.answered).length;
                const total = Object.values(QUESTION_CONFIG).filter(c => c.section === section.id).length;
                return (
                  <div key={section.id} className="bg-muted/50 rounded-lg p-3 text-center">
                    <section.icon className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs font-medium">{section.title}</p>
                    <p className="text-xs text-muted-foreground">{done}/{total}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No brief at all */}
      {(!briefData || answeredCount === 0) && !isComplete && (
        <Card className="text-center py-12">
          <CardContent>
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sin Brief de Marca</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Habla con Steve para crear tu Brief Estratégico en solo 15 preguntas.
            </p>
            <Button onClick={onEditBrief}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Hablar con Steve
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs for complete brief */}
      {(isComplete || answeredCount > 0) && (
        <Tabs defaultValue="brief" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-5">
            <TabsTrigger value="brief" className="text-xs">📋 Brief</TabsTrigger>
            <TabsTrigger value="assets" className="text-xs">📸 Assets</TabsTrigger>
            <TabsTrigger value="research" className="text-xs">🔍 Investigación</TabsTrigger>
            <TabsTrigger value="seo" className="text-xs">📊 SEO</TabsTrigger>
            <TabsTrigger value="keywords" className="text-xs hidden lg:block">🔑 Keywords</TabsTrigger>
          </TabsList>

          {/* Brief Tab */}
          <TabsContent value="brief" className="space-y-4">
            {isComplete && (
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="default" className="bg-primary">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Brief Completo
                </Badge>
                <Badge variant="secondary">{responses.length} respuestas</Badge>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {SECTIONS.map(section => {
                const sectionQs = questions
                  .map((qId, i) => ({ qId, response: responses[i], config: QUESTION_CONFIG[qId] }))
                  .filter(q => q.config?.section === section.id);
                if (sectionQs.length === 0) return null;
                return (
                  <Card key={section.id}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <section.icon className="h-5 w-5 text-primary" />
                        {section.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {sectionQs.map(q => (
                          <div key={q.qId} className="border-b border-border pb-2 last:border-0">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
                              {q.config?.icon}
                              {q.config?.label}
                              {q.response && <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto" />}
                            </div>
                            <p className="text-sm">{q.response || <span className="text-muted-foreground italic">Pendiente</span>}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Steve's Summary */}
            {briefData?.summary && (
              <Card className="border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <img src={avatarSteve} alt="Steve" className="h-10 w-10 rounded-full border-2 border-primary/20" />
                    <div>
                      <CardTitle className="text-base">Resumen de Steve Dogs</CardTitle>
                      <CardDescription className="text-xs">PhD Performance Marketing — Stanford Dog University</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[400px]">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{briefData.summary}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Executive Summary from Research */}
            {research.executive_summary?.summary && (
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    Resumen Ejecutivo — Análisis de Mercado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{research.executive_summary.summary}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Signature */}
            {isComplete && (
              <Card className="bg-muted/30">
                <CardContent className="pt-6 pb-4 text-center">
                  <img src={avatarSteve} alt="Steve Dogs" className="h-16 w-16 rounded-full mx-auto mb-3 border-2 border-primary shadow-lg" />
                  <p className="text-lg font-bold text-primary">Steve Dogs</p>
                  <p className="text-xs text-muted-foreground">PhD Performance Marketing — Stanford Dog University</p>
                  <p className="text-xs text-muted-foreground">Director de Estrategia, BG Consult</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Firmado: {new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Assets Tab */}
          <TabsContent value="assets">
            <BrandAssetUploader clientId={clientId} onResearchComplete={fetchAll} />

            {/* Product photos gallery */}
            {assets.products.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image className="h-5 w-5 text-primary" />
                    Galería de Productos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {assets.products.map((url, i) => (
                      <img key={i} src={url} alt={`Producto ${i + 1}`} className="w-full h-32 object-cover rounded-lg border border-border" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Ad creatives gallery */}
            {assets.ads.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    Creativos de Anuncios
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {assets.ads.map((url, i) => (
                      <img key={i} src={url} alt={`Ad ${i + 1}`} className="w-full h-40 object-cover rounded-lg border border-border" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Research Tab */}
          <TabsContent value="research" className="space-y-4">
            {!hasResearch ? (
              <Card className="text-center py-10">
                <CardContent>
                  <Search className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-2">Sin Investigación</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Ve a la pestaña <strong>Assets</strong> e ingresa tu URL y competidores para que Steve los analice.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Competitor Analysis */}
                {research.competitor_analysis?.competitors && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-primary" />
                        Análisis de Competencia
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {research.competitor_analysis.competitors.map((comp: any, i: number) => (
                          <div key={i} className="bg-muted/50 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">{i + 1}</Badge>
                              <h4 className="font-semibold text-sm">{comp.name || comp.url}</h4>
                            </div>
                            {comp.positioning && (
                              <p className="text-xs text-muted-foreground mb-2">{comp.positioning}</p>
                            )}
                            <div className="grid grid-cols-2 gap-3 mt-2">
                              <div>
                                <p className="text-xs font-medium text-green-600 flex items-center gap-1 mb-1">
                                  <TrendingUp className="h-3 w-3" /> Fortalezas
                                </p>
                                <ul className="text-xs space-y-0.5">
                                  {comp.strengths?.map((s: string, j: number) => (
                                    <li key={j} className="text-muted-foreground">• {s}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-red-500 flex items-center gap-1 mb-1">
                                  <TrendingDown className="h-3 w-3" /> Debilidades
                                </p>
                                <ul className="text-xs space-y-0.5">
                                  {comp.weaknesses?.map((w: string, j: number) => (
                                    <li key={j} className="text-muted-foreground">• {w}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            {comp.ad_strategy && (
                              <div className="mt-2 pt-2 border-t border-border">
                                <p className="text-xs font-medium flex items-center gap-1 mb-1">
                                  <Megaphone className="h-3 w-3" /> Estrategia de Ads
                                </p>
                                <p className="text-xs text-muted-foreground">{comp.ad_strategy}</p>
                              </div>
                            )}
                          </div>
                        ))}

                        {research.competitor_analysis.market_gaps?.length > 0 && (
                          <div className="bg-primary/5 rounded-lg p-4 mt-3">
                            <p className="text-sm font-medium flex items-center gap-2 mb-2">
                              <Lightbulb className="h-4 w-4 text-primary" />
                              Oportunidades de Mercado
                            </p>
                            <ul className="text-sm space-y-1">
                              {research.competitor_analysis.market_gaps.map((gap: string, i: number) => (
                                <li key={i}>• {gap}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Ads Library Analysis */}
                {research.ads_library_analysis && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Megaphone className="h-5 w-5 text-primary" />
                        Análisis de Ads Library
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {research.ads_library_analysis.winning_patterns?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">🏆 Patrones Ganadores</p>
                          <ul className="text-sm space-y-1">
                            {research.ads_library_analysis.winning_patterns.map((p: string, i: number) => (
                              <li key={i}>• {p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {research.ads_library_analysis.cta_analysis && (
                        <div>
                          <p className="text-xs font-medium mb-1">📣 Análisis de CTAs</p>
                          <p className="text-sm text-muted-foreground">{research.ads_library_analysis.cta_analysis}</p>
                        </div>
                      )}
                      {research.ads_library_analysis.recommended_formats?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">📐 Formatos Recomendados</p>
                          <div className="flex flex-wrap gap-1.5">
                            {research.ads_library_analysis.recommended_formats.map((f: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">{f}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {research.ads_library_analysis.creative_recommendations?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">💡 Recomendaciones Creativas</p>
                          <ul className="text-sm space-y-1">
                            {research.ads_library_analysis.creative_recommendations.map((r: string, i: number) => (
                              <li key={i}>• {r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* SEO Tab */}
          <TabsContent value="seo" className="space-y-4">
            {!research.seo_audit ? (
              <Card className="text-center py-10">
                <CardContent>
                  <Globe className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-2">Sin Auditoría SEO</h3>
                  <p className="text-sm text-muted-foreground">Ingresa tu URL en Assets para generar el análisis.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* SEO Score */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold">Score SEO</h3>
                        <p className="text-xs text-muted-foreground">{clientInfo?.website_url}</p>
                      </div>
                      <div className={`text-4xl font-bold ${
                        (research.seo_audit.score || 0) >= 70 ? 'text-green-500' :
                        (research.seo_audit.score || 0) >= 40 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {research.seo_audit.score || '?'}<span className="text-lg text-muted-foreground">/100</span>
                      </div>
                    </div>
                    <Progress value={research.seo_audit.score || 0} className="h-3" />
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  {research.seo_audit.issues?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-red-500">
                          <AlertTriangle className="h-4 w-4" />
                          Problemas Encontrados
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="text-sm space-y-1.5">
                          {research.seo_audit.issues.map((issue: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-red-400 mt-0.5">⚠️</span>
                              <span>{issue}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {research.seo_audit.recommendations?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-green-600">
                          <Lightbulb className="h-4 w-4" />
                          Recomendaciones
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="text-sm space-y-1.5">
                          {research.seo_audit.recommendations.map((rec: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-green-500 mt-0.5">✅</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {(research.seo_audit.meta_analysis || research.seo_audit.content_quality) && (
                  <Card>
                    <CardContent className="pt-6 space-y-3">
                      {research.seo_audit.meta_analysis && (
                        <div>
                          <p className="text-xs font-medium mb-1">Meta Tags & Estructura</p>
                          <p className="text-sm text-muted-foreground">{research.seo_audit.meta_analysis}</p>
                        </div>
                      )}
                      {research.seo_audit.content_quality && (
                        <div>
                          <p className="text-xs font-medium mb-1">Calidad de Contenido</p>
                          <p className="text-sm text-muted-foreground">{research.seo_audit.content_quality}</p>
                        </div>
                      )}
                      {research.seo_audit.mobile_readiness && (
                        <div>
                          <p className="text-xs font-medium mb-1">Responsividad Móvil</p>
                          <p className="text-sm text-muted-foreground">{research.seo_audit.mobile_readiness}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* Keywords Tab */}
          <TabsContent value="keywords" className="space-y-4">
            {!research.keywords ? (
              <Card className="text-center py-10">
                <CardContent>
                  <Key className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-2">Sin Análisis de Keywords</h3>
                  <p className="text-sm text-muted-foreground">Ejecuta el análisis desde Assets para ver keywords.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {research.keywords.primary?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        Keywords Principales
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {research.keywords.primary.map((kw: string, i: number) => (
                          <Badge key={i} variant="default" className="text-xs">{kw}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {research.keywords.long_tail?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Search className="h-4 w-4 text-primary" />
                        Long-tail Keywords
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {research.keywords.long_tail.map((kw: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {research.keywords.competitor_keywords?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-primary" />
                        Keywords de Competidores
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {research.keywords.competitor_keywords.map((kw: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {research.keywords.recommended_strategy && (
                  <Card className="md:col-span-2 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Estrategia Recomendada
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{research.keywords.recommended_strategy}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
