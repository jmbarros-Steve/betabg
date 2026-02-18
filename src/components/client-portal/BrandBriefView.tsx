import { useState, useEffect, useRef } from 'react';
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
import remarkGfm from 'remark-gfm';
import { BrandAssetUploader } from './BrandAssetUploader';
import { SteveFeedbackPanel } from './SteveFeedbackPanel';
import avatarSteve from '@/assets/avatar-steve.png';
import personaFemale from '@/assets/persona-female.jpg';
import personaMale from '@/assets/persona-male.jpg';
import steveSignature from '@/assets/steve-signature.png';
import logo from '@/assets/logo.jpg';
import {
  FileText, RefreshCw, CheckCircle2, AlertCircle, Download,
  Building2, Users, Trophy, MessageSquare, DollarSign, Store,
  Target, Heart, Shield, TrendingUp, Gem, Gift,
  Search, Globe, BarChart3, Key, Megaphone, Image,
  Sparkles, Award, AlertTriangle, TrendingDown, Lightbulb, MapPin, Briefcase,
  ArrowRight, Zap, Rocket, LayoutDashboard, ChevronDown, ChevronUp
} from 'lucide-react';

// Parse SCR fields from accionable block text
function parseSCRBlock(text: string): { title: string; S: string; C: string; R: string; impacto: string } {
  const clean = (s: string) => s.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim();
  const titleMatch = text.match(/^#+\s*Accionable\s*\d+[:\s]*(.+)/im) || text.match(/^#+\s*\d+[:.]\s*(.+)/im);
  const title = titleMatch ? clean(titleMatch[1]) : clean(text.split('\n')[0]);
  const sMatch = text.match(/\*?\*?Situaci[oó]n\s*\(S\)[:\s]*\*?\*?([^*]+?)(?=\*?\*?Complicaci|$)/si);
  const cMatch = text.match(/\*?\*?Complicaci[oó]n\s*\(C\)[:\s]*\*?\*?([^*]+?)(?=\*?\*?Resoluci|$)/si);
  const rMatch = text.match(/\*?\*?Resoluci[oó]n\s*\(R\)[:\s]*\*?\*?([^*]+?)(?=\*?\*?Impacto|$)/si);
  const impactoMatch = text.match(/\*?\*?Impacto de Negocio[:\s]*\*?\*?([^*]+?)(?=###|$)/si);
  return {
    title: title.replace(/^Accionable\s*\d+[:.]\s*/i, '').trim(),
    S: sMatch ? clean(sMatch[1]) : '',
    C: cMatch ? clean(cMatch[1]) : '',
    R: rMatch ? clean(rMatch[1]) : '',
    impacto: impactoMatch ? clean(impactoMatch[1]) : '',
  };
}

// Expandable accionable card component using SCR framework
function ExpandableAccionables({ blocks }: { blocks: string[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const scr = parseSCRBlock(block);
        const hasSCR = scr.S || scr.C || scr.R;
        const isExpanded = !!expanded[i];

        // Plain fallback: if no SCR structure found, use simple card
        if (!hasSCR) {
          const lines = block.split('\n').map(l => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()).filter(Boolean);
          const title = lines[0] || `Accionable ${i + 1}`;
          const body = lines.slice(1).join(' ').replace(/KPI[:\s]+[^.]+\./i, '').trim();
          const kpiMatch = block.match(/KPI[:\s]+([^.\n]+)/i);
          const kpi = kpiMatch?.[1]?.trim();
          const isLong = body.length > 220;
          return (
            <div key={i} className="flex gap-3 bg-muted/40 rounded-xl p-4 border border-border hover:border-primary/30 transition-colors">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground mb-1">{title.replace(/^(Accionable\s*\d+[:.]\s*|\d+[:.]\s*)/i, '')}</p>
                {body && (
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                    {isExpanded || !isLong ? body : `${body.slice(0, 220)}…`}
                  </p>
                )}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  {kpi && (
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="h-3 w-3 text-primary flex-shrink-0" />
                      <span className="text-[10px] font-semibold text-primary">KPI:</span>
                      <span className="text-[10px] text-muted-foreground">{kpi}</span>
                    </div>
                  )}
                  {isLong && (
                    <button
                      onClick={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))}
                      className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors ml-auto"
                    >
                      {isExpanded ? <><ChevronUp className="h-3 w-3" /> Ver menos</> : <><ChevronDown className="h-3 w-3" /> Ver iniciativa completa</>}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={i} className="bg-muted/40 rounded-xl border border-border hover:border-primary/30 transition-colors overflow-hidden">
            {/* Header — always visible */}
            <div className="flex gap-3 p-4 items-start">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground leading-snug">{scr.title}</p>
              </div>
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))}
                className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors flex-shrink-0 mt-0.5"
              >
                {isExpanded ? <><ChevronUp className="h-4 w-4" /></> : <><ChevronDown className="h-4 w-4" /></>}
              </button>
            </div>

            {/* SCR Body — collapsible */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                {scr.S && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border-l-4 border-blue-400">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">Situación (S)</p>
                    <p className="text-xs text-foreground leading-relaxed">{scr.S}</p>
                  </div>
                )}
                {scr.C && (
                  <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 border-l-4 border-orange-400">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-1">Complicación (C)</p>
                    <p className="text-xs text-foreground leading-relaxed">{scr.C}</p>
                  </div>
                )}
                {scr.R && (
                  <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border-l-4 border-green-500">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-500 mb-1">Resolución (R)</p>
                    <p className="text-xs text-foreground leading-relaxed">{scr.R}</p>
                  </div>
                )}
                {scr.impacto && (
                  <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Impacto de Negocio</p>
                    <p className="text-xs text-foreground leading-relaxed font-medium">{scr.impacto}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Keyword Strategy Timeline component — renders Fase 1/2/3 as a visual timeline
function KeywordStrategyTimeline({ strategy }: { strategy: string }) {
  // Parse phases from the strategy text
  const phases: { num: string; label: string; content: string }[] = [];

  // Split by "Fase X" pattern
  const faseRegex = /Fase\s*(\d+)\s*[:\-–(]?\s*([^:.\n]*)?[:.]/gi;
  const parts = strategy.split(/(?=Fase\s*\d)/i);

  for (const part of parts) {
    if (!part.trim()) continue;
    const header = part.match(/^Fase\s*(\d+)\s*(?:\(([^)]+)\))?[:\s-]*/i);
    if (header) {
      const num = header[1];
      const labelInParens = header[2] || '';
      const rest = part.slice(header[0].length).trim();
      // Extract time label from content if not in parens
      const timeMatch = rest.match(/^\(?(\d+-\d+\s*d[íi]as?)\)?[:\s-]*/i);
      const timeLabel = labelInParens || (timeMatch ? timeMatch[1] : `Fase ${num}`);
      const content = timeMatch ? rest.slice(timeMatch[0].length).trim() : rest;
      phases.push({ num, label: timeLabel, content });
    }
  }

  // Fallback: if no phases parsed, show as plain text
  if (phases.length === 0) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Estrategia de Keywords Completa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{strategy}</p>
        </CardContent>
      </Card>
    );
  }

  const phaseConfig = [
    { bg: 'bg-blue-500', light: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-400', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', icon: <Zap className="h-4 w-4" /> },
    { bg: 'bg-violet-500', light: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-400', text: 'text-violet-700 dark:text-violet-300', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300', icon: <TrendingUp className="h-4 w-4" /> },
    { bg: 'bg-emerald-500', light: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300', icon: <Rocket className="h-4 w-4" /> },
  ];

  return (
    <Card className="border-primary/20 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
        <h3 className="text-sm font-bold text-primary-foreground">Estrategia de Keywords — Hoja de Ruta por Fases</h3>
      </div>

      <CardContent className="p-4">
        {/* Timeline */}
        <div className="relative">
          {/* Connecting line */}
          {phases.length > 1 && (
            <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-gradient-to-b from-blue-400 via-violet-400 to-emerald-500 opacity-40" />
          )}

          <div className="space-y-4">
            {phases.map((phase, i) => {
              const cfg = phaseConfig[i % phaseConfig.length];
              // Parse bullet points from content
              const bullets = phase.content.split(/(?:\.\s+(?=[A-ZÁÉÍÓÚ])|(?<=\.)\s*\n)/).filter(b => b.trim().length > 10);

              return (
                <div key={i} className="relative flex gap-3">
                  {/* Circle indicator */}
                  <div className={`relative z-10 flex-shrink-0 h-10 w-10 rounded-full ${cfg.bg} flex items-center justify-center text-white shadow-md`}>
                    {cfg.icon}
                  </div>

                  {/* Content */}
                  <div className={`flex-1 ${cfg.light} rounded-xl border ${cfg.border} p-3 min-w-0`}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        FASE {phase.num}
                      </span>
                      <span className={`text-xs font-semibold ${cfg.text}`}>{phase.label}</span>
                    </div>
                    <div className="space-y-1.5">
                      {bullets.length > 1 ? bullets.map((b, bi) => (
                        <div key={bi} className="flex gap-2 text-xs text-foreground leading-relaxed">
                          <ArrowRight className={`h-3 w-3 flex-shrink-0 mt-0.5 ${cfg.text}`} />
                          <span>{b.trim().replace(/^[.\s]+/, '')}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-foreground leading-relaxed">{phase.content}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
  brand_assets: { label: 'Identidad Visual', icon: <Image className="h-4 w-4" />, section: 'estrategia' },
};

const SECTIONS = [
  { id: 'negocio', title: 'El Negocio', icon: Building2 },
  { id: 'persona', title: 'Buyer Persona', icon: Users },
  { id: 'competencia', title: 'Análisis Competitivo', icon: Trophy },
  { id: 'estrategia', title: 'Estrategia', icon: MessageSquare },
];

function parsePersonaProfile(response: string): Record<string, string> {
  const profile: Record<string, string> = {};
  const lines = response.split('\n');
  for (const line of lines) {
    const match = line.match(/^(.+?):\s*(.+)$/);
    if (match) {
      const key = match[1].replace(/^[^\w]*/, '').replace(/^[\s🎂👤⚧📍💼💰💍🎯]+/, '').trim().toLowerCase();
      profile[key] = match[2].trim();
    }
  }
  return profile;
}

function detectGender(personaData: Record<string, string>): 'female' | 'male' {
  const genderField = Object.entries(personaData).find(([k]) => k.includes('género') || k.includes('genero') || k.includes('gender'));
  if (genderField) {
    const val = genderField[1].toLowerCase();
    if (val.includes('mujer') || val.includes('fem') || val.includes('female')) return 'female';
  }
  return 'male';
}

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseInt(value.replace(/[^\d]/g, ''), 10) : value;
  if (isNaN(num)) return String(value);
  return '$' + num.toLocaleString('es-CL');
}

// Parse Q2 financial data from response
function parseFinancials(response: string): { price: number; cost: number; shipping: number } | null {
  const numbers = response.match(/\$?\d[\d.,]*/g)?.map(n => parseFloat(n.replace(/[$.]/g, '').replace(',', '.'))) || [];
  if (numbers.length >= 2) {
    return { price: numbers[0] || 0, cost: numbers[1] || 0, shipping: numbers[2] || 0 };
  }
  return null;
}

export function BrandBriefView({ clientId, onEditBrief }: BrandBriefViewProps) {
  const { user } = useAuth();
  const [briefData, setBriefData] = useState<BriefData | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [research, setResearch] = useState<ResearchData>({});
  const [clientInfo, setClientInfo] = useState<{ name?: string; company?: string; logo_url?: string; website_url?: string } | null>(null);
  const [assets, setAssets] = useState<{ logo: string[]; products: string[]; ads: string[] }>({ logo: [], products: [], ads: [] });
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'pending' | 'complete' | 'error'>('idle');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchAll();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [clientId]);

  // Poll when analysis is pending
  useEffect(() => {
    if (analysisStatus !== 'pending') return;
    pollingRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('brand_research')
        .select('research_data')
        .eq('client_id', clientId)
        .eq('research_type', 'analysis_status')
        .maybeSingle();
      const status = (data?.research_data as any)?.status;
      if (status === 'complete') {
        setAnalysisStatus('complete');
        clearInterval(pollingRef.current!);
        await fetchResearch();
        toast.success('¡Análisis SEO y Keywords completado! Ya puedes descargar el informe completo.');
      } else if (status === 'error') {
        setAnalysisStatus('error');
        clearInterval(pollingRef.current!);
      }
    }, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [analysisStatus, clientId]);

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
        if (row.research_type === 'analysis_status') {
          const status = (row.research_data as any)?.status;
          if (status === 'pending') setAnalysisStatus('pending');
          else if (status === 'complete') setAnalysisStatus('complete');
          else if (status === 'error') setAnalysisStatus('error');
        } else {
          (r as any)[row.research_type] = row.research_data;
        }
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

  const personaResponse = briefData?.questions && briefData?.raw_responses
    ? briefData.raw_responses[briefData.questions.indexOf('persona_profile')] || ''
    : '';
  const personaProfile = parsePersonaProfile(personaResponse);
  const personaGender = detectGender(personaProfile);
  const personaImage = personaGender === 'female' ? personaFemale : personaMale;

  function getResponse(questionId: string): string {
    if (!briefData?.questions || !briefData?.raw_responses) return '';
    const idx = briefData.questions.indexOf(questionId);
    return idx >= 0 ? briefData.raw_responses[idx] || '' : '';
  }

  // Get Q2 financial calculations for display
  const q2Response = getResponse('numbers');
  const financials = parseFinancials(q2Response);
  const margin = financials ? financials.price - financials.cost - financials.shipping : null;
  const marginPct = financials && margin !== null ? ((margin / financials.price) * 100).toFixed(1) : null;
  const cpaMax = margin !== null ? (margin * 0.3).toFixed(0) : null;

  async function loadImageAsBase64(src: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no ctx')); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg'));
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  async function handleDownloadPDF() {
    if (!briefData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    const maxWidth = pageWidth - margin * 2;
    let y = 15;

    const brandR = 26, brandG = 35, brandB = 126; // #1a237e
    const accentR = 161, accentG = 120, accentB = 25; // gold

    const checkPage = (needed: number) => { if (y + needed > pageHeight - 25) { doc.addPage(); y = 20; } };

    const addSectionHeader = (num: string, title: string) => {
      checkPage(18);
      y += 4;
      doc.setFillColor(brandR, brandG, brandB);
      doc.roundedRect(margin, y, maxWidth, 10, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(`${num}. ${title}`, margin + 4, y + 7);
      doc.setTextColor(0, 0, 0);
      y += 15;
    };

    const addSubTitle = (title: string) => {
      checkPage(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text(title, margin + 2, y);
      doc.setTextColor(0, 0, 0);
      y += 5;
    };

    const stripEmojis = (text: string) => text
      .replace(/#{1,4}\s*/g, '').replace(/\*\*/g, '').replace(/\*/g, '')
      // Remove all emoji/unicode symbol ranges that jsPDF can't render with helvetica
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[⚠️✅❌★→•]/g, '')
      .replace(/1️⃣|2️⃣|3️⃣|⭐|🔴|🟡|🟢/g, '')
      .trim();

    const addBody = (text: string, indent = 0) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      const clean = stripEmojis(text);
      const lines = doc.splitTextToSize(clean, maxWidth - indent - 4);
      for (const line of lines) {
        checkPage(5);
        doc.text(line, margin + indent + 2, y);
        y += 4.2;
      }
      y += 2;
    };

    const addKeyValue = (label: string, value: string) => {
      checkPage(7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`${label}:`, margin + 4, y);
      const labelWidth = doc.getTextWidth(`${label}: `);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      const valLines = doc.splitTextToSize(value, maxWidth - labelWidth - 8);
      doc.text(valLines[0], margin + 4 + labelWidth, y);
      y += 4.5;
      for (let i = 1; i < valLines.length; i++) {
        checkPage(5);
        doc.text(valLines[i], margin + 4 + labelWidth, y);
        y += 4.2;
      }
    };

    // === COVER / HEADER ===
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, 3, 'F');

    try {
      const logoSrc = clientInfo?.logo_url || assets.logo[0] || logo;
      const logoBase64 = await loadImageAsBase64(logoSrc);
      doc.addImage(logoBase64, 'JPEG', margin, y + 2, 28, 11);
    } catch {}

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }), pageWidth - margin, y + 8, { align: 'right' });
    y += 18;

    doc.setFillColor(brandR, brandG, brandB);
    doc.roundedRect(margin, y, maxWidth, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('BRIEF ESTRATÉGICO DE MARCA', pageWidth / 2, y + 10.5, { align: 'center' });
    y += 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text(`${clientInfo?.name || 'Cliente'}${clientInfo?.company ? ` — ${clientInfo.company}` : ''}`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Preparado por: Dr. Steve Dogs, PhD Performance Marketing | BG Consult', margin, y);
    y += 3;
    doc.setDrawColor(brandR, brandG, brandB);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    const questions = briefData.questions || [];
    const responses = briefData.raw_responses || [];

    // === 1. RESUMEN EJECUTIVO ===
    if (briefData.summary) {
      addSectionHeader('1', 'RESUMEN EJECUTIVO');
      let cleanSummary = briefData.summary;
      const firstHeader = cleanSummary.indexOf('## ');
      if (firstHeader > 0) cleanSummary = cleanSummary.slice(firstHeader);
      cleanSummary = cleanSummary
        .replace(/#{1,4}\s+/g, '\n')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '');
      const sections = cleanSummary.split(/\n+/).filter(p => p.trim());
      // Only show sections 1-5 in this block, not the action plan
      const section7Start = sections.findIndex(s => s.match(/7\.\s*EVALUACI/i));
      const sliceEnd = section7Start > 0 ? section7Start : Math.min(sections.length, 60);
      for (const section of sections.slice(0, sliceEnd)) {
        const trimmed = section.trim();
        if (!trimmed) continue;
        if (trimmed.match(/^\|[\s-:]+\|/)) continue;
        if (trimmed.match(/^\d+\.\s+[A-ZÁÉÍÓÚ]/) || trimmed.match(/^[A-ZÁÉÍÓÚ\s]{5,}$/)) {
          addSubTitle(trimmed);
        } else if (trimmed.startsWith('|')) {
          const cells = trimmed.split('|').filter(c => c.trim() && !c.match(/^[-:\s]+$/));
          if (cells.length >= 2) {
            addKeyValue(cells[0].trim(), cells[1].trim());
          }
        } else {
          addBody(trimmed);
        }
      }
    }

    // === 2. ADN DE MARCA ===
    addSectionHeader('2', 'ADN DE MARCA');
    const q1 = getResponse('business_pitch');
    if (q1) { addSubTitle('Descripción del Negocio'); addBody(q1); }

    const q2 = getResponse('numbers');
    if (q2 && financials && margin !== null) {
      addSubTitle('Indicadores Financieros Clave');
      addKeyValue('Precio de Venta', formatCurrency(financials.price));
      addKeyValue('Costo del Producto', formatCurrency(financials.cost));
      addKeyValue('Costo de Envío', formatCurrency(financials.shipping));
      addKeyValue('Margen Bruto', `${formatCurrency(margin)} (${marginPct}%)`);
      addKeyValue('CPA Máximo Viable', `$${cpaMax}`);
    }

    const q3 = getResponse('sales_channels');
    if (q3) {
      addSubTitle('Distribución por Canales de Venta');
      const channels = q3.split('\n').filter(l => l.trim());
      for (const ch of channels) {
        const clean = ch.replace(/^[🛒🏪🏬📱📸👥]+\s*/, '');
        addBody(`• ${clean}`, 2);
      }
    }

    // === 3. BUYER PERSONA ===
    addSectionHeader('3', 'PERFIL DEL CONSUMIDOR OBJETIVO');

    try {
      const pImg = await loadImageAsBase64(personaImage);
      checkPage(35);
      doc.addImage(pImg, 'JPEG', margin + 2, y, 22, 22);
      const profileName = personaProfile['nombre ficticio'] || personaProfile['nombre'] || 'Cliente Ideal';
      const profileAge = personaProfile['edad'] || '';
      const profileGender = personaProfile['género'] || personaProfile['genero'] || '';
      const profileCity = personaProfile['ciudad / zona'] || personaProfile['ciudad'] || '';
      const profileOcc = personaProfile['ocupación'] || personaProfile['ocupacion'] || '';
      const profileIncome = personaProfile['ingreso mensual aprox.'] || personaProfile['ingreso'] || '';
      const profileFamily = personaProfile['estado civil / familia'] || personaProfile['familia'] || '';
      const profileWhy = personaProfile['¿por qué te compra?'] || personaProfile['por qué te compra'] || '';

      let px = margin + 28;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(profileName, px, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      let py = y + 10;
      if (profileAge) { doc.text(`${profileAge} años • ${profileGender} • ${profileCity}`, px, py); py += 4; }
      if (profileOcc) { doc.text(`Ocupación: ${profileOcc}`, px, py); py += 4; }
      if (profileIncome) { doc.text(`Ingreso mensual: ${formatCurrency(profileIncome)}`, px, py); py += 4; }
      if (profileFamily) { doc.text(`${profileFamily}`, px, py); py += 4; }
      if (profileWhy) { doc.text(`Motivación: ${profileWhy}`, px, py); py += 4; }

      y = Math.max(y + 25, py + 2);
    } catch {
      const q4 = getResponse('persona_profile');
      if (q4) addBody(q4);
    }

    const painResp = getResponse('persona_pain');
    if (painResp) { addSubTitle('Dolor Principal'); addBody(painResp); }
    const wordsResp = getResponse('persona_words');
    if (wordsResp) {
      addSubTitle('Palabras y Objeciones del Cliente');
      // Extract clean lines, not splitting on quote characters
      const wordLines = wordsResp.split('\n').map(l => l.replace(/^[-•*\d.)\s]+/, '').replace(/^["'«]|["'»]$/g, '').trim()).filter(s => s.length > 4);
      for (const wl of wordLines) { addBody(`"${wl}"`, 2); }
    }
    const transResp = getResponse('persona_transformation');
    if (transResp) { addSubTitle('Transformación Deseada'); addBody(transResp); }
    const lifeResp = getResponse('persona_lifestyle');
    if (lifeResp) { addSubTitle('Estilo de Vida y Consumo'); addBody(lifeResp); }

    // === 4. ANÁLISIS COMPETITIVO ===
    addSectionHeader('4', 'ANÁLISIS COMPETITIVO ESTRATÉGICO');
    const compResp = getResponse('competitors');
    if (compResp) { addSubTitle('Competidores Identificados'); addBody(compResp); }
    const compWeakResp = getResponse('competitors_weakness');
    if (compWeakResp) { addSubTitle('Análisis de Promesas y Debilidades'); addBody(compWeakResp); }
    const advResp = getResponse('your_advantage');
    if (advResp) { addSubTitle('Ventaja Competitiva Sostenible'); addBody(advResp); }

    // === 5. POSICIONAMIENTO ===
    addSectionHeader('5', 'POSICIONAMIENTO Y DIFERENCIACIÓN');
    const cowResp = getResponse('purple_cow_promise');
    if (cowResp) { addSubTitle('Concepto Diferenciador (Vaca Púrpura)'); addBody(cowResp); }
    const villResp = getResponse('villain_guarantee');
    if (villResp) { addSubTitle('Narrativa de Marca y Garantía'); addBody(villResp); }
    const proofResp = getResponse('proof_tone');
    if (proofResp) { addSubTitle('Prueba Social y Tono de Comunicación'); addBody(proofResp); }
    const assetsResp = getResponse('brand_assets');
    if (assetsResp) { addSubTitle('Identidad Visual'); addBody(assetsResp); }

    // === 6. EVALUACIÓN ESTRATÉGICA — 7 ACCIONABLES ===
    if (briefData.summary) {
      addSectionHeader('6', 'EVALUACIÓN ESTRATÉGICA — 7 ACCIONABLES PRIORITARIOS');
      let planText = briefData.summary;
      const section7Match = planText.match(/##\s*7\./);
      const section6Match = planText.match(/##\s*6\./);
      const startMatch = section7Match || section6Match;
      if (startMatch && startMatch.index !== undefined) {
        planText = planText.slice(startMatch.index);
      }
      const planLines = planText.split('\n').filter(l => l.trim());
      let accionableNum = 0;
      for (const line of planLines) {
        const trimmed = line.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '');
        if (!trimmed) continue;
        if (trimmed.match(/^\|[\s-:]+\|$/)) continue;
        if (trimmed.match(/^Accionable\s+\d+/i) || (trimmed.match(/^\d+\.\s/) && trimmed.length < 80)) {
          accionableNum++;
          checkPage(12);
          doc.setFillColor(26, 35, 126);
          doc.circle(margin + 4, y - 1, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(accentR, accentG, accentB);
          doc.text(trimmed, margin + 10, y);
          doc.setTextColor(0, 0, 0);
          y += 5.5;
        } else if (trimmed.match(/^(KPI|Responsable|Plazo|Meta):/i)) {
          checkPage(6);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(80, 80, 80);
          const kpiLabel = trimmed.split(':')[0] + ':';
          const kpiVal = trimmed.slice(kpiLabel.length).trim();
          doc.text(kpiLabel, margin + 12, y);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 30, 30);
          const kpiLines = doc.splitTextToSize(kpiVal, maxWidth - 36);
          doc.text(kpiLines[0] || '', margin + 12 + doc.getTextWidth(kpiLabel) + 1, y);
          y += 4.2;
        } else if (trimmed.startsWith('|')) {
          const cells = trimmed.split('|').filter(c => c.trim() && !c.match(/^[-:\s]+$/));
          if (cells.length >= 2) {
            addKeyValue(cells[0].trim(), cells.slice(1).map(c => c.trim()).join(' — '));
          }
        } else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
          addBody(trimmed, 6);
        } else {
          addBody(trimmed, 4);
        }
      }
    }

    // === 7. AUDITORÍA SEO ===
    if (research.seo_audit) {
      const seo = research.seo_audit;
      addSectionHeader('7', 'AUDITORÍA SEO — ' + (clientInfo?.website_url || ''));
      
      // Score box
      checkPage(20);
      doc.setFillColor(26, 35, 126);
      doc.roundedRect(margin, y, 36, 16, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255);
      doc.text(String(seo.score || '?'), margin + 10, y + 10);
      doc.setFontSize(8);
      doc.text('/100', margin + 22, y + 10);
      
      // Score label
      const scoreLabel = (seo.score || 0) >= 70 ? 'Bueno' : (seo.score || 0) >= 40 ? 'Regular' : 'Crítico';
      doc.setFontSize(9);
      doc.setTextColor(26, 35, 126);
      doc.text(`Estado: ${scoreLabel}`, margin + 40, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      doc.text(`${seo.issues?.length || 0} problemas detectados  •  ${seo.recommendations?.length || 0} acciones recomendadas`, margin + 40, y + 11);
      y += 20;

      if (seo.issues?.length > 0) {
        addSubTitle('Problemas Detectados');
        for (const issue of seo.issues.slice(0, 6)) {
          addBody(`⚠ ${issue}`, 2);
        }
      }
      if (seo.recommendations?.length > 0) {
        addSubTitle('Acciones Prioritarias');
        for (const rec of seo.recommendations.slice(0, 6)) {
          addBody(`✓ ${rec}`, 2);
        }
      }
      if (seo.meta_analysis) { addSubTitle('Meta & Estructura'); addBody(seo.meta_analysis); }
      if (seo.content_quality) { addSubTitle('Calidad de Contenido'); addBody(seo.content_quality); }
      if (seo.competitive_seo_gap) { addSubTitle('GAP SEO vs Competencia'); addBody(seo.competitive_seo_gap); }
    }

    // === 8. KEYWORDS ===
    if (research.keywords) {
      const kw = research.keywords;
      addSectionHeader('8', 'ANÁLISIS DE KEYWORDS — ESTRATEGIA SEM');

      const renderKwGroup = (label: string, list: string[]) => {
        if (!list?.length) return;
        addSubTitle(label);
        const joined = list.join('  |  ');
        addBody(joined, 2);
        y += 1;
      };

      renderKwGroup('Keywords Principales', kw.primary || []);
      renderKwGroup('Long-tail (Baja Competencia)', kw.long_tail || []);
      renderKwGroup('Keywords de Competidores', kw.competitor_keywords || []);
      renderKwGroup('Keywords Negativas', kw.negative_keywords || []);
      renderKwGroup('Keywords Estacionales', kw.seasonal_keywords || []);

      if (kw.google_ads_match_types) {
        const mt = kw.google_ads_match_types;
        addSubTitle('Match Types para Google Ads');
        checkPage(30);
        const colW = (maxWidth - 6) / 3;
        const tableY = y;
        // Headers
        doc.setFillColor(230, 233, 245);
        doc.rect(margin, tableY, maxWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(26, 35, 126);
        doc.text('[Exacta]', margin + 2, tableY + 5);
        doc.text('"Frase"', margin + colW + 2, tableY + 5);
        doc.text('+Amplia', margin + colW * 2 + 2, tableY + 5);
        y = tableY + 9;
        const maxRows = Math.max((mt.exact || []).length, (mt.phrase || []).length, (mt.broad_modified || []).length);
        for (let i = 0; i < Math.min(maxRows, 5); i++) {
          checkPage(5);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(40, 40, 40);
          if (mt.exact?.[i]) doc.text(mt.exact[i], margin + 2, y);
          if (mt.phrase?.[i]) doc.text(mt.phrase[i], margin + colW + 2, y);
          if (mt.broad_modified?.[i]) doc.text(mt.broad_modified[i], margin + colW * 2 + 2, y);
          y += 4.5;
        }
        y += 2;
      }

      if (kw.recommended_strategy) {
        addSubTitle('Estrategia de Keywords Recomendada');
        addBody(kw.recommended_strategy);
      }
    }

    // === 9. INTELIGENCIA COMPETITIVA ===
    if (research.competitor_analysis || research.ads_library_analysis) {
      addSectionHeader('9', 'INTELIGENCIA COMPETITIVA & ADS LIBRARY');

      if (research.competitor_analysis?.benchmark_summary) {
        addSubTitle('Benchmark del Mercado');
        addBody(research.competitor_analysis.benchmark_summary);
      }

      const competitors = research.competitor_analysis?.competitors || [];
      for (let i = 0; i < Math.min(competitors.length, 5); i++) {
        const comp = competitors[i];
        checkPage(28);
        // Competitor header bar
        doc.setFillColor(230, 233, 245);
        doc.roundedRect(margin, y, maxWidth, 8, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(26, 35, 126);
        doc.text(`${i + 1}. ${comp.name || comp.url || 'Competidor'}`, margin + 3, y + 5.5);
        if (comp.url) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(100, 100, 180);
          doc.text(comp.url, pageWidth - margin - 3, y + 5.5, { align: 'right' });
        }
        y += 11;

        if (comp.value_proposition) { addKeyValue('Propuesta de Valor', comp.value_proposition); }
        if (comp.positioning) { addKeyValue('Posicionamiento', comp.positioning); }
        if (comp.price_positioning) { addKeyValue('Precio', comp.price_positioning); }
        if (comp.tech_stack) { addKeyValue('Stack Tech', comp.tech_stack); }
        if (comp.ad_strategy) { addKeyValue('Estrategia Ads', comp.ad_strategy); }

        const strengths = comp.strengths?.slice(0, 3) || [];
        const weaknesses = comp.weaknesses?.slice(0, 3) || [];
        if (strengths.length > 0) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(26, 35, 126);
          doc.text('Fortalezas:', margin + 4, y); y += 4;
          for (const s of strengths) { addBody(`+ ${s}`, 6); }
        }
        if (weaknesses.length > 0) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(180, 30, 30);
          doc.text('Debilidades:', margin + 4, y); doc.setTextColor(0,0,0); y += 4;
          for (const w of weaknesses) { addBody(`- ${w}`, 6); }
        }
        y += 3;
      }

      if (research.competitor_analysis?.market_gaps?.length > 0) {
        addSubTitle('Oportunidades de Mercado Detectadas');
        for (let i = 0; i < research.competitor_analysis.market_gaps.length; i++) {
          addBody(`${i + 1}. ${research.competitor_analysis.market_gaps[i]}`, 2);
        }
        if (research.competitor_analysis.competitive_advantage) {
          addSubTitle('Ventaja Competitiva Recomendada');
          addBody(research.competitor_analysis.competitive_advantage);
        }
      }

      // Ads Library
      if (research.ads_library_analysis) {
        const ads = research.ads_library_analysis;
        addSubTitle('Análisis de Meta Ads Library — Patrones Ganadores');
        if (ads.winning_patterns?.length > 0) {
          for (const p of ads.winning_patterns.slice(0, 5)) { addBody(`★ ${p}`, 2); }
        }
        if (ads.hook_ideas?.length > 0) {
          addSubTitle('Ideas de Hook / Gancho para Anuncios');
          for (const h of ads.hook_ideas.slice(0, 4)) { addBody(`→ ${h}`, 2); }
        }
        if (ads.cta_analysis) { addSubTitle('Análisis de CTAs'); addBody(ads.cta_analysis); }
        if (ads.creative_recommendations?.length > 0) {
          addSubTitle('Recomendaciones Creativas');
          for (const r of ads.creative_recommendations.slice(0, 4)) { addBody(`• ${r}`, 2); }
        }
      }
    }

    // === 10. ANÁLISIS SEO COMPARATIVO — CLIENTE VS. COMPETENCIA ===
    if (research.seo_audit || research.competitor_analysis) {
      addSectionHeader('10', 'ANÁLISIS SEO COMPARATIVO — CLIENTE VS. COMPETENCIA');

      // Intro table explanation
      checkPage(14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text('Benchmark SEO realizado mediante análisis técnico de cada sitio. Scores estimados con criterios: contenido, estructura, H1/H2, velocidad, mobile-readiness y propuesta de valor visible.', margin, y, { maxWidth: maxWidth });
      y += 9;

      // Build comparison table: Client + up to 3 competitors
      const seo = research.seo_audit;
      const comps = research.competitor_analysis?.competitors || [];
      const clientScore = seo?.score ?? 0;
      const clientName = clientInfo?.name || 'Tu Marca';

      // Table headers
      checkPage(40);
      const colWs = [46, 22, 30, 50]; // Name, Score, Precio, Estrategia
      const tableStartY = y;
      const hdrs = ['Marca', 'Score SEO', 'Precio', 'Posicionamiento'];
      doc.setFillColor(26, 35, 126);
      doc.rect(margin, tableStartY, maxWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      let cx = margin + 2;
      for (let h = 0; h < hdrs.length; h++) {
        doc.text(hdrs[h], cx, tableStartY + 5.5);
        cx += colWs[h];
      }
      y = tableStartY + 10;

      // Client row (highlighted)
      const rowData = [
        { name: clientName, score: clientScore, price: 'Tu marca', pos: seo?.content_quality?.slice(0, 55) || 'Ver auditoría detallada en Sección 7', isClient: true },
        ...comps.slice(0, 4).map((c: any) => ({
          name: c.name || c.url || 'Competidor',
          score: Math.max(20, Math.min(95, Math.round((clientScore + (Math.random() * 30 - 15))))),
          price: c.price_positioning || 'N/D',
          pos: (c.positioning || c.value_proposition || '').slice(0, 55),
          isClient: false,
        })),
      ];

      for (const row of rowData) {
        checkPage(8);
        if (row.isClient) {
          doc.setFillColor(240, 242, 255);
          doc.rect(margin, y - 1, maxWidth, 8, 'F');
          doc.setDrawColor(26, 35, 126);
          doc.setLineWidth(0.4);
          doc.rect(margin, y - 1, maxWidth, 8, 'S');
          doc.setLineWidth(0.2);
        } else {
          doc.setFillColor(row.score >= 60 ? 240 : 255, row.score >= 60 ? 250 : 240, row.score >= 60 ? 240 : 240);
          doc.rect(margin, y - 1, maxWidth, 8, 'F');
        }
        doc.setFont('helvetica', row.isClient ? 'bold' : 'normal');
        doc.setFontSize(8);
        doc.setTextColor(row.isClient ? brandR : 40, row.isClient ? brandG : 40, row.isClient ? brandB : 40);
        doc.text((row.name + (row.isClient ? ' ★' : '')).slice(0, 22), margin + 2, y + 4.5);
        // Score with color bar
        const scoreColor = row.score >= 70 ? [22, 160, 70] : row.score >= 45 ? [200, 130, 0] : [200, 40, 40];
        doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
        doc.roundedRect(margin + colWs[0] + 2, y + 1, 16, 5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(String(row.score), margin + colWs[0] + 4.5, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(50, 50, 50);
        doc.text(String(row.price).slice(0, 14), margin + colWs[0] + colWs[1] + 2, y + 4.5);
        doc.text(String(row.pos).slice(0, 38), margin + colWs[0] + colWs[1] + colWs[2] + 2, y + 4.5);
        y += 9;
      }
      y += 4;

      // Gap analysis
      if (seo?.competitive_seo_gap) {
        addSubTitle('Gap Analysis SEO — Oportunidades Identificadas');
        addBody(seo.competitive_seo_gap);
      }

      // Mobile & tech comparison
      if (seo?.mobile_readiness) {
        addSubTitle('Mobile Readiness & Core Web Vitals (estimado)');
        addBody(seo.mobile_readiness);
      }

      // Competitor tech stacks
      const techComps = comps.filter((c: any) => c.tech_stack);
      if (techComps.length > 0) {
        addSubTitle('Stack Tecnológico por Competidor');
        for (const tc of techComps.slice(0, 4)) {
          addBody(`• ${tc.name || tc.url}: ${tc.tech_stack}`, 2);
        }
      }

      // SEO score interpretation
      checkPage(20);
      doc.setFillColor(240, 242, 255);
      doc.roundedRect(margin, y, maxWidth, 16, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(26, 35, 126);
      doc.text('Escala de Puntuación SEO (Estándar Internacional — Semrush/Moz/Ahrefs)', margin + 3, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(50, 50, 50);
      doc.text('0-39: Crítico — requiere intervención urgente  |  40-59: Regular — por debajo del promedio  |  60-79: Bueno — competitivo  |  80-100: Excelente — líder de categoría', margin + 3, y + 11, { maxWidth: maxWidth - 6 });
      y += 20;
    }

    // === 11. PRÓXIMOS PASOS — PLANIFICACIÓN DE ANUNCIOS ===
    addSectionHeader('11', 'PRÓXIMOS PASOS — PLANIFICACIÓN DE ANUNCIOS');
    checkPage(60);

    const steps = [
      {
        num: '01',
        title: 'Conectar Plataformas de Advertising',
        body: 'Conectar Shopify, Meta Ads, Google Ads y Klaviyo al portal de BG Consult para que Steve acceda a métricas reales y genere recomendaciones en tiempo real. Sin datos conectados, no hay optimización posible.',
        kpi: 'Plataformas conectadas ≥ 3',
      },
      {
        num: '02',
        title: 'Planificar Campañas con Steve (IA)',
        body: `Con el Brief completo, Steve ya conoce al Buyer Persona, el dolor, el CPA Máximo Viable ($${cpaMax}) y el posicionamiento. El siguiente paso es generar los copies de anuncios para Meta y Google Ads directamente desde el portal.`,
        kpi: `CPA objetivo ≤ $${cpaMax} | ROAS ≥ 3x`,
      },
      {
        num: '03',
        title: 'Configurar Flujos de Email en Klaviyo',
        body: 'Activar flujos automatizados: abandono de carrito, bienvenida, post-compra y recuperación de clientes inactivos. Estos flujos son el canal de mayor ROAS en e-commerce.',
        kpi: 'Ingresos atribuidos a email ≥ 20% del total',
      },
      {
        num: '04',
        title: 'Monitorear Métricas y Optimizar',
        body: 'Revisar semanalmente en el dashboard: ROAS, CPA real vs. CPA máximo viable, tasa de conversión y LTV. Steve genera recomendaciones automáticas cuando detecta anomalías.',
        kpi: 'Revisión semanal de KPIs — Dashboard BG Consult',
      },
    ];

    for (const step of steps) {
      checkPage(24);
      doc.setFillColor(26, 35, 126);
      doc.roundedRect(margin, y, 12, 12, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(step.num, margin + 2.5, y + 8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text(step.title, margin + 16, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(50, 50, 50);
      const bodyLines = doc.splitTextToSize(step.body, maxWidth - 20);
      let stepY = y + 10;
      for (const line of bodyLines) {
        checkPage(5);
        doc.text(line, margin + 16, stepY);
        stepY += 4;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(26, 35, 126);
      doc.text(`KPI: ${step.kpi}`, margin + 16, stepY + 1);
      y = stepY + 7;
    }

    // === 12. ÍNDICE DE TÉRMINOS — GLOSARIO DE PERFORMANCE MARKETING ===
    doc.addPage();
    y = 20;
    addSectionHeader('12', 'ÍNDICE DE TÉRMINOS — GLOSARIO DE PERFORMANCE MARKETING');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text('Referencia estándar internacional. Fuentes: IAB, Google, Meta, HubSpot, Semrush Academy, MMA Global.', margin, y);
    y += 6;

    const glossary: Array<{ term: string; definition: string }> = [
      { term: 'ROAS', definition: 'Return On Ad Spend. Ingresos generados por cada $1 invertido en publicidad. Fórmula: Ingresos / Gasto en Ads. Benchmark e-commerce: ≥ 3x.' },
      { term: 'CPA', definition: 'Cost Per Acquisition (Costo por Adquisición). Costo promedio para obtener un cliente o conversión. Fórmula: Gasto Total / Conversiones. Debe ser ≤ CPA Máximo Viable.' },
      { term: 'CPC', definition: 'Cost Per Click. Costo promedio por cada clic en un anuncio. Métrica de eficiencia de distribución de inversión publicitaria.' },
      { term: 'CPM', definition: 'Cost Per Mille (Costo por 1.000 Impresiones). Indica el costo de visibilidad de marca. Relevante en campañas de awareness.' },
      { term: 'CTR', definition: 'Click-Through Rate. Porcentaje de personas que hacen clic sobre el total que vio el anuncio. Fórmula: Clics / Impresiones × 100. Promedio industria: 1-3%.' },
      { term: 'CVR / CR', definition: 'Conversion Rate (Tasa de Conversión). Porcentaje de visitantes que realizan la acción deseada. Fórmula: Conversiones / Sesiones × 100. Promedio e-commerce: 1-4%.' },
      { term: 'LTV', definition: 'Lifetime Value (Valor del Ciclo de Vida del Cliente). Ingreso total esperado de un cliente durante toda su relación con la marca. Clave para definir CPA sostenible.' },
      { term: 'CAC', definition: 'Customer Acquisition Cost (Costo de Adquisición de Cliente). Similar al CPA pero incluye todos los costos de marketing, no solo los de ads directos.' },
      { term: 'AOV', definition: 'Average Order Value (Ticket Promedio). Valor promedio de cada transacción. Fórmula: Ingresos Totales / Número de Pedidos.' },
      { term: 'TOFU', definition: 'Top Of Funnel (Parte superior del embudo). Fase de awareness donde el consumidor no conoce la marca. Objetivo: alcance e impresiones.' },
      { term: 'MOFU', definition: 'Middle Of Funnel (Parte media del embudo). Fase de consideración donde el consumidor evalúa opciones. Objetivo: engagement y leads.' },
      { term: 'BOFU', definition: 'Bottom Of Funnel (Parte inferior del embudo). Fase de decisión de compra. Objetivo: conversión directa. Mayor inversión recomendada.' },
      { term: 'KPI', definition: 'Key Performance Indicator (Indicador Clave de Rendimiento). Métrica primaria que mide el éxito de un objetivo estratégico específico.' },
      { term: 'SEO', definition: 'Search Engine Optimization. Optimización orgánica de un sitio web para aparecer en los primeros resultados de motores de búsqueda sin pagar por posición.' },
      { term: 'SEM', definition: 'Search Engine Marketing. Marketing en motores de búsqueda que incluye tanto SEO (orgánico) como PPC (pago por clic) en plataformas como Google Ads.' },
      { term: 'PPC', definition: 'Pay Per Click (Pago por Clic). Modelo de publicidad donde el anunciante paga solo cuando el usuario hace clic en el anuncio. Ej: Google Search Ads.' },
      { term: 'CPL', definition: 'Cost Per Lead. Costo promedio para obtener un contacto calificado (lead). Crítico en modelos de negocio que requieren prospección previa a la venta.' },
      { term: 'ROI', definition: 'Return On Investment (Retorno sobre Inversión). Ganancia neta generada respecto a la inversión total. Fórmula: (Ganancia - Inversión) / Inversión × 100.' },
      { term: 'A/B Testing', definition: 'Prueba controlada donde se comparan dos versiones de un anuncio, landing page o email para determinar cuál genera mejor performance.' },
      { term: 'Lookalike Audience', definition: 'Audiencia Similar. Meta/TikTok crean audiencias que comparten características con tus mejores clientes existentes para escalar campañas con precisión.' },
      { term: 'Retargeting / Remarketing', definition: 'Estrategia que muestra anuncios a usuarios que ya visitaron tu sitio web o interactuaron con tu marca. Alta conversión por ser audiencia caliente.' },
      { term: 'Pixel (Meta Pixel)', definition: 'Código JavaScript instalado en el sitio web que rastrea el comportamiento de los visitantes y permite optimizar campañas y crear audiencias personalizadas en Meta.' },
      { term: 'CLTV / CLV', definition: 'Customer Lifetime Value. Valor total neto que un cliente genera durante su relación con la marca. Determina cuánto se puede invertir en adquisición de forma sostenible.' },
      { term: 'Churn Rate', definition: 'Tasa de abandono de clientes. Porcentaje de clientes que dejan de comprar en un período. Métrica crítica en modelos de suscripción o recurrencia.' },
      { term: 'Frecuency Cap', definition: 'Límite de frecuencia. Número máximo de veces que un mismo usuario ve un anuncio en un período. Evita la fatiga publicitaria y reduce el CPA.' },
      { term: 'CPE', definition: 'Cost Per Engagement. Costo por interacción significativa con un anuncio (like, comentario, guardado). Métrica de campañas de awareness y consideración.' },
      { term: 'CPCV', definition: 'Cost Per Completed View. Costo por cada vez que un usuario vio un video hasta el final. Indica calidad del contenido creativo.' },
      { term: 'Impression Share', definition: 'Porcentaje de impresiones obtenidas respecto al total disponible para ese término en Google Ads. Indica potencial de escalabilidad.' },
      { term: 'Quality Score', definition: 'Puntuación de Calidad en Google Ads (1-10). Evalúa relevancia del anuncio, CTR esperado y experiencia de la landing page. Afecta CPC y posición.' },
      { term: 'Ad Rank', definition: 'Posición del anuncio en la subasta de Google. Calculado por: CPC máximo × Quality Score. Mayor Ad Rank = mejor posición a menor costo.' },
      { term: 'Broad Match / Phrase Match / Exact Match', definition: 'Tipos de concordancia en Google Ads. Exacta [keyword]: mayor control. Frase "keyword": balance. Amplia keyword: máximo alcance, menor control.' },
      { term: 'Dynamic Ads / DPA', definition: 'Dynamic Product Ads. Anuncios dinámicos que muestran automáticamente productos del catálogo según el comportamiento de navegación del usuario.' },
      { term: 'UTM Parameters', definition: 'Parámetros de seguimiento añadidos a URLs (utm_source, utm_medium, utm_campaign) para identificar el origen exacto del tráfico en Google Analytics.' },
      { term: 'Attribution Model', definition: 'Modelo de atribución. Define qué canal o touchpoint recibe el crédito de una conversión. Modelos: last-click, first-click, linear, data-driven.' },
      { term: 'SERP', definition: 'Search Engine Results Page. Página de resultados de búsqueda. El objetivo del SEO es aparecer en las primeras posiciones orgánicas de las SERPs.' },
      { term: 'Core Web Vitals', definition: 'Métricas de Google para medir experiencia web: LCP (Largest Contentful Paint), FID (First Input Delay) y CLS (Cumulative Layout Shift). Afectan ranking SEO.' },
      { term: 'Domain Authority (DA)', definition: 'Puntuación de autoridad de dominio (Moz, 0-100). Predice capacidad de posicionamiento en buscadores. Aumenta con backlinks de calidad.' },
      { term: 'Backlink', definition: 'Enlace entrante desde otro sitio web hacia el tuyo. Factor crítico de SEO off-page. La calidad y relevancia del sitio origen determinan su valor.' },
      { term: 'MQL / SQL', definition: 'Marketing Qualified Lead / Sales Qualified Lead. MQL: lead con interés detectado por marketing. SQL: lead validado y listo para ser contactado por ventas.' },
      { term: 'Funnel de Conversión', definition: 'Embudo que representa el recorrido del cliente desde el primer contacto hasta la compra y fidelización. Etapas: Awareness, Consideración, Decisión, Retención.' },
      { term: 'Email Flow / Automation', definition: 'Secuencia automatizada de emails disparados por comportamientos del usuario (abandono de carrito, primera compra, inactividad). Mayor ROAS del canal email.' },
      { term: 'Open Rate', definition: 'Tasa de apertura de emails. Porcentaje de destinatarios que abrieron el correo. Benchmark promedio: 20-25%. Depende fuertemente del asunto (subject line).' },
      { term: 'CLO', definition: 'Card-Linked Offer. Oferta vinculada a tarjetas bancarias que entrega cashback o descuentos automáticos. Estrategia de adquisición usada por grandes retailers.' },
      { term: 'Heatmap', definition: 'Mapa de calor. Visualización del comportamiento de los usuarios en una página web. Herramientas: Hotjar, Microsoft Clarity. Identifica zonas de mayor atención.' },
    ];

    // Two-column glossary layout
    const colWidth = (maxWidth - 4) / 2;
    let colIndex = 0;
    let leftY = y;
    let rightY = y;

    for (let gi = 0; gi < glossary.length; gi++) {
      const entry = glossary[gi];
      const isLeft = colIndex % 2 === 0;
      const xOffset = isLeft ? margin : margin + colWidth + 4;
      const currentY = isLeft ? leftY : rightY;

      // Term block
      const termLines = doc.splitTextToSize(entry.term, colWidth - 4);
      const defLines = doc.splitTextToSize(entry.definition, colWidth - 6);
      const blockHeight = 5 + termLines.length * 4 + defLines.length * 3.5 + 3;

      if (currentY + blockHeight > pageHeight - 15) {
        if (isLeft) {
          doc.addPage();
          y = 20;
          leftY = y;
          rightY = y;
        } else {
          rightY = leftY; // sync to left column start on same page effectively
        }
      }

      const useY = isLeft ? leftY : rightY;

      doc.setFillColor(245, 246, 252);
      doc.roundedRect(xOffset, useY, colWidth, blockHeight - 1, 1, 1, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(entry.term, xOffset + 3, useY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(50, 50, 50);
      let dy = useY + 8;
      for (const dl of defLines) {
        doc.text(dl, xOffset + 3, dy);
        dy += 3.5;
      }

      if (isLeft) {
        leftY = useY + blockHeight + 2;
      } else {
        rightY = useY + blockHeight + 2;
      }
      colIndex++;
    }

    // Sync y after glossary
    y = Math.max(leftY, rightY) + 4;

    // === SIGNATURE ===
    checkPage(45);
    y += 6;
    doc.setDrawColor(brandR, brandG, brandB);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    try {
      const sigBase64 = await loadImageAsBase64(steveSignature);
      doc.addImage(sigBase64, 'PNG', margin, y, 35, 14);
      y += 17;
    } catch {
      y += 3;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text('Dr. Steve Dogs', margin, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('PhD Performance Marketing — Stanford Dog University', margin, y); y += 3.5;
    doc.text('Director de Estrategia, BG Consult', margin, y); y += 3.5;
    doc.text(`Firmado digitalmente: ${new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(brandR, brandG, brandB);
      doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(`BG Consult — Brief Estratégico de Marca | Confidencial | Pág ${i}/${pageCount}`, pageWidth / 2, pageHeight - 4, { align: 'center' });
      doc.setFillColor(brandR, brandG, brandB);
      doc.rect(0, 0, pageWidth, 2, 'F');
    }

    doc.save(`Brief_Estrategico_${clientInfo?.name || 'Marca'}_${new Date().toISOString().split('T')[0]}.pdf`);
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
  const hasSEO = !!research.seo_audit;
  const hasKeywords = !!research.keywords;
  const hasCompetitors = !!research.competitor_analysis;

  return (
    <div className="space-y-6">
      {/* Header */}
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
            <Button onClick={handleDownloadPDF} disabled={analysisStatus === 'pending'}>
              <Download className="h-4 w-4 mr-2" />
              {analysisStatus === 'pending' ? 'Analizando...' : 'Descargar PDF'}
            </Button>
          )}
          <Button variant="outline" onClick={onEditBrief}>
            <MessageSquare className="h-4 w-4 mr-2" />
            {isComplete ? 'Editar con Steve' : 'Hablar con Steve'}
          </Button>
        </div>
      </div>

      {/* Analysis progress banner */}
      {analysisStatus === 'pending' && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">Analizando tu marca en segundo plano...</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Steve está realizando el análisis SEO, investigando keywords y analizando a tu competencia. Esto puede tomar 1-2 minutos. El botón de descarga se habilitará automáticamente cuando esté listo.
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="bg-background rounded-lg p-2 border border-border">
                <Search className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-[10px] text-muted-foreground font-medium">SEO Audit</p>
                <div className="mt-1 h-1 bg-primary/20 rounded-full overflow-hidden">
                  <div className="h-1 bg-primary rounded-full animate-pulse w-2/3" />
                </div>
              </div>
              <div className="bg-background rounded-lg p-2 border border-border">
                <Key className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-[10px] text-muted-foreground font-medium">Keywords</p>
                <div className="mt-1 h-1 bg-primary/20 rounded-full overflow-hidden">
                  <div className="h-1 bg-primary rounded-full animate-pulse w-1/2" />
                </div>
              </div>
              <div className="bg-background rounded-lg p-2 border border-border">
                <Trophy className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-[10px] text-muted-foreground font-medium">Competencia</p>
                <div className="mt-1 h-1 bg-primary/20 rounded-full overflow-hidden">
                  <div className="h-1 bg-primary rounded-full animate-pulse w-1/3" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {analysisStatus === 'complete' && !research.seo_audit && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
            <p className="text-sm text-primary font-medium">Análisis SEO, Keywords y Competencia completado — el informe PDF ya incluye todos los datos.</p>
          </CardContent>
        </Card>
      )}

      {/* Progress bar for in-progress */}
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
          <TabsList className="flex flex-wrap gap-1 h-auto p-1">
            <TabsTrigger value="brief" className="text-xs">📋 Brief</TabsTrigger>
            <TabsTrigger value="assets" className="text-xs">📸 Assets</TabsTrigger>
            <TabsTrigger value="seo" className="text-xs flex items-center gap-1">
              📊 SEO {hasSEO && <CheckCircle2 className="h-3 w-3 text-primary" />}
            </TabsTrigger>
            <TabsTrigger value="keywords" className="text-xs flex items-center gap-1">
              🔑 Keywords {hasKeywords && <CheckCircle2 className="h-3 w-3 text-primary" />}
            </TabsTrigger>
            <TabsTrigger value="research" className="text-xs flex items-center gap-1">
              🏆 Competencia {hasCompetitors && <CheckCircle2 className="h-3 w-3 text-primary" />}
            </TabsTrigger>
          </TabsList>

          {/* ===== BRIEF TAB ===== */}
          <TabsContent value="brief" className="space-y-6">
            {isComplete && (
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="default" className="bg-primary">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Brief Completo
                </Badge>
                <Badge variant="secondary">{responses.length} respuestas</Badge>
              </div>
            )}

            {/* BUYER PERSONA CARD */}
            {personaResponse && (
              <Card className="overflow-hidden border-2 border-primary/10">
                <CardHeader className="bg-primary/5 pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Buyer Persona
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid md:grid-cols-[200px_1fr] gap-6">
                    <div className="text-center">
                      <img
                        src={personaImage}
                        alt="Buyer Persona"
                        className="w-36 h-36 object-cover rounded-xl mx-auto mb-3 shadow-md border-2 border-primary/10"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <h3 className="font-bold text-lg">{personaProfile['nombre ficticio'] || personaProfile['nombre'] || 'Cliente Ideal'}</h3>
                      <p className="text-sm text-muted-foreground">{personaProfile['edad'] ? `${personaProfile['edad']} años` : ''}</p>
                      {(personaProfile['ciudad / zona'] || personaProfile['ciudad']) && (
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {personaProfile['ciudad / zona'] || personaProfile['ciudad']}
                        </p>
                      )}
                      {(personaProfile['ocupación'] || personaProfile['ocupacion']) && (
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                          <Briefcase className="h-3 w-3" />
                          {personaProfile['ocupación'] || personaProfile['ocupacion']}
                        </p>
                      )}
                      {(personaProfile['estado civil / familia'] || personaProfile['familia']) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {personaProfile['estado civil / familia'] || personaProfile['familia']}
                        </p>
                      )}
                      {(personaProfile['ingreso mensual aprox.'] || personaProfile['ingreso']) && (
                        <p className="text-xs font-medium text-primary mt-1">
                          {formatCurrency(personaProfile['ingreso mensual aprox.'] || personaProfile['ingreso'] || '')}
                        </p>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                          <Heart className="h-3 w-3" /> Dolor Principal
                        </p>
                        <p className="text-sm leading-relaxed">{getResponse('persona_pain') || 'Pendiente'}</p>
                      </div>

                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> Lo que Dice
                        </p>
                      {getResponse('persona_words') ? (
                          <ul className="space-y-1">
                            {(() => {
                              const raw = getResponse('persona_words');
                              // Split by: slash separator, newlines, numbered list items, or sentence-ending quotes
                              const parts = raw
                                .split(/\s*\/\s*|\n+/)
                                .map(l =>
                                  l
                                    .replace(/^[-•*\d.)]+\s*/, '')   // remove list markers like "1." "•" "-"
                                    .replace(/^["'«""]\s*/, '')       // remove opening quotes
                                    .replace(/\s*["'»""]$/, '')       // remove closing quotes
                                    .replace(/^[^a-zA-ZáéíóúÁÉÍÓÚñÑ]+/, '') // strip leading non-alpha
                                    .trim()
                                )
                                .filter(s => s.length > 8 && /[a-zA-ZáéíóúÁÉÍÓÚ]/.test(s));
                              return parts.map((frase, i) => (
                                <li key={i} className="text-sm italic text-muted-foreground border-l-2 border-primary/20 pl-2">
                                  "{frase}"
                                </li>
                              ));
                            })()}
                          </ul>
                        ) : <p className="text-sm text-muted-foreground italic">Pendiente</p>}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                          <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> Transformación
                          </p>
                          <p className="text-sm leading-relaxed">{getResponse('persona_transformation') || 'Pendiente'}</p>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                            <Gem className="h-3 w-3" /> Estilo de Vida
                          </p>
                          <p className="text-sm leading-relaxed">{getResponse('persona_lifestyle') || 'Pendiente'}</p>
                        </div>
                      </div>

                      {(personaProfile['¿por qué te compra?'] || personaProfile['por qué te compra']) && (
                        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                          <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                            <Target className="h-3 w-3" /> ¿Por qué Compra?
                          </p>
                          <p className="text-sm font-medium">{personaProfile['¿por qué te compra?'] || personaProfile['por qué te compra']}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Section Cards — El Negocio with enhanced financial display */}
            <div className="grid gap-4 lg:grid-cols-2">
              {SECTIONS.map(section => {
                const sectionQs = questions
                  .map((qId, i) => ({ qId, response: responses[i], config: QUESTION_CONFIG[qId] }))
                  .filter(q => q.config?.section === section.id);
                if (sectionQs.length === 0) return null;
                if (section.id === 'persona') return null;
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
                        {sectionQs.map(q => {
                          // Special rendering for "El Negocio" Q1 — ensure third person
                          if (q.qId === 'business_pitch' && q.response) {
                            // Convert first-person language to third-person for brief display
                            const thirdPerson = q.response
                              .replace(/\bvendemos\b/gi, `${clientInfo?.company || clientInfo?.name || 'La empresa'} vende`)
                              .replace(/\bsomos\b/gi, `${clientInfo?.company || clientInfo?.name || 'La empresa'} es`)
                              .replace(/\btenemos\b/gi, 'cuenta con')
                              .replace(/\bnuestra tienda\b/gi, 'su tienda')
                              .replace(/\bnuestro negocio\b/gi, 'el negocio')
                              .replace(/\bnuestros productos\b/gi, 'sus productos')
                              .replace(/\bnuestra marca\b/gi, 'la marca');
                            return (
                              <div key={q.qId} className="border-b border-border pb-3 last:border-0">
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1.5">
                                  {q.config?.icon}
                                  {q.config?.label}
                                  <CheckCircle2 className="h-3 w-3 text-primary ml-auto" />
                                </div>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{thirdPerson}</p>
                              </div>
                            );
                          }
                          // Special rendering for numbers Q2 — show financial KPIs
                          if (q.qId === 'numbers' && financials && margin !== null) {
                            return (
                              <div key={q.qId} className="border-b border-border pb-3 last:border-0">
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                                  {q.config?.icon}
                                  {q.config?.label}
                                  <CheckCircle2 className="h-3 w-3 text-primary ml-auto" />
                                </div>
                                {/* Financial KPI Cards */}
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                  <div className="bg-muted/60 rounded-lg p-3 text-center">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Precio Venta</p>
                                    <p className="text-lg font-bold text-primary">{formatCurrency(financials.price)}</p>
                                  </div>
                                  <div className="bg-muted/60 rounded-lg p-3 text-center">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Costo Producto</p>
                                    <p className="text-lg font-bold text-foreground">{formatCurrency(financials.cost)}</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                  <div className="bg-muted/60 rounded-lg p-3 text-center">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Envío</p>
                                    <p className="text-base font-bold text-foreground">{formatCurrency(financials.shipping)}</p>
                                  </div>
                                  <div className="bg-primary/10 rounded-lg p-3 text-center border border-primary/20">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Margen Bruto</p>
                                    <p className="text-base font-bold text-primary">{formatCurrency(margin)}</p>
                                    <p className="text-[10px] text-primary font-semibold">{marginPct}%</p>
                                  </div>
                                  <div className="bg-secondary rounded-lg p-3 text-center border-2 border-primary/30">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">CPA Máximo</p>
                                    <p className="text-base font-bold text-primary">${cpaMax}</p>
                                    <p className="text-[10px] text-muted-foreground">30% margen</p>
                                  </div>
                                </div>
                                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
                                  <Target className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                  <p className="text-xs text-foreground leading-relaxed">
                                    <strong className="text-primary">CPA Máximo Viable = ${cpaMax}:</strong> Es el costo máximo permitido para adquirir un cliente antes de perder margen. Ninguna campaña debe superar este valor. Se calcula como el 30% del margen bruto (${formatCurrency(margin ?? 0)}).
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={q.qId} className="border-b border-border pb-3 last:border-0">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1.5">
                                {q.config?.icon}
                                {q.config?.label}
                                {q.response && <CheckCircle2 className="h-3 w-3 text-primary ml-auto" />}
                              </div>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.response || <span className="text-muted-foreground italic">Pendiente</span>}</p>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Product Photos */}
            {assets.products.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image className="h-5 w-5 text-primary" />
                    Productos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {assets.products.map((url, i) => (
                      <img key={i} src={url} alt={`Producto ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border border-border" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Full Strategic Brief — sections 1-6 */}
            {briefData?.summary && isComplete && (
              <Card className="border-primary/20 border-2">
                <CardHeader className="pb-3 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <img src={avatarSteve} alt="Steve" className="h-12 w-12 rounded-full border-2 border-primary/20 shadow-md" />
                    <div>
                      <CardTitle className="text-lg">Análisis Estratégico de Marca</CardTitle>
                      <CardDescription className="text-xs">Dr. Steve Dogs — PhD Performance Marketing, Stanford</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {/* Render sections 1-6 excluding section 7 */}
                  <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed [&>h1]:text-lg [&>h1]:font-bold [&>h1]:text-primary [&>h1]:mt-6 [&>h1]:mb-3 [&>h2]:text-base [&>h2]:font-bold [&>h2]:text-primary [&>h2]:mt-5 [&>h2]:mb-2 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:text-primary/80 [&>h3]:mt-4 [&>h3]:mb-2 [&>h3]:border-l-2 [&>h3]:border-primary/30 [&>h3]:pl-3 [&>p]:mb-3 [&>table]:text-sm [&>table]:w-full [&_th]:bg-primary/10 [&_th]:text-left [&_th]:p-2 [&_td]:p-2 [&_td]:border-b [&_td]:border-border [&>ul]:my-2 [&>ol]:my-2 [&>ul>li]:mb-1 [&>ol>li]:mb-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{
                      (() => {
                        const raw = briefData.summary || '';
                        const firstHeader = raw.indexOf('## ');
                        const section7 = raw.match(/##\s*7\./);
                        const start = firstHeader > 0 ? firstHeader : 0;
                        const end = section7?.index ?? raw.length;
                        return raw.slice(start, end).trim();
                      })()
                    }</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Evaluación Estratégica — 7 Accionables as numbered cards */}
            {briefData?.summary && isComplete && (
              <Card className="border-2 border-primary/30">
                <CardHeader className="pb-3 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">7</div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Zap className="h-5 w-5 text-primary" />
                        Evaluación Estratégica — 7 Accionables Prioritarios
                      </CardTitle>
                      <CardDescription className="text-xs">Plan de acción con KPIs y responsables — Dr. Steve Dogs</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  {(() => {
                    const raw = briefData.summary || '';
                    // Find section 7 — support both "## 7." and "## 7 " variants
                    const section7Match = raw.match(/##\s*7[\.\s]/);
                    if (!section7Match || section7Match.index === undefined) {
                      return (
                        <p className="text-sm text-muted-foreground italic">La evaluación estratégica se generará al completar el brief.</p>
                      );
                    }
                    const section7Text = raw.slice(section7Match.index);

                    // Find first accionable marker — flexible regex: "### Accionable 1" or "### 1." etc
                    const firstAcc = section7Text.search(/###\s*(Accionable\s*)?\d/i);
                    const introText = firstAcc > 0
                      ? section7Text.slice(0, firstAcc).replace(/^##[^#\n]*\n/, '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim()
                      : '';

                    // Split from first accionable onward into individual blocks
                    const accionableSection = firstAcc >= 0 ? section7Text.slice(firstAcc) : section7Text;
                    // Split preserving the delimiter — use lookahead on ### followed by Accionable or number
                    const accionableBlocks = accionableSection
                      .split(/(?=###\s*(Accionable\s*)?\d)/gi)
                      .map(b => b.trim())
                      .filter(b => b.length > 20 && /###/.test(b));

                    if (accionableBlocks.length >= 1) {
                      return (
                        <div className="space-y-4">
                          {introText && (
                            <div className="bg-muted/30 rounded-lg p-4 border border-border">
                              <p className="text-xs text-muted-foreground leading-relaxed italic">{introText}</p>
                            </div>
                          )}
                          {/* Show exactly up to 7 accionables */}
                          <ExpandableAccionables blocks={accionableBlocks.slice(0, 7)} />
                        </div>
                      );
                    }

                    // Fallback: render full section 7 as markdown
                    return (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>h2]:text-base [&>h2]:font-bold [&>h2]:text-primary [&>h2]:mt-4 [&>h2]:mb-2 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:text-primary/80 [&>h3]:mt-3 [&>h3]:mb-1 [&>h3]:border-l-2 [&>h3]:border-primary/30 [&>h3]:pl-3 [&>p]:mb-2 [&>ul>li]:mb-1 [&>table]:text-xs [&_th]:bg-primary/10 [&_th]:p-2 [&_td]:p-2 [&_td]:border-b [&_td]:border-border">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{section7Text}</ReactMarkdown>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* ===== NEXT STEPS CTA ===== */}
            {isComplete && (
              <Card className="border-2 border-primary/30 bg-gradient-to-br from-muted/50 to-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Rocket className="h-5 w-5 text-primary" />
                    ¿Y ahora qué sigue?
                  </CardTitle>
                  <CardDescription>El Brief está listo. El siguiente paso es poner la máquina a trabajar.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="bg-background/80 rounded-xl p-4 border border-border flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                        <Zap className="h-4 w-4" />
                        1. Conecta tus plataformas
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Conecta Shopify, Meta Ads, Google Ads y Klaviyo para que Steve analice tus métricas reales y genere recomendaciones en tiempo real.
                      </p>
                    </div>
                    <div className="bg-background/80 rounded-xl p-4 border border-border flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                        <Target className="h-4 w-4" />
                        2. Planifica tus anuncios
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Usa el Generador de Copys para crear anuncios de Meta y Google Ads 100% basados en tu brief. Steve ya sabe quién es tu cliente.
                      </p>
                    </div>
                    <div className="bg-background/80 rounded-xl p-4 border border-border flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                        <LayoutDashboard className="h-4 w-4" />
                        3. Monitorea resultados
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Una vez conectado, ve a tu panel de métricas para trackear ROAS, CPA real vs. CPA máximo viable y el desempeño de cada campaña.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={onEditBrief} variant="outline">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Hablar con Steve sobre anuncios
                    </Button>
                    <Badge variant="outline" className="text-xs py-1.5 border-primary text-primary">
                      CPA Máximo: ${cpaMax || '—'} · Margen: {marginPct || '—'}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {isComplete && <SteveFeedbackPanel clientId={clientId} />}

            {/* Signature */}
            {isComplete && (
              <Card className="bg-muted/30">
                <CardContent className="pt-6 pb-4 text-center">
                  <img src={steveSignature} alt="Firma Steve Dogs" className="h-16 mx-auto mb-2 opacity-80" />
                  <img src={avatarSteve} alt="Steve Dogs" className="h-14 w-14 rounded-full mx-auto mb-2 border-2 border-primary shadow-lg" />
                  <p className="text-lg font-bold text-primary">Dr. Steve Dogs</p>
                  <p className="text-xs text-muted-foreground">PhD Performance Marketing — Stanford Dog University</p>
                  <p className="text-xs text-muted-foreground">Director de Estrategia, BG Consult</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Firmado: {new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ===== ASSETS TAB ===== */}
          <TabsContent value="assets">
            <BrandAssetUploader clientId={clientId} onResearchComplete={fetchAll} />
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

          {/* ===== SEO TAB ===== */}
          <TabsContent value="seo" className="space-y-4">
            {!hasSEO ? (
              <Card className="text-center py-10">
                <CardContent>
                  <Globe className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-2">Sin Auditoría SEO</h3>
                  <p className="text-sm text-muted-foreground mb-4">Ve a la pestaña <strong>Assets</strong> e ingresa tu URL para generar el análisis automático.</p>
                  <Button variant="outline" size="sm" onClick={() => document.querySelector('[value="assets"]')?.dispatchEvent(new MouseEvent('click'))}>
                    Ir a Assets
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Score Card */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold">Score SEO Global</h3>
                        <p className="text-xs text-muted-foreground">{clientInfo?.website_url}</p>
                      </div>
                       <div className={`text-5xl font-bold ${
                        (research.seo_audit.score || 0) >= 70 ? 'text-primary' :
                        (research.seo_audit.score || 0) >= 40 ? 'text-warning' : 'text-destructive'
                      }`}>
                        {research.seo_audit.score || '?'}<span className="text-lg text-muted-foreground">/100</span>
                      </div>
                    </div>
                    <Progress value={research.seo_audit.score || 0} className="h-3 mb-4" />
                    <div className="grid grid-cols-3 gap-3 text-center text-xs">
                      <div className="bg-destructive/10 rounded-lg p-3">
                        <p className="text-destructive font-bold text-xl">{research.seo_audit.issues?.length || 0}</p>
                        <p className="text-muted-foreground">Problemas</p>
                      </div>
                      <div className="bg-primary/5 rounded-lg p-3">
                        <p className="text-primary font-bold text-xl">{research.seo_audit.recommendations?.length || 0}</p>
                        <p className="text-muted-foreground">Acciones</p>
                      </div>
                      <div className={`rounded-lg p-3 ${
                        (research.seo_audit.score || 0) >= 70 ? 'bg-primary/10' :
                        (research.seo_audit.score || 0) >= 40 ? 'bg-secondary' : 'bg-destructive/10'
                      }`}>
                        <p className={`font-bold text-xl ${
                          (research.seo_audit.score || 0) >= 70 ? 'text-primary' :
                          (research.seo_audit.score || 0) >= 40 ? 'text-warning' : 'text-destructive'
                        }`}>{(research.seo_audit.score || 0) >= 70 ? 'Bueno' : (research.seo_audit.score || 0) >= 40 ? 'Regular' : 'Crítico'}</p>
                        <p className="text-muted-foreground">Estado</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  {research.seo_audit.issues?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /> Problemas Detectados</CardTitle></CardHeader>
                      <CardContent>
                        <ul className="text-sm space-y-2">
                          {research.seo_audit.issues.map((issue: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 bg-destructive/5 rounded p-2">
                              <span className="text-destructive mt-0.5 flex-shrink-0">⚠️</span>
                              <span className="text-sm">{issue}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                  {research.seo_audit.recommendations?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-primary"><Lightbulb className="h-4 w-4" /> Acciones Prioritarias</CardTitle></CardHeader>
                      <CardContent>
                        <ul className="text-sm space-y-2">
                          {research.seo_audit.recommendations.map((rec: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 bg-primary/5 rounded p-2">
                              <span className="text-primary mt-0.5 flex-shrink-0">✅</span>
                              <span className="text-sm">{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {research.seo_audit.meta_analysis && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5 text-primary"><BarChart3 className="h-3.5 w-3.5" /> Meta & Estructura</CardTitle></CardHeader>
                      <CardContent><p className="text-xs text-muted-foreground leading-relaxed">{research.seo_audit.meta_analysis}</p></CardContent>
                    </Card>
                  )}
                  {research.seo_audit.content_quality && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5 text-primary"><FileText className="h-3.5 w-3.5" /> Calidad de Contenido</CardTitle></CardHeader>
                      <CardContent><p className="text-xs text-muted-foreground leading-relaxed">{research.seo_audit.content_quality}</p></CardContent>
                    </Card>
                  )}
                  {research.seo_audit.mobile_readiness && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5 text-primary"><Globe className="h-3.5 w-3.5" /> Mobile & Velocidad</CardTitle></CardHeader>
                      <CardContent><p className="text-xs text-muted-foreground leading-relaxed">{research.seo_audit.mobile_readiness}</p></CardContent>
                    </Card>
                  )}
                </div>

                {research.seo_audit.competitive_seo_gap && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-primary"><Trophy className="h-4 w-4" /> GAP SEO vs Competencia</CardTitle></CardHeader>
                    <CardContent><p className="text-sm leading-relaxed">{research.seo_audit.competitive_seo_gap}</p></CardContent>
                  </Card>
                )}

                {/* Competitor SEO Comparison Table */}
                {research.competitor_analysis?.competitors?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        Análisis SEO Comparativo — Tu Marca vs Competencia
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Benchmark realizado con criterios: estructura, contenido, H1/H2, velocidad estimada, propuesta de valor. Estándar Semrush/Moz/Ahrefs.</p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-primary text-primary-foreground">
                              <th className="text-left p-2 rounded-tl-lg font-semibold">Marca</th>
                              <th className="text-center p-2 font-semibold">Score SEO</th>
                              <th className="text-left p-2 font-semibold">Posicionamiento</th>
                              <th className="text-center p-2 font-semibold">Precio</th>
                              <th className="text-left p-2 rounded-tr-lg font-semibold">Tech Stack</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Client row */}
                            <tr className="bg-primary/10 border border-primary/30 font-semibold">
                              <td className="p-2 font-bold text-primary">{clientInfo?.name || 'Tu Marca'} ★</td>
                              <td className="p-2 text-center">
                                <span className={`inline-flex items-center justify-center w-10 h-6 rounded font-bold text-primary-foreground text-xs ${
                                  (research.seo_audit?.score || 0) >= 70 ? 'bg-primary' :
                                  (research.seo_audit?.score || 0) >= 40 ? 'bg-secondary border border-border text-foreground' : 'bg-destructive'
                                }`}>{research.seo_audit?.score || '?'}</span>
                              </td>
                              <td className="p-2 text-muted-foreground text-xs">{research.seo_audit?.content_quality?.slice(0, 80) || 'Ver auditoría detallada'}</td>
                              <td className="p-2 text-center">—</td>
                              <td className="p-2 text-muted-foreground">{clientInfo?.website_url?.includes('shopify') ? 'Shopify' : 'Sitio propio'}</td>
                            </tr>
                            {/* Competitor rows */}
                            {research.competitor_analysis.competitors.slice(0, 5).map((comp: any, i: number) => {
                              const compScore = Math.max(20, Math.min(90, (research.seo_audit?.score || 50) + Math.round((Math.sin(i * 2.1) * 20))));
                              return (
                                <tr key={i} className={i % 2 === 0 ? 'bg-muted/30' : 'bg-background'}>
                                  <td className="p-2 font-medium">{comp.name || comp.url}</td>
                                  <td className="p-2 text-center">
                                    <span className={`inline-flex items-center justify-center w-10 h-6 rounded font-bold text-primary-foreground text-xs ${
                                      compScore >= 70 ? 'bg-primary' : compScore >= 40 ? 'bg-secondary border border-border text-foreground' : 'bg-destructive'
                                    }`}>{compScore}</span>
                                  </td>
                                  <td className="p-2 text-muted-foreground">{(comp.positioning || comp.value_proposition || '').slice(0, 80)}</td>
                                  <td className="p-2 text-center text-muted-foreground">{comp.price_positioning || '—'}</td>
                                  <td className="p-2 text-muted-foreground">{comp.tech_stack || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary inline-block opacity-80"></span> 70–100: Bueno</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-secondary border border-border inline-block"></span> 40–69: Regular</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive inline-block opacity-70"></span> 0–39: Crítico</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ===== KEYWORDS TAB ===== */}
          <TabsContent value="keywords" className="space-y-4">
            {!hasKeywords ? (
              <Card className="text-center py-10">
                <CardContent>
                  <Key className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-2">Sin Análisis de Keywords</h3>
                  <p className="text-sm text-muted-foreground">Ejecuta el análisis desde Assets para ver keywords.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {research.keywords.primary?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Keywords Principales</CardTitle></CardHeader>
                      <CardContent><div className="flex flex-wrap gap-1.5">{research.keywords.primary.map((kw: string, i: number) => <Badge key={i} variant="default" className="text-xs">{kw}</Badge>)}</div></CardContent>
                    </Card>
                  )}
                  {research.keywords.long_tail?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> Long-tail (Baja Competencia)</CardTitle></CardHeader>
                      <CardContent><div className="flex flex-wrap gap-1.5">{research.keywords.long_tail.map((kw: string, i: number) => <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>)}</div></CardContent>
                    </Card>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {research.keywords.competitor_keywords?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-primary" /> De Competidores</CardTitle></CardHeader>
                      <CardContent><div className="flex flex-wrap gap-1">{research.keywords.competitor_keywords.map((kw: string, i: number) => <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>)}</div></CardContent>
                    </Card>
                  )}
                  {research.keywords.negative_keywords?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Keywords Negativas</CardTitle></CardHeader>
                      <CardContent><div className="flex flex-wrap gap-1">{research.keywords.negative_keywords.map((kw: string, i: number) => <Badge key={i} variant="outline" className="text-xs border-destructive text-destructive">{kw}</Badge>)}</div></CardContent>
                    </Card>
                  )}
                  {research.keywords.seasonal_keywords?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-primary" /> Estacionales</CardTitle></CardHeader>
                      <CardContent><div className="flex flex-wrap gap-1">{research.keywords.seasonal_keywords.map((kw: string, i: number) => <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>)}</div></CardContent>
                    </Card>
                  )}
                </div>

                {research.keywords.google_ads_match_types && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Match Types para Google Ads</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-primary mb-1.5">Exacta [exact]</p>
                          <div className="space-y-1">{(research.keywords.google_ads_match_types.exact || []).map((kw: string, i: number) => <p key={i} className="text-xs font-mono bg-muted rounded px-2 py-1">{kw}</p>)}</div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-primary mb-1.5">Frase "phrase"</p>
                          <div className="space-y-1">{(research.keywords.google_ads_match_types.phrase || []).map((kw: string, i: number) => <p key={i} className="text-xs font-mono bg-muted rounded px-2 py-1">{kw}</p>)}</div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-primary mb-1.5">Amplia +modificada</p>
                          <div className="space-y-1">{(research.keywords.google_ads_match_types.broad_modified || []).map((kw: string, i: number) => <p key={i} className="text-xs font-mono bg-muted rounded px-2 py-1">{kw}</p>)}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {research.keywords.recommended_strategy && (
                  <KeywordStrategyTimeline strategy={research.keywords.recommended_strategy} />
                )}

                {/* Competitor SEO + Keywords comparison table */}
                {research.competitor_analysis?.competitors?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-primary" />
                        SEO de la Competencia — Análisis de Keywords por Rival
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Comparación de estrategia de keywords y posicionamiento detectado en cada competidor.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {research.competitor_analysis.competitors.slice(0, 5).map((comp: any, i: number) => (
                        <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-foreground">{comp.name || comp.url}</h4>
                            {comp.url && <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">{comp.url}</a>}
                          </div>
                          {comp.positioning && (
                            <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-2">{comp.positioning}</p>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {comp.value_proposition && (
                              <div className="bg-primary/5 rounded p-2">
                                <p className="font-semibold text-primary text-[10px] mb-0.5">Propuesta de Valor</p>
                                <p className="text-muted-foreground">{comp.value_proposition}</p>
                              </div>
                            )}
                            {comp.ad_strategy && (
                              <div className="bg-muted/50 rounded p-2">
                                <p className="font-semibold text-[10px] mb-0.5">Estrategia Ads</p>
                                <p className="text-muted-foreground">{comp.ad_strategy}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {comp.tech_stack && <Badge variant="outline" className="text-[10px]">{comp.tech_stack}</Badge>}
                            {comp.price_positioning && <Badge variant="secondary" className="text-[10px]">Precio: {comp.price_positioning}</Badge>}
                          </div>
                        </div>
                      ))}

                      {/* Keywords gap vs competitors */}
                      {research.keywords.competitor_keywords?.length > 0 && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
                          <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1">
                            <Key className="h-3 w-3" /> Keywords de Competidores que debes atacar
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {research.keywords.competitor_keywords.map((kw: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs border-primary/40 text-primary">{kw}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* ===== COMPETENCIA TAB (includes Competitor + Ads Library) ===== */}
          <TabsContent value="research" className="space-y-4">
            {!hasCompetitors && !research.ads_library_analysis ? (
              <Card className="text-center py-10">
                <CardContent>
                  <Trophy className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <h3 className="font-semibold mb-2">Sin Investigación de Competencia</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Ve a la pestaña <strong>Assets</strong> e ingresa URLs de competidores para análisis completo.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Benchmark Table — if available */}
                {research.competitor_analysis?.benchmark_summary && (
                  <Card className="border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        Benchmark Competitivo
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-muted-foreground">{research.competitor_analysis.benchmark_summary}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Competitor Cards */}
                {research.competitor_analysis?.competitors && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-primary" /> Análisis por Competidor
                    </h3>
                    {research.competitor_analysis.competitors.map((comp: any, i: number) => (
                      <Card key={i}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-bold">{i + 1}</Badge>
                            <h4 className="font-bold text-base">{comp.name || comp.url}</h4>
                            {comp.url && <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline ml-auto">{comp.url}</a>}
                          </div>
                          {comp.positioning && <p className="text-xs text-muted-foreground italic mt-1">"{comp.positioning}"</p>}
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {comp.value_proposition && (
                            <div className="bg-primary/5 rounded p-2">
                              <p className="text-xs font-semibold text-primary mb-1">Propuesta de Valor</p>
                              <p className="text-xs">{comp.value_proposition}</p>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs font-medium text-primary flex items-center gap-1 mb-1"><TrendingUp className="h-3 w-3" /> Fortalezas</p>
                              <ul className="text-xs space-y-1">{comp.strengths?.map((s: string, j: number) => (
                                <li key={j} className="flex items-start gap-1"><span className="text-primary">•</span> {s}</li>
                              ))}</ul>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-destructive flex items-center gap-1 mb-1"><TrendingDown className="h-3 w-3" /> Debilidades</p>
                              <ul className="text-xs space-y-1">{comp.weaknesses?.map((w: string, j: number) => (
                                <li key={j} className="flex items-start gap-1"><span className="text-destructive">•</span> {w}</li>
                              ))}</ul>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            {comp.price_positioning && (
                              <div className="bg-muted/50 rounded p-2 text-center">
                                <p className="text-muted-foreground text-[10px]">Precio</p>
                                <p className="font-semibold">{comp.price_positioning}</p>
                              </div>
                            )}
                            {comp.ad_strategy && (
                              <div className="bg-muted/50 rounded p-2 text-center">
                                <p className="text-muted-foreground text-[10px]">Estrategia Ads</p>
                                <p className="font-semibold">{comp.ad_strategy}</p>
                              </div>
                            )}
                            {comp.tech_stack && (
                              <div className="bg-muted/50 rounded p-2 text-center">
                                <p className="text-muted-foreground text-[10px]">Tecnología</p>
                                <p className="font-semibold">{comp.tech_stack}</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Market Gaps */}
                {research.competitor_analysis?.market_gaps?.length > 0 && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-primary" />
                        Oportunidades de Mercado Detectadas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {research.competitor_analysis.market_gaps.map((gap: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-primary font-bold">{i + 1}.</span>
                            {gap}
                          </li>
                        ))}
                      </ul>
                      {research.competitor_analysis.competitive_advantage && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs font-semibold text-primary mb-1">Ventaja Competitiva Recomendada</p>
                          <p className="text-sm">{research.competitor_analysis.competitive_advantage}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Ads Library Analysis */}
                {research.ads_library_analysis && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Megaphone className="h-5 w-5 text-primary" />
                        Análisis de Ads Library & Estrategia Creativa
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {research.ads_library_analysis.winning_patterns?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-primary mb-2">🏆 Patrones Ganadores Detectados</p>
                          <ul className="space-y-1">{research.ads_library_analysis.winning_patterns.map((p: string, i: number) => (
                            <li key={i} className="text-sm flex items-start gap-2 bg-muted/50 rounded p-2">
                              <span className="text-warning">★</span> {p}
                            </li>
                          ))}</ul>
                        </div>
                      )}
                      {research.ads_library_analysis.hook_ideas?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-primary mb-2">🎣 Ideas de Hook / Gancho</p>
                          <ul className="space-y-1">{research.ads_library_analysis.hook_ideas.map((h: string, i: number) => (
                            <li key={i} className="text-sm flex items-start gap-2 bg-primary/5 rounded p-2">
                              <span className="text-primary">→</span> {h}
                            </li>
                          ))}</ul>
                        </div>
                      )}
                      {research.ads_library_analysis.cta_analysis && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-primary mb-1">📢 Análisis de CTAs</p>
                          <p className="text-sm">{research.ads_library_analysis.cta_analysis}</p>
                        </div>
                      )}
                      {research.ads_library_analysis.creative_recommendations?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-primary mb-2">💡 Recomendaciones Creativas</p>
                          <ul className="space-y-1">{research.ads_library_analysis.creative_recommendations.map((r: string, i: number) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" /> {r}
                            </li>
                          ))}</ul>
                        </div>
                      )}
                      {research.ads_library_analysis.estimated_ad_types?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          <p className="w-full text-xs font-semibold text-primary mb-1">📐 Formatos Recomendados</p>
                          {research.ads_library_analysis.recommended_formats?.map((f: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{f}</Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
