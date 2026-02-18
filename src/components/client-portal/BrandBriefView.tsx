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
  ArrowRight, Zap, Rocket, LayoutDashboard, ChevronDown, ChevronUp, Loader2
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
          const lines = block.split('\n').map(l => l == null ? '' : String(l).replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()).filter(Boolean);
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
  competitive_domination?: any;
  cost_benchmarks?: any;
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

const PERFORMANCE_QUOTES = [
  { quote: "Make an offer so good, people feel stupid saying no.", author: "Alex Hormozi", role: "Founder, Acquisition.com" },
  { quote: "The money is in the list. The fortune is in the follow-up.", author: "Russell Brunson", role: "Co-Founder, ClickFunnels" },
  { quote: "Price is only an issue in the absence of value.", author: "Alex Hormozi", role: "Founder, Acquisition.com" },
  { quote: "The biggest mistake you can make is not testing your offer before scaling your ads.", author: "Russell Brunson", role: "Co-Founder, ClickFunnels" },
  { quote: "Speed of implementation separates the rich from the broke.", author: "Alex Hormozi", role: "Founder, Acquisition.com" },
  { quote: "The secret to scaling? Make the unit economics work first.", author: "Russell Brunson", role: "Co-Founder, ClickFunnels" },
  { quote: "Whoever can spend the most to acquire a customer wins.", author: "Dan Kennedy", role: "Direct Response Marketing Legend" },
  { quote: "Spend 20% of your budget testing, 80% scaling what works.", author: "Neil Patel", role: "Digital Marketing Expert" },
  { quote: "Your ROAS is a vanity metric. Profit per customer is what matters.", author: "Andrew Wilkinson", role: "Tiny Capital" },
  { quote: "The hook is not to get them to buy. It's to get them to consume the next piece of content.", author: "Gary Vaynerchuk", role: "CEO, VaynerMedia" },
  { quote: "Attention is the new currency. Own it or buy it.", author: "Gary Vaynerchuk", role: "CEO, VaynerMedia" },
  { quote: "Creatives are 70% of your ad performance. Test relentlessly.", author: "Andrew Foxwell", role: "Foxwell Digital" },
  { quote: "Your landing page is either a leaky bucket or a money machine. There's no middle ground.", author: "Joanna Wiebe", role: "Copyhackers" },
  { quote: "If you can't measure it, you can't improve it.", author: "Peter Drucker", role: "Management Consultant" },
  { quote: "Stop selling. Start helping.", author: "Zig Ziglar", role: "Sales Legend" },
  { quote: "Don't fall in love with your product. Fall in love with your customer's problem.", author: "Michael Skok", role: "Venture Capitalist" },
  { quote: "The best marketing doesn't feel like marketing.", author: "Tom Fishburne", role: "Marketoonist" },
  { quote: "Your ad creative is dead after 3 days. Refresh or die.", author: "Charlie Tichenor", role: "Founder, The Facebook Disruptor" },
  { quote: "Stop trying to go viral. Start trying to be relevant.", author: "Charlie Tichenor", role: "Founder, The Facebook Disruptor" },
  { quote: "The offer is the strategy. Everything else is just execution.", author: "Charlie Tichenor", role: "Founder, The Facebook Disruptor" },
];

function AnalysisProgressBanner({ progressStep }: { progressStep: { step: string; detail: string; pct: number } | null }) {
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
    { key: ['inicio', 'sitio_web'], icon: <Globe className="h-4 w-4 mx-auto mb-1" />, label: 'Tu Sitio Web' },
    { key: ['detectando'], icon: <Search className="h-4 w-4 mx-auto mb-1" />, label: 'Detectando' },
    { key: ['competidor_0', 'competidor_1', 'competidor_2', 'competidor_3', 'competidor_4', 'competidor_5'], icon: <Trophy className="h-4 w-4 mx-auto mb-1" />, label: 'Competidores' },
    { key: ['ia'], icon: <Sparkles className="h-4 w-4 mx-auto mb-1" />, label: 'Estrategia IA' },
  ];
  const thresholds = [0, 20, 25, 70];

  return (
    <Card className="border-primary/30 bg-primary/5 overflow-hidden">
      <CardContent className="pt-4 pb-4">
        {/* Status row */}
        <div className="flex items-center gap-3 mb-3">
          <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary truncate">
              {progressStep?.detail || 'Iniciando análisis de marca...'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Steve está auditando tu sitio, investigando keywords y analizando hasta 6 competidores. 1–2 minutos.
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Progreso</span>
            <span className="text-[10px] font-bold text-primary">{progressStep?.pct ?? 0}%</span>
          </div>
          <Progress value={progressStep?.pct ?? 5} className="h-2" />
        </div>

        {/* Step indicators */}
        <div className="grid grid-cols-4 gap-2 text-center mb-5">
          {phases.map((phase, i) => {
            const isActive = progressStep && phase.key.includes(progressStep.step);
            const pct = progressStep?.pct ?? 0;
            const isDone = pct > thresholds[i] && !isActive;
            return (
              <div key={i} className={`rounded-lg p-2 border transition-all duration-300 ${isActive ? 'bg-primary/10 border-primary/40' : isDone ? 'bg-green-50 dark:bg-green-950/20 border-green-400/40' : 'bg-background border-border'}`}>
                <div className={isActive ? 'text-primary' : isDone ? 'text-green-500' : 'text-muted-foreground'}>
                  {isDone ? <CheckCircle2 className="h-4 w-4 mx-auto mb-1" /> : phase.icon}
                </div>
                <p className={`text-[10px] font-medium ${isActive ? 'text-primary' : isDone ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>{phase.label}</p>
                {isActive && <div className="mt-1 h-0.5 bg-primary/20 rounded-full overflow-hidden"><div className="h-0.5 bg-primary rounded-full animate-pulse w-full" /></div>}
              </div>
            );
          })}
        </div>

        {/* Rotating quote */}
        <div
          className="rounded-xl border border-primary/20 bg-background/60 p-4"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(6px)', transition: 'opacity 0.4s ease, transform 0.4s ease' }}
        >
          <div className="flex gap-3 items-start">
            <span className="text-3xl leading-none text-primary/30 font-serif select-none flex-shrink-0 -mt-1">"</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground leading-snug italic">
                {quote.quote}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <div className="h-px flex-1 bg-border" />
                <div className="text-right flex-shrink-0">
                  <p className="text-[11px] font-bold text-primary">{quote.author}</p>
                  <p className="text-[10px] text-muted-foreground">{quote.role}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
  const [reanalyzing, setReanalyzing] = useState(false);
  const [progressStep, setProgressStep] = useState<{ step: string; detail: string; pct: number } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchAll();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (progressPollingRef.current) clearInterval(progressPollingRef.current);
    };
  }, [clientId]);

  // Poll status when analysis is pending
  useEffect(() => {
    if (analysisStatus !== 'pending') {
      if (progressPollingRef.current) clearInterval(progressPollingRef.current);
      return;
    }

    // Poll progress steps every 3s
    progressPollingRef.current = setInterval(async () => {
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

    // Poll completion status every 5s
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
        setProgressStep(null);
        clearInterval(pollingRef.current!);
        clearInterval(progressPollingRef.current!);
        await fetchResearch();
        toast.success('¡Análisis SEO y Keywords completado! Ya puedes descargar el informe completo.');
      } else if (status === 'error') {
        setAnalysisStatus('error');
        setProgressStep(null);
        clearInterval(pollingRef.current!);
        clearInterval(progressPollingRef.current!);
      }
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (progressPollingRef.current) clearInterval(progressPollingRef.current);
    };
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
      const pd = data.persona_data as BriefData;
      // Sanitizar raw_responses en el origen: null/undefined → '' para evitar crashes en .trim()
      if (pd?.raw_responses && Array.isArray(pd.raw_responses)) {
        pd.raw_responses = (pd.raw_responses as any[]).map((r: any) => {
          if (r === null || r === undefined) return '';
          if (typeof r === 'string') return r;
          return String(r);
        });
        for (let i = 0; i < pd.raw_responses.length; i++) {
          if (!(i in pd.raw_responses) || pd.raw_responses[i] === undefined) {
            pd.raw_responses[i] = '';
          }
        }
      }
      setBriefData(pd);
      setIsComplete(data.is_complete);
    }
  }

  async function fetchResearch() {
    const { data, error } = await supabase
      .from('brand_research')
      .select('research_type, research_data')
      .eq('client_id', clientId);
    if (error) {
      console.error('fetchResearch error:', error);
      return;
    }
    if (data && data.length > 0) {
      const r: ResearchData = {};
      // Track status separately — never merge into research state
      const SKIP_TYPES = ['analysis_status', 'analysis_progress'];
      for (const row of data) {
        if (row.research_type === 'analysis_status') {
          const status = (row.research_data as any)?.status;
          if (status === 'pending') setAnalysisStatus('pending');
          else if (status === 'complete') setAnalysisStatus('complete');
          else if (status === 'error') setAnalysisStatus('error');
        } else if (!SKIP_TYPES.includes(row.research_type)) {
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

  const personaResponse = (() => {
    if (!briefData?.questions || !briefData?.raw_responses) return '';
    const idx = briefData.questions.indexOf('persona_profile');
    if (idx < 0 || idx >= briefData.raw_responses.length) return '';
    const val = briefData.raw_responses[idx];
    return (val == null || val === undefined) ? '' : String(val);
  })();
  const personaProfile = parsePersonaProfile(personaResponse);
  const personaGender = detectGender(personaProfile);
  const personaImage = personaGender === 'female' ? personaFemale : personaMale;

  function getResponse(questionId: string): string {
    if (!briefData?.questions || !briefData?.raw_responses) return '';
    const idx = briefData.questions.indexOf(questionId);
    if (idx < 0 || idx >= briefData.raw_responses.length) return '';
    const val = briefData.raw_responses[idx];
    return (val == null || val === undefined) ? '' : String(val);
  }

  // Extract competitor URLs from brief Q9 responses
  function extractCompetitorUrlsFromBrief(): string[] {
    if (!briefData?.questions || !briefData?.raw_responses) return [];
    const idx = briefData.questions.indexOf('competitors');
    if (idx < 0) return [];
    const response = String(briefData.raw_responses[idx] ?? '');
    const urls: string[] = [];
    const urlMatches = response.match(/(?:Web[^:]*:\s*|🌐\s*)([^\s\n,]+\.[a-z]{2,})/gi) || [];
    for (const match of urlMatches) {
      const url = match.replace(/^(?:Web[^:]*:\s*|🌐\s*)/i, '').trim();
      if (url) urls.push(url.startsWith('http') ? url : `https://${url}`);
    }
    if (urls.length === 0) {
      const domainMatches = response.match(/\b[\w-]+\.(?:cl|com|com\.ar|mx|pe|co)\b/g) || [];
      domainMatches.forEach(d => urls.push(`https://${d}`));
    }
    return [...new Set(urls)].slice(0, 3);
  }

  async function handleReanalyze() {
    const websiteUrl = clientInfo?.website_url || '';
    if (!websiteUrl) {
      toast.error('No hay URL de sitio web. Completa el brief primero.');
      return;
    }
    setProgressStep(null);

    // Mark as pending in DB first so polling picks it up on refresh too
    await supabase.from('brand_research').upsert({
      client_id: clientId,
      research_type: 'analysis_status',
      research_data: { status: 'pending' },
    }, { onConflict: 'client_id,research_type' });
    // Set initial progress step
    await supabase.from('brand_research').upsert({
      client_id: clientId,
      research_type: 'analysis_progress',
      research_data: { step: 'inicio', detail: 'Iniciando análisis de marca...', pct: 2, ts: new Date().toISOString() },
    }, { onConflict: 'client_id,research_type' });

    // Update UI state immediately so banner shows right away
    setAnalysisStatus('pending');
    setProgressStep({ step: 'inicio', detail: 'Iniciando análisis de marca...', pct: 2 });
    toast.info('Iniciando análisis — Steve está investigando tus competidores...');

    // Fire and forget via fetch directly to avoid SDK 60s timeout killing the flow
    const competitorUrls = extractCompetitorUrlsFromBrief();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'jnqivntlkemzcpomkvwv';

    fetch(`https://${projectId}.supabase.co/functions/v1/analyze-brand`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      },
      body: JSON.stringify({ client_id: clientId, website_url: websiteUrl, competitor_urls: competitorUrls, research_type: 'full' }),
    }).then(async (res) => {
      // Only write error if the function returned a real error status (not timeout/network)
      if (!res.ok && res.status !== 0) {
        const body = await res.json().catch(() => ({}));
        // 402 = payment error, don't spam error status — polling will handle it
        if (res.status !== 429 && res.status !== 402) {
          console.error('analyze-brand HTTP error:', res.status, body);
        }
      }
    }).catch((err) => {
      // Network-level errors (timeout, CORS on fire-and-forget) are expected — polling tracks status
      console.log('analyze-brand fetch ended (may be timeout, polling tracks status):', err?.message);
    });
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

    // ─── COLOR PALETTE ────────────────────────────────────────────────────────
    const brandR = 26, brandG = 35, brandB = 126;   // #1a237e navy
    const accentR = 161, accentG = 120, accentB = 25; // #a17819 gold
    const lightGray = [245, 246, 252] as [number,number,number];
    const midGray   = [200, 200, 210] as [number,number,number];

    // ─── HELPERS ──────────────────────────────────────────────────────────────
    const checkPage = (needed: number) => {
      if (y + needed > pageHeight - 25) { doc.addPage(); y = 20; addWatermark(); }
    };

    const addWatermark = () => {
      const pg = doc.getCurrentPageInfo().pageNumber;
      doc.saveGraphicsState();
      // @ts-ignore
      doc.setGState(new doc.GState({ opacity: 0.06 }));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(100, 100, 100);
      doc.text('Preparado por STEVE.IO', pageWidth / 2, pageHeight / 2, {
        align: 'center', angle: 45,
      });
      doc.restoreGraphicsState();
    };

    const addFooter = (pageNum: number, pageCount: number) => {
      doc.setDrawColor(accentR, accentG, accentB);
      doc.setLineWidth(0.4);
      doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`STEVE.IO — BG Consult | Confidencial | Pág ${pageNum}/${pageCount}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    };

    const stripEmojis = (text: string) => text
      .replace(/#{1,4}\s*/g, '').replace(/\*\*/g, '').replace(/\*/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[⚠️✅❌★→•]/g, '')
      .replace(/1️⃣|2️⃣|3️⃣|⭐|🔴|🟡|🟢/g, '')
      .trim();

    const addBody = (text: string, indent = 0, lineH = 5.2) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      const clean = stripEmojis(text);
      const lines = doc.splitTextToSize(clean, maxWidth - indent - 4);
      for (const line of lines) {
        checkPage(lineH + 1);
        doc.text(line, margin + indent + 2, y);
        y += lineH;
      }
      y += 2;
    };

    const addSubTitle = (title: string) => {
      checkPage(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text(title, margin + 2, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
      // thin gold separator
      doc.setDrawColor(accentR, accentG, accentB);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;
    };

    const addSectionHeader = (num: string, title: string) => {
      checkPage(18);
      y += 6;
      // Circle number
      doc.setFillColor(accentR, accentG, accentB);
      doc.circle(margin + 5, y + 3, 5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(num, margin + 5, y + 5.5, { align: 'center' });
      // Title bar
      doc.setFillColor(brandR, brandG, brandB);
      doc.roundedRect(margin + 12, y - 1, maxWidth - 12, 11, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text(title, margin + 17, y + 7);
      doc.setTextColor(0, 0, 0);
      y += 17;
    };

    const addInsightBox = (text: string) => {
      checkPage(18);
      doc.setFillColor(249, 246, 235);
      doc.roundedRect(margin, y, maxWidth, 14, 1, 1, 'F');
      doc.setDrawColor(accentR, accentG, accentB);
      doc.setLineWidth(1);
      doc.line(margin, y, margin, y + 14);
      doc.setLineWidth(0.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60, 40, 0);
      const lines = doc.splitTextToSize(stripEmojis(text), maxWidth - 10);
      doc.text(lines.slice(0, 3), margin + 5, y + 5);
      y += 17;
    };

    const addKeyValue = (label: string, value: string) => {
      checkPage(7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
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

    const addArrowBullet = (text: string, indent = 0) => {
      checkPage(6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      const lines = doc.splitTextToSize(`-> ${stripEmojis(text)}`, maxWidth - indent - 4);
      for (const line of lines) {
        checkPage(5.5);
        doc.text(line, margin + indent + 2, y);
        y += 5.2;
      }
    };

    const addTableRow = (cells: string[], colWidths: number[], rowIdx: number, header = false) => {
      checkPage(8);
      const rowH = 8;
      if (header) {
        doc.setFillColor(brandR, brandG, brandB);
      } else {
        doc.setFillColor(rowIdx % 2 === 0 ? 255 : 245, rowIdx % 2 === 0 ? 255 : 246, rowIdx % 2 === 0 ? 255 : 252);
      }
      let cx = margin;
      doc.rect(margin, y - 1, maxWidth, rowH, 'F');
      doc.setFont('helvetica', header ? 'bold' : 'normal');
      doc.setFontSize(header ? 8.5 : 8);
      doc.setTextColor(header ? 255 : 40, header ? 255 : 40, header ? 255 : 40);
      for (let i = 0; i < cells.length; i++) {
        const txt = String(cells[i] ?? '').slice(0, 38);
        doc.text(txt, cx + 2, y + 4.5);
        cx += colWidths[i];
      }
      y += rowH + 1;
    };

    // ─── PAGE 1: PORTADA (FULL NAVY) ────────────────────────────────────────────
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    addWatermark();

    // Gold accent band at 1/3
    const bandY = pageHeight / 3 - 1.5;
    doc.setFillColor(accentR, accentG, accentB);
    doc.rect(0, bandY, pageWidth, 3, 'F');

    // Logo centrado arriba
    try {
      const logoSrc = clientInfo?.logo_url || assets.logo[0] || logo;
      const logoBase64 = await loadImageAsBase64(logoSrc);
      doc.addImage(logoBase64, 'JPEG', pageWidth / 2 - 20, 25, 40, 16);
    } catch {}

    // Client name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.text(clientInfo?.name || 'Cliente', pageWidth / 2, bandY + 22, { align: 'center' });
    if (clientInfo?.company) {
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(clientInfo.company, pageWidth / 2, bandY + 32, { align: 'center' });
    }

    // Report title in gold
    doc.setFontSize(18);
    doc.setTextColor(accentR + 40, accentG + 40, accentB + 20);
    doc.text('Brief Estrategico de Marca', pageWidth / 2, bandY + 46, { align: 'center' });

    // Gold separator line
    doc.setDrawColor(accentR, accentG, accentB);
    doc.setLineWidth(0.8);
    doc.line(margin + 20, bandY + 52, pageWidth - margin - 20, bandY + 52);

    // Prepared by
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 220);
    doc.text('Preparado por Dr. Steve Dogs, PhD Performance Marketing', pageWidth / 2, bandY + 60, { align: 'center' });
    doc.text('BG Consult / STEVE.IO', pageWidth / 2, bandY + 66, { align: 'center' });

    // Footer of cover
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 180);
    const coverDate = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(coverDate, pageWidth / 2, pageHeight - 20, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(accentR + 40, accentG + 20, accentB);
    doc.text('ESTRICTAMENTE CONFIDENCIAL', pageWidth / 2, pageHeight - 14, { align: 'center' });

    // ─── PAGE 2: DASHBOARD EJECUTIVO DE KPIs ────────────────────────────────────
    doc.addPage();
    y = 20;
    addWatermark();

    // Header
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('DASHBOARD EJECUTIVO DE KPIs', pageWidth / 2, 11, { align: 'center' });
    y = 24;

    const kpiData = [
      { label: 'Ticket Promedio', value: financials ? formatCurrency(financials.price) : 'N/D', dark: true },
      { label: 'CPA Maximo Viable', value: cpaMax ? `$${cpaMax}` : 'N/D', dark: false },
      { label: 'ROAS Objetivo', value: '3x - 5x', dark: true },
      { label: 'Margen Bruto', value: marginPct ? `${marginPct}%` : 'N/D', dark: false },
      { label: 'Presupuesto Mes 1', value: '$600 USD', dark: true },
      { label: 'Tasa de Recompra', value: '40%', dark: false },
    ];

    const kpiCols = 3;
    const kpiW = (maxWidth - 8) / kpiCols;
    const kpiH = 28;
    let kpiIdx = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < kpiCols; col++) {
        const kpi = kpiData[kpiIdx++];
        const kx = margin + col * (kpiW + 4);
        const ky = y + row * (kpiH + 6);
        if (kpi.dark) {
          doc.setFillColor(brandR, brandG, brandB);
          doc.setTextColor(255, 255, 255);
        } else {
          doc.setFillColor(accentR, accentG, accentB);
          doc.setTextColor(255, 255, 255);
        }
        doc.roundedRect(kx, ky, kpiW, kpiH, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text(kpi.value, kx + kpiW / 2, ky + 14, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(kpi.label, kx + kpiW / 2, ky + 22, { align: 'center' });
      }
    }
    y += 2 * (kpiH + 6) + 10;

    // Semáforo SEO
    const seoScore = research.seo_audit?.score ?? 0;
    checkPage(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text('Estado SEO:', margin + 2, y);
    const seoStatusColor: [number, number, number] = seoScore >= 70 ? [22, 160, 70] : seoScore >= 50 ? [200, 150, 0] : [200, 40, 40];
    const seoStatusLabel = seoScore >= 70 ? 'BUENO' : seoScore >= 50 ? 'REGULAR' : 'CRITICO';
    doc.setFillColor(...seoStatusColor);
    doc.circle(margin + 45, y - 2, 5, 'F');
    doc.setTextColor(...seoStatusColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${seoStatusLabel} (${seoScore}/100)`, margin + 53, y);
    y += 14;

    // ─── PAGE 3: RESUMEN EJECUTIVO PARA DIRECTORIO ──────────────────────────────
    doc.addPage();
    y = 20;
    addWatermark();
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('RESUMEN EJECUTIVO PARA DIRECTORIO', pageWidth / 2, 11, { align: 'center' });
    y = 26;

    const execBlocks = [
      {
        title: 'PROBLEMA',
        text: `${clientInfo?.name || 'La empresa'} opera en un mercado competitivo donde los costos de adquisicion siguen subiendo y la diferenciacion es critica. Sin una estrategia de marca clara y metricas de performance optimizadas, el crecimiento sostenible es imposible.`,
        col: 0, row: 0,
      },
      {
        title: 'SOLUCION',
        text: `Brief estrategico completo: buyer persona definido, CPA maximo calculado en $${cpaMax || 'N/D'}, keywords identificadas y competencia mapeada. Steve Ads ejecuta la estrategia con IA en tiempo real.`,
        col: 1, row: 0,
      },
      {
        title: 'INVERSION REQUERIDA',
        text: 'Presupuesto inicial recomendado: $600 USD/mes (Fase 1, 0-30 dias). Distribuido en Meta Ads, Google Ads y SEO para maximizar cobertura del funnel completo.',
        col: 0, row: 1,
      },
      {
        title: 'RETORNO ESPERADO',
        text: `ROAS Fase 1: 1x-2x (aprendizaje). Fase 2: 3x (escala). Fase 3: 5x+ (optimizacion). LTV proyectado: tasa de recompra 40%. Margen bruto actual: ${marginPct ? marginPct + '%' : 'N/D'}.`,
        col: 1, row: 1,
      },
    ];

    const bW = (maxWidth - 6) / 2;
    const bH = 38;
    for (const b of execBlocks) {
      const bx = margin + b.col * (bW + 6);
      const by = y + b.row * (bH + 8);
      doc.setFillColor(...lightGray);
      doc.roundedRect(bx, by, bW, bH, 2, 2, 'F');
      doc.setDrawColor(accentR, accentG, accentB);
      doc.setLineWidth(2);
      doc.line(bx, by, bx, by + bH);
      doc.setLineWidth(0.2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(b.title, bx + 5, by + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(50, 50, 50);
      const bLines = doc.splitTextToSize(b.text, bW - 10);
      let biy = by + 13;
      for (const bl of bLines.slice(0, 4)) {
        doc.text(bl, bx + 5, biy);
        biy += 4.8;
      }
    }
    y += 2 * (bH + 8) + 12;

    // ─── SECCIÓN: ADN DE MARCA ───────────────────────────────────────────────────
    addSectionHeader('1', 'ADN DE MARCA');
    const q1 = getResponse('business_pitch');
    if (q1) { addSubTitle('Descripcion del Negocio'); addBody(q1); }

    if (financials && margin !== null) {
      addSubTitle('Indicadores Financieros Clave');
      addKeyValue('Precio de Venta', formatCurrency(financials.price));
      addKeyValue('Costo del Producto', formatCurrency(financials.cost));
      addKeyValue('Costo de Envio', formatCurrency(financials.shipping));
      addKeyValue('Margen Bruto', `${formatCurrency(margin)} (${marginPct}%)`);
      addKeyValue('CPA Maximo Viable', `$${cpaMax}`);
    }

    const q3 = getResponse('sales_channels');
    if (q3) {
      addSubTitle('Canales de Venta');
      const channels = q3.split('\n').filter(l => l.trim());
      for (const ch of channels) {
        const clean = ch.replace(/^[🛒🏪🏬📱📸👥]+\s*/, '');
        addArrowBullet(clean);
      }
    }

    // ─── SECCIÓN: BUYER PERSONA ──────────────────────────────────────────────────
    addSectionHeader('2', 'PERFIL DEL CONSUMIDOR OBJETIVO');
    try {
      const pImg = await loadImageAsBase64(personaImage);
      checkPage(35);
      doc.addImage(pImg, 'JPEG', margin + 2, y, 22, 22);
      const profileName = personaProfile['nombre ficticio'] || personaProfile['nombre'] || 'Cliente Ideal';
      const profileAge = personaProfile['edad'] || '';
      const profileGender = personaProfile['genero'] || personaProfile['género'] || '';
      const profileCity = personaProfile['ciudad / zona'] || personaProfile['ciudad'] || '';
      const profileOcc = personaProfile['ocupacion'] || personaProfile['ocupación'] || '';
      const profileIncome = personaProfile['ingreso mensual aprox.'] || personaProfile['ingreso'] || '';
      const px = margin + 28;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(profileName, px, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      let py = y + 11;
      if (profileAge) { doc.text(`${profileAge} anos | ${profileGender} | ${profileCity}`, px, py); py += 4.5; }
      if (profileOcc) { doc.text(`Ocupacion: ${profileOcc}`, px, py); py += 4.5; }
      if (profileIncome) { doc.text(`Ingreso mensual: ${formatCurrency(profileIncome)}`, px, py); py += 4.5; }
      y = Math.max(y + 25, py + 2);
    } catch {
      const q4 = getResponse('persona_profile');
      if (q4) addBody(q4);
    }

    const painResp = getResponse('persona_pain');
    if (painResp) { addSubTitle('Dolor Principal'); addInsightBox(painResp.slice(0, 220)); }
    const wordsResp = getResponse('persona_words');
    if (wordsResp) {
      addSubTitle('Palabras y Objeciones del Cliente');
      const wordLines = wordsResp.split('\n').map(l => l == null ? '' : String(l).replace(/^[-•*\d.)\s]+/, '').replace(/^["'«]|["'»]$/g, '').trim()).filter(s => s.length > 4);
      for (const wl of wordLines.slice(0, 5)) { addArrowBullet(`"${wl}"`); }
    }
    const transResp = getResponse('persona_transformation');
    if (transResp) { addSubTitle('Transformacion Deseada'); addBody(transResp); }

    // ─── SECCIÓN: ANÁLISIS COMPETITIVO ──────────────────────────────────────────
    addSectionHeader('3', 'ANALISIS COMPETITIVO ESTRATEGICO');
    const compResp = getResponse('competitors');
    if (compResp) { addSubTitle('Competidores Identificados'); addBody(compResp); }
    const advResp = getResponse('your_advantage');
    if (advResp) { addSubTitle('Ventaja Competitiva'); addBody(advResp); }

    // ─── SECCIÓN: POSICIONAMIENTO ────────────────────────────────────────────────
    addSectionHeader('4', 'POSICIONAMIENTO Y DIFERENCIACION');
    const cowResp = getResponse('purple_cow_promise');
    if (cowResp) { addSubTitle('Concepto Diferenciador (Vaca Purpura)'); addBody(cowResp); }
    const villResp = getResponse('villain_guarantee');
    if (villResp) { addSubTitle('Narrativa de Marca y Garantia'); addBody(villResp); }
    const proofResp = getResponse('proof_tone');
    if (proofResp) { addSubTitle('Prueba Social y Tono de Comunicacion'); addBody(proofResp); }

    // ─── SECCIÓN: EVALUACIÓN ESTRATÉGICA — ACCIONABLES ──────────────────────────
    if (briefData.summary) {
      addSectionHeader('5', 'EVALUACION ESTRATEGICA — 7 ACCIONABLES');
      let planText = briefData.summary;
      const section7Match = planText.match(/##\s*7\./);
      const section6Match = planText.match(/##\s*6\./);
      const startMatch = section7Match || section6Match;
      if (startMatch?.index !== undefined) planText = planText.slice(startMatch.index);
      const planLines = planText.split('\n').filter(l => l.trim());
      let accionableNum = 0;
      for (const line of planLines) {
        const trimmed = line.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '');
        if (!trimmed || trimmed.match(/^\|[\s-:]+\|$/)) continue;
        if (trimmed.match(/^Accionable\s+\d+/i) || (trimmed.match(/^\d+\.\s/) && trimmed.length < 80)) {
          accionableNum++;
          checkPage(12);
          doc.setFillColor(accentR, accentG, accentB);
          doc.circle(margin + 4, y - 1, 3.5, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(brandR, brandG, brandB);
          doc.text(trimmed, margin + 11, y + 1);
          doc.setTextColor(0, 0, 0);
          y += 6;
        } else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
          addArrowBullet(trimmed.replace(/^[-•]\s*/, ''), 6);
        } else {
          addBody(trimmed, 4);
        }
      }
    }

    // ─── SECCIÓN: AUDITORÍA SEO ──────────────────────────────────────────────────
    if (research.seo_audit) {
      const seo = research.seo_audit;
      addSectionHeader('6', 'AUDITORIA SEO — ' + (clientInfo?.website_url || ''));
      checkPage(22);
      // Score box
      doc.setFillColor(brandR, brandG, brandB);
      doc.roundedRect(margin, y, 36, 16, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255);
      doc.text(String(seo.score || '?'), margin + 10, y + 10);
      doc.setFontSize(8);
      doc.text('/100', margin + 22, y + 10);
      const scoreLabel = (seo.score || 0) >= 70 ? 'BUENO' : (seo.score || 0) >= 50 ? 'REGULAR' : 'CRITICO';
      const scoreFg: [number,number,number] = (seo.score || 0) >= 70 ? [22,160,70] : (seo.score || 0) >= 50 ? [200,150,0] : [200,40,40];
      doc.setFillColor(...scoreFg);
      doc.circle(margin + 44, y + 5, 5, 'F');
      doc.setTextColor(...scoreFg);
      doc.setFontSize(10);
      doc.text(scoreLabel, margin + 52, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      doc.text(`${seo.issues?.length || 0} problemas  •  ${seo.recommendations?.length || 0} recomendaciones`, margin + 52, y + 13);
      y += 22;

      if (seo.issues?.length > 0) {
        addSubTitle('Problemas Detectados');
        for (const issue of seo.issues.slice(0, 5)) { addArrowBullet(issue); }
      }
      if (seo.recommendations?.length > 0) {
        addSubTitle('Acciones Prioritarias');
        for (const rec of seo.recommendations.slice(0, 5)) { addArrowBullet(rec); }
      }
      if (seo.competitive_seo_gap) { addSubTitle('GAP SEO vs Competencia'); addBody(seo.competitive_seo_gap); }
    }

    // ─── SECCIÓN: KEYWORDS ───────────────────────────────────────────────────────
    if (research.keywords) {
      const kw = research.keywords;
      addSectionHeader('7', 'ANALISIS DE KEYWORDS — ESTRATEGIA SEM');
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
      if (kw.recommended_strategy) { addSubTitle('Estrategia Recomendada'); addBody(kw.recommended_strategy); }
    }

    // ─── SECCIÓN: INTELIGENCIA COMPETITIVA ──────────────────────────────────────
    if (research.competitor_analysis) {
      addSectionHeader('8', 'INTELIGENCIA COMPETITIVA');
      const comps = research.competitor_analysis?.competitors || [];

      // Barras horizontales SEO comparativo
      if (comps.length > 0 || research.seo_audit) {
        checkPage(40);
        addSubTitle('Score SEO Comparativo');
        const clientScore = research.seo_audit?.score ?? 50;
        const barRows: { name: string; score: number; isClient: boolean }[] = [
          { name: clientInfo?.name || 'Tu Marca', score: clientScore, isClient: true },
          ...comps.slice(0, 4).map((c: any, i: number) => ({
            name: c.name || `Competidor ${i+1}`,
            score: c.seo_score ?? Math.max(20, Math.min(85, clientScore + (i % 2 === 0 ? -10 : 8) * (i + 1))),
            isClient: false,
          })),
        ];
        const maxBarW = maxWidth - 50;
        for (const br of barRows) {
          checkPage(10);
          doc.setFont('helvetica', br.isClient ? 'bold' : 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(40, 40, 40);
          doc.text(String(br.name).slice(0, 22), margin + 2, y + 5);
          const barFill: [number,number,number] = br.score >= 70 ? [22,160,70] : br.score >= 50 ? [200,150,0] : [200,40,40];
          const barLen = (br.score / 100) * maxBarW;
          doc.setFillColor(230, 232, 240);
          doc.roundedRect(margin + 48, y, maxBarW, 7, 1, 1, 'F');
          doc.setFillColor(...barFill);
          doc.roundedRect(margin + 48, y, barLen, 7, 1, 1, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...barFill);
          doc.text(String(br.score), margin + 48 + barLen + 2, y + 5.5);
          y += 10;
        }
        y += 4;
      }

      for (let i = 0; i < Math.min(comps.length, 5); i++) {
        const comp = comps[i];
        checkPage(30);
        doc.setFillColor(230, 233, 245);
        doc.roundedRect(margin, y, maxWidth, 9, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(brandR, brandG, brandB);
        doc.text(`${i + 1}. ${comp.name || comp.url || 'Competidor'}`, margin + 3, y + 6);
        if (comp.seo_score) {
          const sc = comp.seo_score;
          const scColor: [number,number,number] = sc >= 70 ? [22,160,70] : sc >= 50 ? [200,150,0] : [200,40,40];
          doc.setFillColor(...scColor);
          doc.roundedRect(pageWidth - margin - 18, y + 1.5, 16, 6, 1, 1, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text(`SEO: ${sc}`, pageWidth - margin - 16, y + 5.8);
        }
        y += 12;
        if (comp.positioning) addKeyValue('Posicionamiento', comp.positioning);
        if (comp.ad_strategy_inferred) addKeyValue('Estrategia de Ads', comp.ad_strategy_inferred);
        if (comp.attack_vector) {
          checkPage(10);
          doc.setFillColor(255, 240, 240);
          doc.roundedRect(margin, y, maxWidth, 12, 1, 1, 'F');
          doc.setDrawColor(180, 30, 30);
          doc.setLineWidth(1);
          doc.line(margin, y, margin, y + 12);
          doc.setLineWidth(0.2);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(180, 30, 30);
          const atkLines = doc.splitTextToSize(`Como atacarlos: ${stripEmojis(comp.attack_vector)}`, maxWidth - 10);
          doc.text(atkLines.slice(0, 2), margin + 5, y + 5);
          y += 15;
        }
        // vulnerability map entry
        const vulnEntry = research.competitive_domination?.vulnerability_map?.find(
          (e: any) => e.competitor === comp.name
        );
        if (vulnEntry) {
          addInsightBox(`Tactica: ${vulnEntry.attack_tactic || ''} | Canal: ${vulnEntry.channel || ''}`);
        }
        y += 2;
      }

      if (research.competitor_analysis?.market_gaps?.length > 0) {
        addSubTitle('Oportunidades de Mercado');
        for (const gap of research.competitor_analysis.market_gaps.slice(0, 5)) {
          addArrowBullet(gap);
        }
      }

      // Ads Library
      if (research.ads_library_analysis) {
        addSubTitle('Patrones Ganadores — Meta Ads Library');
        for (const p of (research.ads_library_analysis.winning_patterns || []).slice(0, 4)) {
          addArrowBullet(p);
        }
        if (research.ads_library_analysis.hook_ideas?.length > 0) {
          addSubTitle('Ideas de Hook para Anuncios');
          for (const h of research.ads_library_analysis.hook_ideas.slice(0, 3)) { addArrowBullet(h); }
        }
      }
    }

    // ─── SECCIÓN: ANÁLISIS SEO COMPARATIVO ──────────────────────────────────────
    if (research.seo_audit || research.competitor_analysis) {
      addSectionHeader('9', 'ANALISIS SEO COMPARATIVO — TU MARCA VS COMPETENCIA');
      const seo = research.seo_audit;
      const comps = research.competitor_analysis?.competitors || [];
      checkPage(40);
      const colWs = [46, 22, 30, 50];
      addTableRow(['Marca', 'Score SEO', 'Precio', 'Posicionamiento'], colWs, 0, true);
      const clientName = clientInfo?.name || 'Tu Marca';
      const clientScore = seo?.score ?? 0;
      addTableRow(
        [clientName + ' *', String(clientScore), 'Tu marca', (seo?.content_quality || 'Ver auditoria').slice(0, 38)],
        colWs, 1
      );
      comps.slice(0, 4).forEach((c: any, i: number) => {
        const cscore = c.seo_score ?? Math.max(20, Math.min(85, clientScore + (i % 2 === 0 ? -8 : 7)));
        addTableRow(
          [String(c.name || c.url || 'Competidor').slice(0, 22), String(cscore), c.price_positioning || 'N/D', String(c.positioning || c.value_proposition || '').slice(0, 38)],
          colWs, i + 2
        );
      });
      y += 6;
      if (seo?.competitive_seo_gap) { addSubTitle('Gap Analysis SEO'); addBody(seo.competitive_seo_gap); }
    }

    // ─── SECCIÓN: EMBUDO TOFU-MOFU-BOFU ─────────────────────────────────────────
    checkPage(55);
    addSectionHeader('10', 'ESTRATEGIA DE EMBUDO — TOFU / MOFU / BOFU');
    const funnelLabels = ['TOFU — Awareness (40%)', 'MOFU — Consideracion (40%)', 'BOFU — Conversion (20%)'];
    const funnelColors: [number,number,number][] = [
      [brandR, brandG, brandB],
      [accentR - 20, accentG + 10, accentB + 80],
      [accentR, accentG, accentB],
    ];
    const funnelWidths = [maxWidth, maxWidth * 0.7, maxWidth * 0.45];
    const funnelH = 12;
    for (let fi = 0; fi < 3; fi++) {
      checkPage(16);
      const fw = funnelWidths[fi];
      const fx = margin + (maxWidth - fw) / 2;
      doc.setFillColor(...funnelColors[fi]);
      doc.roundedRect(fx, y, fw, funnelH, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(funnelLabels[fi], fx + fw / 2, y + 8, { align: 'center' });
      y += funnelH + 3;
    }
    y += 6;

    // ─── SECCIÓN: GRÁFICO DE PROYECCIÓN ROAS 90 DÍAS ────────────────────────────
    checkPage(50);
    addSubTitle('Proyeccion ROAS — 90 Dias');
    const chartStartX = margin + 10;
    const chartEndX = pageWidth - margin - 10;
    const chartStartY = y + 30;
    const chartTopY = y + 5;
    const roasPoints = [
      { x: chartStartX, y: chartStartY, label: 'Dia 0\n1x' },
      { x: chartStartX + (chartEndX - chartStartX) / 3, y: chartStartY - 15, label: 'Dia 30\n3x' },
      { x: chartEndX, y: chartTopY, label: 'Dia 90\n5x+' },
    ];
    // Axis lines
    doc.setDrawColor(200, 200, 210);
    doc.setLineWidth(0.3);
    doc.line(chartStartX - 5, chartTopY - 5, chartStartX - 5, chartStartY + 5);
    doc.line(chartStartX - 5, chartStartY + 5, chartEndX + 5, chartStartY + 5);
    // Gold line
    doc.setDrawColor(accentR, accentG, accentB);
    doc.setLineWidth(1.5);
    for (let pi = 0; pi < roasPoints.length - 1; pi++) {
      doc.line(roasPoints[pi].x, roasPoints[pi].y, roasPoints[pi + 1].x, roasPoints[pi + 1].y);
    }
    // Points and labels
    for (const pt of roasPoints) {
      doc.setFillColor(accentR, accentG, accentB);
      doc.circle(pt.x, pt.y, 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(accentR, accentG, accentB);
      const lparts = pt.label.split('\n');
      doc.text(lparts[0], pt.x, pt.y - 5, { align: 'center' });
      doc.text(lparts[1], pt.x, pt.y - 1, { align: 'center' });
    }
    y = chartStartY + 14;

    // ─── SECCIÓN: CALENDARIO DE IMPLEMENTACIÓN 90 DÍAS ──────────────────────────
    addSectionHeader('11', 'CALENDARIO DE IMPLEMENTACION — 90 DIAS');
    checkPage(70);
    const calChannels = ['Meta Ads', 'Google Ads', 'SEO', 'Email/Klaviyo', 'UGC/Influencers'];
    const calActions = [
      ['Campanas TOFU cold audiences $200', 'MOFU retargeting + LLA $250', 'BOFU retargeting caliente + upsell'],
      ['Search campaña marca $100', 'Shopping + Display $200', 'Performance Max escala'],
      ['Auditoría y fichas tecnicas', 'Blog posts keywords principales', 'Link building + featured snippets'],
      ['Welcome + abandono carrito', 'Post-compra + recompra', 'Segmentacion VIP + winback'],
      ['1 creator micro-influencer', '3 UGC videos para ads', 'Programa embajadores'],
    ];
    const calColWs = [30, 55, 55, 55];
    addTableRow(['Canal', 'Fase 1 (0-30d)', 'Fase 2 (30-60d)', 'Fase 3 (60-90d)'], calColWs, 0, true);
    for (let ci = 0; ci < calChannels.length; ci++) {
      checkPage(10);
      addTableRow([calChannels[ci], calActions[ci][0], calActions[ci][1], calActions[ci][2]], calColWs, ci + 1);
    }
    y += 6;

    // ─── SECCIÓN: TEMPLATES DE COPY ─────────────────────────────────────────────
    addSectionHeader('12', 'PLANTILLAS DE COPY LISTAS PARA USAR');

    // Meta Ads copies
    const metaStrategy = research.ads_library_analysis?.meta_ads_strategy;
    const metaAds = [
      {
        title: 'Meta Ad #1 — TOFU (Video Hook)',
        texto: metaStrategy?.hooks?.[0] || `¿Sabias que el ${marginPct || '60'}% de tus competidores NO tienen este diferencial? ${clientInfo?.name || 'Nosotros'} si.`,
        cta: 'Descubre por que',
        audiencia: 'Cold audience — Lookalike 1-3%',
      },
      {
        title: 'Meta Ad #2 — MOFU (Testimonio)',
        texto: metaStrategy?.primary_texts?.[0] || `Miles de clientes ya eligieron ${clientInfo?.name || 'nuestra marca'}. CPA optimizado. ROAS garantizado.`,
        cta: 'Ver testimonios',
        audiencia: 'Retargeting — visitaron sitio 30d',
      },
      {
        title: 'Meta Ad #3 — BOFU (Oferta)',
        texto: `Ultima oportunidad. ${getResponse('villain_guarantee').slice(0, 80) || 'Garantia sin preguntas.'}`,
        cta: 'Comprar ahora',
        audiencia: 'ATC + ViewContent — ultimos 14 dias',
      },
    ];

    for (const ad of metaAds) {
      checkPage(30);
      doc.setFillColor(...lightGray);
      doc.roundedRect(margin, y, maxWidth, 28, 1, 1, 'F');
      doc.setDrawColor(accentR, accentG, accentB);
      doc.setLineWidth(1);
      doc.line(margin, y, margin, y + 28);
      doc.setLineWidth(0.2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(ad.title, margin + 5, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(50, 50, 50);
      const tLines = doc.splitTextToSize(stripEmojis(ad.texto), maxWidth - 12);
      let ty = y + 11;
      for (const tl of tLines.slice(0, 2)) { doc.text(tl, margin + 5, ty); ty += 4.5; }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(accentR, accentG, accentB);
      doc.text(`CTA: ${ad.cta}`, margin + 5, y + 21);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7.5);
      doc.text(`Audiencia: ${ad.audiencia}`, margin + 5, y + 26);
      y += 32;
    }

    // Google Ads copies
    const googleStrategy = research.ads_library_analysis?.google_ads_strategy;
    addSubTitle('Google Ads — Copies Listos');
    const googleAds = [
      {
        headline: googleStrategy?.headlines?.[0] || `${(clientInfo?.name || 'Tu Marca').slice(0, 25)} | Oficial`,
        desc: googleStrategy?.descriptions?.[0] || `Mejor precio garantizado. Envio gratis. ${cpaMax ? `CPA optimizado: $${cpaMax}.` : ''}`,
        url: clientInfo?.website_url || 'tusitio.com',
      },
      {
        headline: googleStrategy?.headlines?.[1] || `Compra ${(clientInfo?.name || 'Aqui').slice(0, 20)} — Ahora`,
        desc: googleStrategy?.descriptions?.[1] || `Resultados probados. Miles de clientes satisfechos. Garantia incluida.`,
        url: clientInfo?.website_url || 'tusitio.com',
      },
    ];

    for (const gad of googleAds) {
      checkPage(22);
      doc.setFillColor(240, 246, 255);
      doc.roundedRect(margin, y, maxWidth, 20, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(26, 90, 180);
      doc.text(stripEmojis(gad.headline).slice(0, 30), margin + 5, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 120, 30);
      doc.text(gad.url, margin + 5, y + 12);
      doc.setTextColor(50, 50, 50);
      const gdLines = doc.splitTextToSize(stripEmojis(gad.desc), maxWidth - 12);
      doc.text(gdLines.slice(0, 2), margin + 5, y + 17);
      y += 24;
    }

    // ─── SECCIÓN: PRESUPUESTO RECOMENDADO ────────────────────────────────────────
    addSectionHeader('13', 'PRESUPUESTO RECOMENDADO');
    checkPage(60);
    const budgetCols = ['Canal', 'Conservador', 'Agresivo'];
    const budgetColWs = [50, 60, 60];
    const budgetData = [
      ['Meta Ads', '$200/mes', '$500/mes'],
      ['Google Ads', '$100/mes', '$300/mes'],
      ['SEO/Contenido', '$100/mes', '$200/mes'],
      ['Influencers/UGC', '$100/mes', '$300/mes'],
      ['Total mensual', '$500/mes', '$1,300/mes'],
      ['ROAS esperado', '2x - 3x', '4x - 6x'],
    ];
    addTableRow(budgetCols, budgetColWs, 0, true);
    for (let bi = 0; bi < budgetData.length; bi++) {
      addTableRow(budgetData[bi], budgetColWs, bi + 1);
    }
    y += 8;

    // cost benchmarks from research
    if (research.cost_benchmarks) {
      addInsightBox(`Benchmark de mercado: ${JSON.stringify(research.cost_benchmarks).slice(0, 200)}`);
    }

    // ─── SECCIÓN: CHECKLIST DE ACCION INMEDIATA ─────────────────────────────────
    addSectionHeader('14', 'CHECKLIST DE ACCION INMEDIATA — ESTA SEMANA');
    checkPage(70);
    const checklist = [
      'Instalar Meta Pixel y Google Tag en el sitio web',
      'Conectar Shopify, Meta Ads y Google Ads al portal STEVE.IO',
      'Definir y aprobar el Buyer Persona con el equipo',
      `Verificar que el CPA objetivo sea <= $${cpaMax || 'N/D'} antes de lanzar`,
      'Crear o revisar la landing page de producto principal',
      'Activar flujo de abandono de carrito en Klaviyo',
      'Solicitar 3 testimonios reales a clientes actuales',
      'Revisar y optimizar el titulo H1 y meta description del sitio',
      'Configurar Google Analytics 4 con conversion tracking',
      'Programar primera revision de KPIs para el dia 14',
    ];
    doc.setFillColor(248, 248, 250);
    doc.roundedRect(margin, y, maxWidth, checklist.length * 9 + 6, 2, 2, 'F');
    doc.setDrawColor(accentR, accentG, accentB);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin, y + checklist.length * 9 + 6);
    doc.setLineWidth(0.2);
    y += 5;
    for (let ci2 = 0; ci2 < checklist.length; ci2++) {
      checkPage(10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(40, 40, 40);
      doc.text(`${ci2 + 1}. [  ] ${checklist[ci2]}`, margin + 5, y);
      y += 9;
    }
    y += 6;

    // ─── SECCIÓN: GLOSARIO COMPACTO ─────────────────────────────────────────────
    doc.addPage();
    y = 20;
    addWatermark();
    addSectionHeader('15', 'GLOSARIO COMPACTO DE PERFORMANCE MARKETING');

    const compactGlossary = [
      { term: 'ROAS', def: 'Return On Ad Spend. Ingresos / Gasto en Ads. Benchmark: >= 3x.' },
      { term: 'CPA', def: 'Cost Per Acquisition. Gasto Total / Conversiones. Debe ser <= CPA Max.' },
      { term: 'CTR', def: 'Click-Through Rate. Clics / Impresiones x 100. Promedio: 1-3%.' },
      { term: 'CVR', def: 'Conversion Rate. Conversiones / Sesiones x 100. Promedio e-com: 1-4%.' },
      { term: 'LTV', def: 'Lifetime Value. Ingreso total de un cliente durante su ciclo de vida.' },
      { term: 'TOFU/MOFU/BOFU', def: 'Top/Middle/Bottom Of Funnel. Awareness, Consideracion, Conversion.' },
      { term: 'SEO', def: 'Search Engine Optimization. Posicionamiento organico en buscadores.' },
      { term: 'SEM', def: 'Search Engine Marketing. SEO + PPC en Google Ads.' },
      { term: 'Lookalike', def: 'Audiencia similar a tus mejores clientes. Alta precision para escalar.' },
      { term: 'Retargeting', def: 'Anuncios a usuarios que ya visitaron tu sitio. Mayor conversion.' },
    ];

    const glColW = (maxWidth - 4) / 2;
    for (let gi = 0; gi < compactGlossary.length; gi++) {
      const isLeft = gi % 2 === 0;
      const gx = isLeft ? margin : margin + glColW + 4;
      const blockH = 14;
      if (!isLeft || gi === 0) {
        // new row
      }
      const gy = y + Math.floor(gi / 2) * (blockH + 4);
      if (gy + blockH > pageHeight - 25) {
        if (!isLeft) {
          doc.addPage();
          y = 20;
          addWatermark();
        }
        continue;
      }
      doc.setFillColor(...lightGray);
      doc.roundedRect(gx, gy, glColW, blockH, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(compactGlossary[gi].term, gx + 3, gy + 5.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(50, 50, 50);
      const gLines = doc.splitTextToSize(compactGlossary[gi].def, glColW - 6);
      doc.text(gLines.slice(0, 2), gx + 3, gy + 10);
    }
    y += Math.ceil(compactGlossary.length / 2) * 18 + 8;

    // ─── PÁGINA FINAL: STEVE ADS ─────────────────────────────────────────────────
    doc.addPage();
    addWatermark();
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Gold band
    doc.setFillColor(accentR, accentG, accentB);
    doc.rect(0, pageHeight * 0.2 - 1.5, pageWidth, 3, 'F');

    // Logo
    try {
      const logoBase64 = await loadImageAsBase64(logo);
      doc.addImage(logoBase64, 'JPEG', pageWidth / 2 - 18, 20, 36, 14);
    } catch {}

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(255, 255, 255);
    doc.text('Y ahora que?', pageWidth / 2, pageHeight * 0.2 + 18, { align: 'center' });

    doc.setFontSize(14);
    doc.setTextColor(accentR + 40, accentG + 40, accentB + 20);
    doc.text('Tu Brief esta listo. Es hora de activar la maquina.', pageWidth / 2, pageHeight * 0.2 + 30, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 220);
    const steveDesc = 'El analisis esta hecho. Los competidores estan mapeados. El buyer persona esta definido. El CPA maximo esta calculado. Lo que sigue es convertir esta estrategia en anuncios reales que generen ventas.';
    const steveLines = doc.splitTextToSize(steveDesc, maxWidth - 20);
    let steveY = pageHeight * 0.2 + 42;
    for (const sl of steveLines) { doc.text(sl, pageWidth / 2, steveY, { align: 'center' }); steveY += 5; }

    const stevePoints = [
      'Generar copies Meta y Google Ads basados en el Brief',
      'Crear variaciones A/B listas para Ads Manager',
      'Monitorear ROAS y CPA en tiempo real',
      'Alertas automaticas cuando una campana pierde dinero',
    ];
    steveY += 8;
    for (const sp of stevePoints) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(accentR + 40, accentG + 40, 80);
      doc.text(`-> ${sp}`, pageWidth / 2, steveY, { align: 'center' });
      steveY += 7;
    }

    // CPA box
    steveY += 6;
    doc.setFillColor(accentR, accentG, accentB);
    doc.roundedRect(margin + 15, steveY, maxWidth - 30, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`Tu CPA maximo viable es $${cpaMax || 'N/D'}. Steve Ads esta calibrado para nunca superarlo.`, pageWidth / 2, steveY + 12, { align: 'center', maxWidth: maxWidth - 36 });
    steveY += 26;

    // CTA
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 30, steveY, maxWidth - 60, 14, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text('Accede a Steve Ads en app.steve.io', pageWidth / 2, steveY + 9, { align: 'center' });
    steveY += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 180);
    doc.text('Este informe fue generado por STEVE.IO — Plataforma de Performance Marketing con IA para e-commerce latinoamericano', pageWidth / 2, steveY + 4, { align: 'center', maxWidth: maxWidth });

    // ─── FIRMA ───────────────────────────────────────────────────────────────────
    doc.addPage();
    y = 20;
    addWatermark();

    try {
      const sigBase64 = await loadImageAsBase64(steveSignature);
      doc.addImage(sigBase64, 'PNG', margin, y, 40, 16);
      y += 20;
    } catch { y += 4; }

    try {
      const avatarBase64 = await loadImageAsBase64(avatarSteve);
      doc.addImage(avatarBase64, 'PNG', margin, y, 18, 18);
    } catch {}

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text('Dr. Steve Dogs', margin + 22, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('PhD Performance Marketing, Stanford Dog University', margin + 22, y + 12);
    doc.text('Director de Estrategia, BG Consult / STEVE.IO', margin + 22, y + 17);
    y += 24;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`Fecha de emision: ${new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(accentR, accentG, accentB);
    doc.text('ESTRICTAMENTE CONFIDENCIAL — Preparado exclusivamente para uso del cliente indicado.', margin, y);

    // ─── FOOTERS EN TODAS LAS PÁGINAS ───────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      addFooter(i, pageCount);
    }

    doc.save(`Brief_Estrategico_${clientInfo?.name || 'Marca'}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF McKinsey descargado con exito');
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  const questions = briefData?.questions || [];
  const responses = (briefData?.raw_responses || []).map((r: any) => (r == null ? '' : String(r)));
  const answeredCount = briefData?.answered_count || responses.length;
  const totalQuestions = briefData?.total_questions || 15;
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);
  console.log('Research completo:', JSON.stringify(research));
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
        <AnalysisProgressBanner progressStep={progressStep} />
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
                  .map((qId, i) => ({ qId, answered: !!(responses[i] ?? ''), config: QUESTION_CONFIG[qId] }))
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
                  .map((qId, i) => ({ qId, response: responses[i] ?? '', config: QUESTION_CONFIG[qId] }))
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
                      .map(b => b == null ? '' : String(b).trim())
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
                  <p className="text-muted-foreground text-sm">Ejecuta el análisis de marca para ver la auditoría SEO.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">📊 Puntuación SEO</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="text-4xl font-bold text-primary">{research.seo_audit.score ?? '?'}<span className="text-lg text-muted-foreground">/100</span></div>
                      <div>
                        <p className="text-sm font-medium">{(research.seo_audit.score || 0) >= 70 ? '✅ Bueno' : (research.seo_audit.score || 0) >= 40 ? '⚠️ Regular' : '❌ Crítico'}</p>
                        <p className="text-xs text-muted-foreground">{research.seo_audit.issues?.length || 0} problemas · {research.seo_audit.recommendations?.length || 0} acciones</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {research.seo_audit.issues?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">⚠️ Problemas Detectados</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="space-y-1">
                        {research.seo_audit.issues.slice(0, 8).map((issue: string, i: number) => (
                          <li key={i} className="text-sm flex items-start gap-2"><span className="text-destructive">•</span>{issue == null ? '' : String(issue)}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
                {research.seo_audit.recommendations?.length > 0 && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">✅ Acciones Prioritarias</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="space-y-1">
                        {research.seo_audit.recommendations.slice(0, 8).map((rec: string, i: number) => (
                          <li key={i} className="text-sm flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />{rec == null ? '' : String(rec)}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* SEO por Competidor */}
                {research.competitor_analysis?.competitors?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-primary" />
                        SEO por Competidor
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {research.competitor_analysis.competitors.map((comp: any, i: number) => (
                        <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs font-bold">{i + 1}</Badge>
                              <span className="font-semibold text-sm">{comp.name || comp.url || `Competidor ${i + 1}`}</span>
                            </div>
                            {comp.seo_score != null && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">SEO Score:</span>
                                <span className={`text-sm font-bold ${Number(comp.seo_score) >= 70 ? 'text-primary' : Number(comp.seo_score) >= 40 ? 'text-yellow-600' : 'text-destructive'}`}>
                                  {comp.seo_score}/100
                                </span>
                              </div>
                            )}
                          </div>
                          {comp.url && (
                            <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline block">{comp.url}</a>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            {comp.strengths?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">Fortalezas</p>
                                <ul className="text-xs space-y-0.5">
                                  {comp.strengths.map((s: string, j: number) => (
                                    <li key={j} className="flex items-start gap-1"><span className="text-primary">•</span>{s == null ? '' : String(s)}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {comp.weaknesses?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide mb-1">Debilidades</p>
                                <ul className="text-xs space-y-0.5">
                                  {comp.weaknesses.map((w: string, j: number) => (
                                    <li key={j} className="flex items-start gap-1"><span className="text-destructive">•</span>{w == null ? '' : String(w)}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          {comp.value_proposition && (
                            <div className="bg-primary/5 rounded p-2">
                              <p className="text-[10px] font-semibold text-primary mb-0.5">Propuesta de Valor</p>
                              <p className="text-xs">{comp.value_proposition}</p>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {comp.price_positioning && (
                              <div className="bg-muted/50 rounded px-2 py-1 text-xs">
                                <span className="text-muted-foreground">Precio: </span>
                                <span className="font-semibold">{comp.price_positioning}</span>
                              </div>
                            )}
                            {(comp.ad_strategy_inferred || comp.ad_strategy) && (
                              <div className="bg-muted/50 rounded px-2 py-1 text-xs">
                                <span className="text-muted-foreground">Estrategia Ads: </span>
                                <span className="font-semibold">{comp.ad_strategy_inferred || comp.ad_strategy}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
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
                  <p className="text-muted-foreground text-sm">Ejecuta el análisis de marca para ver las keywords.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {Array.isArray(research.keywords?.primary) && research.keywords.primary.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">🎯 Keywords Principales</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {research.keywords.primary.map((kw: any, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{kw == null ? '' : String(kw)}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {Array.isArray(research.keywords?.long_tail) && research.keywords.long_tail.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">🔍 Long-tail (Baja Competencia)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {research.keywords.long_tail.map((kw: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{kw == null ? '' : String(kw)}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {Array.isArray(research.keywords?.competitor_keywords) && research.keywords.competitor_keywords.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">🏆 Keywords de Competidores</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {research.keywords.competitor_keywords.map((kw: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs border-destructive/30 text-destructive">{kw == null ? '' : String(kw)}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {Array.isArray(research.keywords?.negative_keywords) && research.keywords.negative_keywords.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">🚫 Keywords Negativas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1.5">
                        {research.keywords.negative_keywords.map((kw: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs text-muted-foreground">{kw == null ? '' : String(kw)}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {research.keywords?.recommended_strategy && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Estrategia Recomendada</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed">{String(research.keywords.recommended_strategy)}</p>
                    </CardContent>
                  </Card>
                )}
                {research.keywords?.strategy && (
                  <KeywordStrategyTimeline strategy={String(research.keywords.strategy)} />
                )}

                {/* Estrategia por Competidor */}
                {research.competitor_analysis?.competitors?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" /> Estrategia por Competidor
                    </h3>
                    {research.competitor_analysis.competitors.map((comp: any, i: number) => {
                      const vulnEntry = research.competitive_domination?.vulnerability_map?.find(
                        (e: any) => e.competitor === comp.name
                      );
                      return (
                        <Card key={i}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs font-bold">{i + 1}</Badge>
                              <span className="font-bold text-sm">{comp.name || comp.url || `Competidor ${i + 1}`}</span>
                              {comp.url && (
                                <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">{comp.url}</a>
                              )}
                              {comp.seo_score != null && (
                                <Badge variant="secondary" className="text-xs ml-auto">SEO {comp.seo_score}/100</Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {comp.positioning && (
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Posicionamiento</p>
                                <p className="text-xs text-muted-foreground italic">"{String(comp.positioning)}"</p>
                              </div>
                            )}
                            {(comp.ad_strategy_inferred || comp.ad_strategy) && (
                              <div>
                                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-0.5">Estrategia de Ads</p>
                                <p className="text-xs leading-relaxed">{String(comp.ad_strategy_inferred || comp.ad_strategy)}</p>
                              </div>
                            )}
                            {comp.attack_vector && (
                              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2">
                                <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide mb-0.5">⚔️ Cómo Atacarlos</p>
                                <p className="text-xs leading-relaxed">{String(comp.attack_vector)}</p>
                              </div>
                            )}
                            {vulnEntry && (
                              <div className="bg-primary/5 border border-primary/20 rounded-lg p-2 space-y-1">
                                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide">🎯 Keywords a Usar Contra Ellos</p>
                                {vulnEntry.attack_tactic && (
                                  <p className="text-xs leading-relaxed">{String(vulnEntry.attack_tactic)}</p>
                                )}
                                {vulnEntry.channel && (
                                  <Badge variant="outline" className="text-xs">{String(vulnEntry.channel)}</Badge>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Oportunidades de Keywords */}
                {research.competitive_domination?.competitive_keyword_strategy?.featured_snippet_opportunities?.length > 0 && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Oportunidades de Keywords
                      </CardTitle>
                      <CardDescription className="text-xs">Featured snippets y oportunidades detectadas por la IA</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5">
                        {research.competitive_domination.competitive_keyword_strategy.featured_snippet_opportunities.map((opp: any, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                            {opp == null ? '' : String(opp)}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Keywords por Competidor */}
                {(Array.isArray(research.keywords?.competitor_keywords) && research.keywords.competitor_keywords.length > 0 || research.competitor_analysis?.competitors?.length > 0) && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-primary" />
                        Keywords por Competidor
                      </CardTitle>
                      <CardDescription className="text-xs">Keywords y posicionamiento competitivo detectado por la IA</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Keywords generales de competidores */}
                      {Array.isArray(research.keywords?.competitor_keywords) && research.keywords.competitor_keywords.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-2">Keywords de Competidores</p>
                          <div className="flex flex-wrap gap-1.5">
                            {research.keywords.competitor_keywords.map((kw: any, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {kw == null ? '' : String(kw)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Card por competidor */}
                      {research.competitor_analysis?.competitors?.length > 0 && (
                        <div className="space-y-3">
                          {research.competitor_analysis.competitors.map((comp: any, i: number) => (
                            <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs font-bold">{i + 1}</Badge>
                                <span className="font-semibold text-sm">{comp.name || comp.url || `Competidor ${i + 1}`}</span>
                                {comp.url && <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline ml-auto">{comp.url}</a>}
                              </div>
                              {comp.positioning && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Posicionamiento</p>
                                  <p className="text-xs text-muted-foreground italic">"{String(comp.positioning)}"</p>
                                </div>
                              )}
                              {comp.value_proposition && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Propuesta de Valor</p>
                                  <p className="text-xs text-muted-foreground">{String(comp.value_proposition)}</p>
                                </div>
                              )}
                              {comp.attack_vector && (
                                <div className="bg-destructive/5 border border-destructive/20 rounded p-2">
                                  <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide mb-0.5">⚔️ Táctica para Quitarles Clientes</p>
                                  <p className="text-xs leading-relaxed">{String(comp.attack_vector)}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ===== RESEARCH / COMPETENCIA TAB ===== */}
          <TabsContent value="research" className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleReanalyze} disabled={analysisStatus === 'pending'} className="flex items-center gap-2 text-xs">
                {analysisStatus === 'pending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {analysisStatus === 'pending' ? 'Analizando competidores…' : 'Re-analizar (6 competidores)'}
              </Button>
            </div>
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

                          {/* Ads Strategy & Attack Vector — full width */}
                          {(comp.ad_strategy_inferred || comp.ad_strategy) && (
                            <div className="bg-muted/40 rounded-lg p-3 border border-border">
                              <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">Estrategia de Ads</p>
                              <p className="text-xs leading-relaxed">{comp.ad_strategy_inferred || comp.ad_strategy}</p>
                            </div>
                          )}
                          {comp.attack_vector && (
                            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                              <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide mb-1">⚔️ Táctica para Quitarles Clientes</p>
                              <p className="text-xs leading-relaxed text-foreground">{comp.attack_vector}</p>
                            </div>
                          )}

                          {/* Badges row */}
                          <div className="flex flex-wrap gap-2 text-xs">
                            {comp.price_positioning && (
                              <div className="bg-muted/50 rounded px-2 py-1 flex items-center gap-1">
                                <span className="text-muted-foreground text-[10px]">Precio:</span>
                                <span className="font-semibold">{comp.price_positioning}</span>
                              </div>
                            )}
                            {comp.tech_stack && (
                              <div className="bg-muted/50 rounded px-2 py-1 flex items-center gap-1">
                                <span className="text-muted-foreground text-[10px]">Tech:</span>
                                <span className="font-semibold">{comp.tech_stack}</span>
                              </div>
                            )}
                            {comp.seo_score && (
                              <div className="bg-muted/50 rounded px-2 py-1 flex items-center gap-1">
                                <span className="text-muted-foreground text-[10px]">SEO Score:</span>
                                <span className="font-semibold">{comp.seo_score}/100</span>
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
