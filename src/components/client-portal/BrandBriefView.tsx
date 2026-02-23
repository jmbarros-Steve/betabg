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

// Keyword Strategy Roadmap component — renders structured phase data as visual cards
function KeywordStrategyRoadmap({ roadmap }: { roadmap: any }) {
  // Accept either the raw roadmap object or a stringified version
  if (!roadmap || typeof roadmap !== 'object') return null;
  
  const phaseKeys = Object.keys(roadmap).filter(k => k.startsWith('phase_') || k.startsWith('fase_')).sort();
  if (phaseKeys.length === 0) return null;

  const phaseConfig = [
    { bg: 'bg-blue-500', light: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-400', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', icon: <Zap className="h-4 w-4" /> },
    { bg: 'bg-violet-500', light: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-400', text: 'text-violet-700 dark:text-violet-300', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300', icon: <TrendingUp className="h-4 w-4" /> },
    { bg: 'bg-emerald-500', light: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300', icon: <Rocket className="h-4 w-4" /> },
  ];

  return (
    <Card className="border-primary/20 overflow-hidden">
      <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
        <h3 className="text-sm font-bold text-primary-foreground">Estrategia de Keywords — Hoja de Ruta por Fases</h3>
      </div>
      <CardContent className="p-4">
        <div className="relative">
          {phaseKeys.length > 1 && (
            <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-gradient-to-b from-blue-400 via-violet-400 to-emerald-500 opacity-40" />
          )}
          <div className="space-y-4">
            {phaseKeys.map((key, i) => {
              const phase = roadmap[key];
              if (!phase || typeof phase !== 'object') return null;
              const cfg = phaseConfig[i % phaseConfig.length];
              const phaseNum = i + 1;
              const focus = phase.focus || '';
              const timeline = phase.timeline || '';
              const keywords: string[] = Array.isArray(phase.keywords) ? phase.keywords : [];
              const kpis: string[] = Array.isArray(phase.kpis) ? phase.kpis : [];
              const actions: string[] = Array.isArray(phase.acciones_concretas) ? phase.acciones_concretas : [];

              return (
                <div key={key} className="relative flex gap-3">
                  <div className={`relative z-10 flex-shrink-0 h-10 w-10 rounded-full ${cfg.bg} flex items-center justify-center text-white shadow-md`}>
                    {cfg.icon}
                  </div>
                  <div className={`flex-1 ${cfg.light} rounded-xl border ${cfg.border} p-4 min-w-0`}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        FASE {phaseNum}
                      </span>
                      {focus && <span className={`text-xs font-semibold ${cfg.text}`}>{focus}</span>}
                      {timeline && <span className="text-[10px] text-muted-foreground ml-auto">📅 {timeline}</span>}
                    </div>

                    {/* Keywords as badges */}
                    {keywords.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Keywords</p>
                        <div className="flex flex-wrap gap-1.5">
                          {keywords.map((kw, ki) => (
                            <Badge key={ki} variant="secondary" className="text-xs">{kw}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* KPIs as checklist */}
                    {kpis.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">KPIs</p>
                        <ul className="space-y-1">
                          {kpis.map((kpi, ki) => (
                            <li key={ki} className="flex items-start gap-2 text-xs">
                              <CheckCircle2 className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${cfg.text}`} />
                              <span>{kpi}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Actions as numbered list */}
                    {actions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Acciones Concretas</p>
                        <ol className="space-y-1.5">
                          {actions.map((action, ai) => (
                            <li key={ai} className="flex gap-2 text-xs leading-relaxed">
                              <span className={`font-bold flex-shrink-0 ${cfg.text}`}>{ai + 1}.</span>
                              <span>{action}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
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

// Creative Calendar Timeline component — renders week blocks visually
function CreativeCalendarTimeline({ calendar }: { calendar: any }) {
  if (!calendar || typeof calendar !== 'object') return null;
  const weekKeys = Object.keys(calendar).sort();
  if (weekKeys.length === 0) return null;

  const weekColors = [
    { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-300', dot: 'bg-amber-500' },
    { bg: 'bg-sky-50 dark:bg-sky-950/30', border: 'border-sky-300', dot: 'bg-sky-500' },
    { bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-300', dot: 'bg-rose-500' },
    { bg: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-300', dot: 'bg-teal-500' },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-2">📅 Calendario Creativo</p>
      <div className="relative">
        {weekKeys.length > 1 && (
          <div className="absolute left-3 top-4 bottom-4 w-0.5 bg-border" />
        )}
        <div className="space-y-3">
          {weekKeys.map((key, i) => {
            const week = calendar[key];
            const cfg = weekColors[i % weekColors.length];
            const label = key.replace(/_/g, ' ').replace(/week/i, 'Semana');
            const launch = typeof week === 'string' ? week : week?.launch;
            const testVars: string[] = typeof week === 'object' && Array.isArray(week?.test_variables) ? week.test_variables : [];

            return (
              <div key={key} className="relative flex gap-3 items-start pl-1">
                <div className={`relative z-10 flex-shrink-0 h-6 w-6 rounded-full ${cfg.dot} flex items-center justify-center`}>
                  <span className="text-[10px] font-bold text-white">{i + 1}</span>
                </div>
                <div className={`flex-1 ${cfg.bg} border ${cfg.border} rounded-lg p-3`}>
                  <p className="text-xs font-bold text-foreground mb-1 capitalize">{label}</p>
                  {launch && (
                    <div className="mb-2">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">Lanzar:</span>
                      <p className="text-xs text-foreground">{launch}</p>
                    </div>
                  )}
                  {testVars.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">Variables a testear:</span>
                      <ul className="mt-1 space-y-0.5">
                        {testVars.map((tv, ti) => (
                          <li key={ti} className="text-xs flex items-start gap-1.5">
                            <span className="text-muted-foreground">•</span> {tv}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
  meta_ads_strategy?: any;
  google_ads_strategy?: any;
  action_plan?: any;
  brand_identity?: any;
  financial_analysis?: any;
  consumer_profile?: any;
  positioning_strategy?: any;
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
  { quote: "Speed of implementation separates the rich from the broke.", author: "Alex Hormozi", role: "Founder, Acquisition.com" },
  { quote: "Your ROAS is a vanity metric. Profit per customer is what matters.", author: "Andrew Wilkinson", role: "Tiny Capital" },
  { quote: "Creatives are 70% of your ad performance. Test relentlessly.", author: "Andrew Foxwell", role: "Foxwell Digital" },
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
              {progressStep?.detail?.includes('Claude') || progressStep?.detail?.includes('Opus')
                ? 'Analizando con equipo de Marketing Steve AI'
                : (progressStep?.detail || 'Analizando con equipo de Marketing Steve AI')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analizando con equipo de Marketing Steve AI.
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
  const [analysisPendingSince, setAnalysisPendingSince] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [diagnostic, setDiagnostic] = useState<{ phase1?: string; phase2?: string; phase1Message?: string; phase2Message?: string; dataInDb?: Record<string, boolean> } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchAll();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (progressPollingRef.current) clearInterval(progressPollingRef.current);
      if (dataCheckIntervalRef.current) clearInterval(dataCheckIntervalRef.current);
    };
  }, [clientId]);

  // Track elapsed time while analysis is pending
  const hasAutoAppliedAt120Ref = useRef(false);
  useEffect(() => {
    if (analysisStatus === 'pending') {
      hasAutoAppliedAt120Ref.current = false;
      const start = Date.now();
      setAnalysisPendingSince(start);
      setElapsedSeconds(0);
      const timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setAnalysisPendingSince(null);
      setElapsedSeconds(0);
      setDiagnostic(null);
    }
  }, [analysisStatus]);

  // Actualizar diagnóstico (Fase 1/2 + datos en BD) mientras está pending para ver dónde falla
  useEffect(() => {
    if (analysisStatus !== 'pending' || elapsedSeconds < 15) return;
    const debugKey = `analysis_debug_${clientId}`;
    try {
      const raw = sessionStorage.getItem(debugKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const next: NonNullable<typeof diagnostic> = {};
      if (parsed.phase1) next.phase1 = parsed.phase1 === 'ok' ? 'OK' : parsed.phase1 === 'error' ? `Error (${parsed.phase1Status || '?'})` : parsed.phase1;
      if (parsed.phase2) next.phase2 = parsed.phase2 === 'ok' ? 'OK' : parsed.phase2 === 'error' ? `Error (${parsed.phase2Status || '?'})` : parsed.phase2 === 'running' ? 'En curso' : parsed.phase2;
      if (parsed.phase1Message) next.phase1Message = parsed.phase1Message;
      if (parsed.phase2Message) next.phase2Message = parsed.phase2Message;
      setDiagnostic(prev => ({ ...prev, ...next }));
    } catch (_) {}
  }, [analysisStatus, elapsedSeconds, clientId]);

  useEffect(() => {
    if (analysisStatus !== 'pending' || elapsedSeconds < 25) return;
    (async () => {
      const { data: rows } = await supabase
        .from('brand_research')
        .select('research_type, research_data')
        .eq('client_id', clientId)
        .in('research_type', ['executive_summary', 'seo_audit', 'competitor_analysis', 'keywords']);
      const dataInDb: Record<string, boolean> = {};
      for (const r of rows ?? []) {
        const d = (r as any).research_data;
        const has = !!d && (Array.isArray(d) ? d.length > 0 : typeof d === 'object' ? Object.keys(d).length > 0 : !!d);
        dataInDb[(r as any).research_type] = has;
      }
      setDiagnostic(prev => ({ ...prev, dataInDb }));
    })();
  }, [analysisStatus, elapsedSeconds, clientId]);

  // A los 120 s aplicar automáticamente solo si ya hay datos de research (SEO, keywords, competencia). Si no, seguir comprobando cada 8s.
  useEffect(() => {
    if (analysisStatus !== 'pending' || elapsedSeconds < 120) return;
    if (hasAutoAppliedAt120Ref.current) return;
    hasAutoAppliedAt120Ref.current = true;

    async function hasResearchData(): Promise<boolean> {
      const { data: rows } = await supabase
        .from('brand_research')
        .select('research_type, research_data')
        .eq('client_id', clientId)
        .in('research_type', ['executive_summary', 'seo_audit', 'competitor_analysis', 'keywords']);
      return (rows ?? []).some((r: any) => {
        const d = r.research_data;
        if (!d || typeof d !== 'object') return false;
        if (r.research_type === 'executive_summary' && (d.summary || d.executive_summary)) return true;
        if (r.research_type === 'seo_audit' && (d.issues?.length || d.recommendations?.length || d.score != null || d.score_seo != null || d.problemas_detectados?.length || d.acciones_prioritarias?.length)) return true;
        if (r.research_type === 'competitor_analysis' && (d.competitors?.length || d.individual_analysis?.length || d.overview)) return true;
        if (r.research_type === 'keywords' && (d.recommended?.length || d.primary?.length || d.primary_keywords?.length || d.competitor_keywords?.length)) return true;
        return false;
      });
    }

    async function applyComplete() {
      if (dataCheckIntervalRef.current) {
        clearInterval(dataCheckIntervalRef.current);
        dataCheckIntervalRef.current = null;
      }
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (progressPollingRef.current) clearInterval(progressPollingRef.current);
      await supabase.from('brand_research').upsert({
        client_id: clientId,
        research_type: 'analysis_status',
        research_data: { status: 'complete' },
      }, { onConflict: 'client_id,research_type' });
      await fetchResearch();
      setAnalysisStatus('complete');
      setProgressStep(null);
      toast.success('Análisis aplicado automáticamente — revisa los tabs SEO, Keywords y Competencia.');
    }

    (async () => {
      const hasData = await hasResearchData();
      if (hasData) {
        console.log('[BrandBriefView] A los 120s — hay datos, aplicando análisis en las pestañas');
        await applyComplete();
        return;
      }
      console.log('[BrandBriefView] A los 120s — aún no hay datos, esperando resultados del backend…');
      toast.info('El análisis está tardando. Se aplicará automáticamente cuando haya resultados.');
      dataCheckIntervalRef.current = setInterval(async () => {
        if (await hasResearchData()) {
          console.log('[BrandBriefView] Datos de análisis detectados — aplicando en las pestañas');
          await applyComplete();
        }
      }, 8000);
    })();
  }, [analysisStatus, elapsedSeconds, clientId]);

  async function handleForceShowAnalysis() {
    console.log('[BrandBriefView] 🚨 Emergency force-render triggered after', elapsedSeconds, 's');
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (progressPollingRef.current) clearInterval(progressPollingRef.current);
    await supabase.from('brand_research').upsert({
      client_id: clientId,
      research_type: 'analysis_status',
      research_data: { status: 'complete' },
    }, { onConflict: 'client_id,research_type' });
    await fetchResearch();
    setAnalysisStatus('complete');
    setProgressStep(null);
    toast.success('Análisis forzado — mostrando últimos datos disponibles.');
  }

  // Re-fetch research data whenever analysisStatus transitions to 'complete'
  // This ensures tabs update after a new analysis completes during this session
  const prevAnalysisStatusRef = useRef<string>('idle');
  useEffect(() => {
    if (analysisStatus === 'complete' && prevAnalysisStatusRef.current !== 'complete') {
      fetchResearch();
    }
    prevAnalysisStatusRef.current = analysisStatus;
  }, [analysisStatus]);


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
      console.log('[BrandBriefView] polling analysis_status:', status, data?.research_data);
      if (status === 'complete') {
        console.log('[BrandBriefView] ✅ Analysis complete — fetching research data...');
        clearInterval(pollingRef.current!);
        clearInterval(progressPollingRef.current!);
        await fetchResearch();
        setAnalysisStatus('complete');
        setProgressStep(null);
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

  // ─── Normalization layer: maps backend Spanish keys / complex objects to frontend expected format ───
  function normalizeResearchData(r: ResearchData): ResearchData {
    const s = (v: any): string => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

    // ── SEO AUDIT: score_seo → score, problemas_detectados → issues, acciones_prioritarias → recommendations ──
    if (r.seo_audit && typeof r.seo_audit === 'object') {
      const seo = r.seo_audit;
      // score
      if (seo.score == null && seo.score_seo != null) seo.score = seo.score_seo;
      // issues: object[] → string[]
      if (!Array.isArray(seo.issues) && Array.isArray(seo.problemas_detectados)) {
        seo.issues = seo.problemas_detectados.map((p: any) =>
          typeof p === 'string' ? p : [p.problema, p.impacto, p.solucion].filter(Boolean).map(s).join(' — ')
        );
      }
      // recommendations: object[] → string[]
      if (!Array.isArray(seo.recommendations) && Array.isArray(seo.acciones_prioritarias)) {
        seo.recommendations = seo.acciones_prioritarias.map((a: any) =>
          typeof a === 'string' ? a : [a.accion, a.impacto_esperado ? `(${a.impacto_esperado})` : '', a.plazo ? `[${a.plazo}]` : ''].filter(Boolean).join(' ')
        );
      }
      // competitive_seo_gap from analisis_competidores
      if (!seo.competitive_seo_gap && seo.analisis_competidores) {
        if (typeof seo.analisis_competidores === 'string') {
          seo.competitive_seo_gap = seo.analisis_competidores;
        } else if (typeof seo.analisis_competidores === 'object') {
          // Summarize the competitor analysis object into a readable string
          const parts: string[] = [];
          for (const [key, val] of Object.entries(seo.analisis_competidores)) {
            if (typeof val === 'string') parts.push(val);
            else if (Array.isArray(val)) parts.push(val.map(s).join(', '));
          }
          if (parts.length > 0) seo.competitive_seo_gap = parts.join('. ');
        }
      }
      // meta_analysis from analisis_cliente.meta_titles / meta_descriptions
      if (!seo.meta_analysis && seo.analisis_cliente) {
        const ac = seo.analisis_cliente;
        const metaParts: string[] = [];
        if (ac.meta_titles) metaParts.push(`Títulos: ${ac.meta_titles.evaluacion || ''} — ${ac.meta_titles.mejora || ''}`);
        if (ac.meta_descriptions) metaParts.push(`Descripciones: ${ac.meta_descriptions.evaluacion || ''} — ${ac.meta_descriptions.mejora || ''}`);
        if (metaParts.length > 0) seo.meta_analysis = metaParts.join('. ');
      }
      // content_structure from analisis_cliente.headings / contenido
      if (!seo.content_structure && seo.analisis_cliente) {
        const ac = seo.analisis_cliente;
        const csParts: string[] = [];
        if (ac.headings) csParts.push(`H1: ${ac.headings.h1_detectado || ''} — ${ac.headings.evaluacion || ''} — ${ac.headings.mejora || ''}`);
        if (ac.contenido) csParts.push(`Contenido: ${ac.contenido.evaluacion || ''} — Fortalezas: ${ac.contenido.fortalezas || ''} — Mejora: ${ac.contenido.mejora || ''}`);
        if (csParts.length > 0) seo.content_structure = csParts.join('. ');
      }
    }

    // ── KEYWORDS: primary_keywords → primary, longtail_keywords → long_tail, keyword_strategy_roadmap → recommended_strategy ──
    if (r.keywords && typeof r.keywords === 'object') {
      const kw = r.keywords;
      // primary: object[] → string[] (extract .keyword)
      if (!Array.isArray(kw.primary) && Array.isArray(kw.primary_keywords)) {
        kw.primary = kw.primary_keywords.map((k: any) => typeof k === 'string' ? k : (k?.keyword || s(k)));
      }
      // long_tail: object[] → string[]
      if (!Array.isArray(kw.long_tail) && Array.isArray(kw.longtail_keywords)) {
        kw.long_tail = kw.longtail_keywords.map((k: any) => typeof k === 'string' ? k : (k?.keyword || s(k)));
      }
      // negative_keywords: preserve {keyword, reason} objects — don't flatten to strings
      if (Array.isArray(kw.negative_keywords)) {
        kw.negative_keywords_rich = kw.negative_keywords.map((k: any) => {
          if (typeof k === 'string') return { keyword: k, reason: '' };
          return { keyword: k?.keyword || s(k), reason: k?.reason || '' };
        });
        kw.negative_keywords = kw.negative_keywords.map((k: any) => typeof k === 'string' ? k : (k?.keyword || s(k)));
      }
      // competitor_keywords: object[] → string[]
      if (Array.isArray(kw.competitor_keywords)) {
        kw.competitor_keywords = kw.competitor_keywords.map((k: any) => typeof k === 'string' ? k : (k?.keyword || s(k)));
      }
      // Keep raw roadmap object for structured rendering
      // recommended_strategy from keyword_strategy_roadmap (object with phase_1/2/3) — text fallback for PDF
      if (!kw.recommended_strategy && kw.keyword_strategy_roadmap) {
        const road = kw.keyword_strategy_roadmap;
        if (typeof road === 'string') {
          kw.recommended_strategy = road;
        } else if (typeof road === 'object') {
          const phases: string[] = [];
          for (const [key, val] of Object.entries(road)) {
            const label = key.replace(/_/g, ' ').replace(/phase/i, 'Fase').replace(/fase/i, 'Fase');
            phases.push(`${label}: ${typeof val === 'string' ? val : s(val)}`);
          }
          kw.recommended_strategy = phases.join('. ');
        }
      }
    }

    // ── COMPETITIVE ANALYSIS: individual_analysis → competitors (fortalezas→strengths, debilidades→weaknesses, etc.) ──
    if (r.competitor_analysis && typeof r.competitor_analysis === 'object') {
      const ca = r.competitor_analysis;
      if (!Array.isArray(ca.competitors) && Array.isArray(ca.individual_analysis)) {
        ca.competitors = ca.individual_analysis.map((comp: any) => ({
          ...comp,
          strengths: comp.strengths || comp.fortalezas || [],
          weaknesses: comp.weaknesses || comp.debilidades || [],
          value_proposition: comp.value_proposition || comp.propuesta_valor || '',
          ad_strategy_inferred: comp.ad_strategy_inferred || comp.estrategia_contenido || '',
          positioning: comp.positioning || comp.propuesta_valor || '',
          attack_vector: comp.attack_vector || comp.que_hace_cliente_mejor || '',
          que_hacen_mejor: comp.que_hacen_mejor || '',
          que_hace_cliente_mejor: comp.que_hace_cliente_mejor || '',
          estrategia_contenido: comp.estrategia_contenido || '',
          justificacion_amenaza: comp.justificacion_amenaza || '',
          nivel_amenaza: comp.nivel_amenaza || '',
          source: comp.source || (comp.name?.includes('autodetectado') ? 'auto' : 'user'),
        }));
      }
      // Also enrich existing competitors array with missing fields
      if (Array.isArray(ca.competitors)) {
        ca.competitors = ca.competitors.map((comp: any) => ({
          ...comp,
          strengths: comp.strengths || comp.fortalezas || [],
          weaknesses: comp.weaknesses || comp.debilidades || [],
          value_proposition: comp.value_proposition || comp.propuesta_valor || '',
          que_hacen_mejor: comp.que_hacen_mejor || '',
          que_hace_cliente_mejor: comp.que_hace_cliente_mejor || '',
          estrategia_contenido: comp.estrategia_contenido || '',
          justificacion_amenaza: comp.justificacion_amenaza || '',
          nivel_amenaza: comp.nivel_amenaza || '',
          source: comp.source || (comp.name?.includes('autodetectado') ? 'auto' : 'user'),
        }));
      }
      // benchmark_summary from matriz_comparativa
      if (!ca.benchmark_summary && ca.matriz_comparativa) {
        const mc = ca.matriz_comparativa;
        if (typeof mc === 'string') {
          ca.benchmark_summary = mc;
        } else if (mc.headers && mc.rows) {
          const headers = mc.headers as string[];
          const rows = mc.rows as string[][];
          ca.benchmark_summary = rows.map((row: string[]) => row.map((cell: string, ci: number) => `${headers[ci]}: ${cell}`).join(' | ')).join('\n');
        }
      }
      // market_gaps from general analysis
      if (!Array.isArray(ca.market_gaps) && ca.competitors?.length > 0) {
        // Extract weaknesses as market gaps
        const gaps: string[] = [];
        for (const comp of ca.competitors) {
          if (comp.attack_vector) gaps.push(`${comp.name}: ${comp.attack_vector}`);
        }
        if (gaps.length > 0) ca.market_gaps = gaps;
      }
    }

    // ── ADS LIBRARY ANALYSIS: normalize creative_concepts keys, calendar, market_patterns ──
    if (r.ads_library_analysis && typeof r.ads_library_analysis === 'object') {
      const ads = r.ads_library_analysis;
      // creative_concepts: primary_copy → copy, why_it_works → rationale
      if (Array.isArray(ads.creative_concepts)) {
        ads.creative_concepts = ads.creative_concepts.map((cc: any) => ({
          ...cc,
          copy: cc.copy || cc.primary_copy || '',
          rationale: cc.rationale || cc.why_it_works || '',
        }));
      }
      // market_patterns: dominant_content → dominant_content_type
      if (ads.market_patterns && typeof ads.market_patterns === 'object') {
        if (!ads.market_patterns.dominant_content_type && ads.market_patterns.dominant_content) {
          ads.market_patterns.dominant_content_type = ads.market_patterns.dominant_content;
        }
      }
      // creative_calendar: keep raw object for structured rendering, don't flatten to string
      // (CreativeCalendarTimeline component handles the rendering)
      // No transformation needed — keep ads.creative_calendar as-is
      // winning_patterns: only keep if they came from the backend (not auto-generated from market_patterns)
      // Don't auto-generate — it duplicates market_patterns display
    }

    // ── META ADS STRATEGY: creativos_recomendados → hooks[], primary_texts[] for PDF ──
    if (r.meta_ads_strategy && typeof r.meta_ads_strategy === 'object') {
      const mas = r.meta_ads_strategy;
      if (Array.isArray(mas.creativos_recomendados) && !Array.isArray(mas.hooks)) {
        mas.hooks = mas.creativos_recomendados.map((c: any) => c.hook || '').filter(Boolean);
        mas.primary_texts = mas.creativos_recomendados.map((c: any) => c.copy || '').filter(Boolean);
      }
    }

    // ── GOOGLE ADS STRATEGY: ad_copies[].headline1/2/3 → headlines[], descriptions[] for PDF ──
    if (r.google_ads_strategy && typeof r.google_ads_strategy === 'object') {
      const gas = r.google_ads_strategy;
      if (Array.isArray(gas.ad_copies) && !Array.isArray(gas.headlines)) {
        gas.headlines = gas.ad_copies.flatMap((c: any) => [c.headline1, c.headline2, c.headline3].filter(Boolean));
        gas.descriptions = gas.ad_copies.flatMap((c: any) => [c.description1, c.description2].filter(Boolean));
      }
    }

    // ── ACTION PLAN: array of objects → ensure each item has string fields ──
    if (Array.isArray(r.action_plan)) {
      r.action_plan = r.action_plan.map((item: any) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          return {
            ...item,
            title: item.title || '',
            priority: item.priority || '',
            timeline: item.timeline || '',
            situation: typeof item.situation === 'string' ? item.situation : JSON.stringify(item.situation || ''),
            resolution: typeof item.resolution === 'string' ? item.resolution : JSON.stringify(item.resolution || ''),
          };
        }
        return String(item ?? '');
      });
    }

    return r;
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
    const r: ResearchData = {};
    const SKIP_TYPES = ['analysis_status', 'analysis_progress'];
    let newStatus: 'idle' | 'pending' | 'complete' | 'error' | null = null;
    if (data && data.length > 0) {
      for (const row of data) {
        if (row.research_type === 'analysis_status') {
          const status = (row.research_data as any)?.status;
          if (status === 'pending') newStatus = 'pending';
          else if (status === 'complete') newStatus = 'complete';
          else if (status === 'error') newStatus = 'error';
        } else if (!SKIP_TYPES.includes(row.research_type)) {
          (r as any)[row.research_type] = row.research_data;
        }
      }
    }
    // If executive_summary.summary is a stringified JSON (legacy AI response), parse and merge sections so UI shows SEO, competitors, etc.
    const es = (r as any).executive_summary;
    let normalizedFromSummary = false;
    if (es && typeof es === 'object' && typeof es.summary === 'string') {
      const str = es.summary.trim();
      if (str.startsWith('{') && (str.includes('"seo_audit"') || str.includes('"competitor_analysis"') || str.includes('"keywords"'))) {
        try {
          const parsed = JSON.parse(str);
          if (parsed.seo_audit && !(r as any).seo_audit) { (r as any).seo_audit = parsed.seo_audit; normalizedFromSummary = true; }
          if (parsed.competitor_analysis && !(r as any).competitor_analysis) { (r as any).competitor_analysis = parsed.competitor_analysis; normalizedFromSummary = true; }
          if (parsed.keywords && !(r as any).keywords) { (r as any).keywords = parsed.keywords; normalizedFromSummary = true; }
          if (parsed.ads_library_analysis && !(r as any).ads_library_analysis) (r as any).ads_library_analysis = parsed.ads_library_analysis;
        } catch (_) { /* ignore parse error */ }
      }
    }
    // If we had to normalize from embedded JSON, treat as complete so the analysis is shown (backend may have failed to set status)
    if (normalizedFromSummary && newStatus === 'pending') newStatus = 'complete';

    // ─── Apply normalization: map backend keys → frontend expected format ───
    const normalized = normalizeResearchData(r);

    // Always set both states — research first so render sees data when status changes
    setResearch(normalized);
    if (newStatus) setAnalysisStatus(newStatus);
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

  // Filter out invalid/short competitor URLs (e.g. https://www.co)
  function isValidCompetitorUrl(u: string): boolean {
    try {
      const full = u.startsWith('http') ? u : `https://${u}`;
      const host = new URL(full).hostname.replace(/^www\./, '');
      return host.length >= 8;
    } catch {
      return false;
    }
  }

  // Extract competitor URLs from brief Q9 (competitors) — supports comp1_url:, Web/🌐, and URL/domain patterns; filters bogus URLs
  function extractCompetitorUrlsFromBrief(): string[] {
    if (!briefData?.questions || !briefData?.raw_responses) return [];
    const idx = briefData.questions.indexOf('competitors');
    if (idx < 0) return [];
    const response = String(briefData.raw_responses[idx] ?? '');
    const urls: string[] = [];
    const compUrlRegex = /comp[123]_url\s*:\s*([^\s\n,]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = compUrlRegex.exec(response)) !== null) {
      const url = m[1].trim();
      if (url && url.length > 4) {
        const u = url.startsWith('http') ? url : `https://${url}`;
        if (isValidCompetitorUrl(u)) urls.push(u);
      }
    }
    if (urls.length === 0) {
      const urlMatches = response.match(/(?:Web[^:]*:\s*|🌐\s*)([^\s\n,]+\.[a-z]{2,})/gi) || [];
      for (const match of urlMatches) {
        const url = match.replace(/^(?:Web[^:]*:\s*|🌐\s*)/i, '').trim();
        if (url) {
          const u = url.startsWith('http') ? url : `https://${url}`;
          if (isValidCompetitorUrl(u)) urls.push(u);
        }
      }
    }
    if (urls.length === 0) {
      const fullUrls = response.match(/(?:https?:\/\/)?(?:www\.)?[\w.-]+\.(?:com|cl|mx|ar|co|pe|es|io|store|shop)(?:\/\S*)?/gi) || [];
      const domainMatches = response.match(/\b[\w-]+\.(?:cl|com|com\.ar|mx|pe|co|es|io)\b/g) || [];
      [...fullUrls, ...domainMatches].forEach(d => {
        const u = d.startsWith('http') ? d : `https://${d}`;
        if (isValidCompetitorUrl(u) && !urls.includes(u)) urls.push(u);
      });
    }
    return [...new Set(urls)].slice(0, 6);
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

    // Two-phase analysis: research (data analysis) → strategy (AI strategy)
    // Each phase fits within the 150s edge function timeout
    const competitorUrls = extractCompetitorUrlsFromBrief();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'jnqivntlkemzcpomkvwv';
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    };

    const debugKey = `analysis_debug_${clientId}`;
    const setDebug = (updates: Record<string, unknown>) => {
      try {
        const prev = JSON.parse(sessionStorage.getItem(debugKey) || '{}');
        sessionStorage.setItem(debugKey, JSON.stringify({ ...prev, ...updates, at: Date.now() }));
      } catch (_) {}
    };

    // Phase 1: data analysis (fast, ~30s)
    setDebug({ phase1: 'running', phase2: 'pending' });
    let research: any = null;
    try {
      const researchRes = await fetch(`https://${projectId}.supabase.co/functions/v1/analyze-brand-research`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ client_id: clientId, website_url: websiteUrl, competitor_urls: competitorUrls }),
      });
      if (researchRes.ok) {
        const researchData = await researchRes.json();
        research = researchData.research;
        setDebug({ phase1: 'ok', phase1Status: 200 });
      } else {
        const errBody = await researchRes.text();
        setDebug({ phase1: 'error', phase1Status: researchRes.status, phase1Message: errBody.slice(0, 300) });
        console.error('analyze-brand-research error:', researchRes.status, errBody.slice(0, 500));
      }
    } catch (err: any) {
      setDebug({ phase1: 'error', phase1Message: err?.message || String(err) });
      console.error('analyze-brand-research failed:', err);
    }

    // Phase 2: strategy — await to capture error for diagnóstico
    if (research) {
      setDebug({ phase2: 'running' });
      try {
        const strategyRes = await fetch(`https://${projectId}.supabase.co/functions/v1/analyze-brand-strategy`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ client_id: clientId, research }),
        });
        if (strategyRes.ok) {
          setDebug({ phase2: 'ok', phase2Status: 200 });
        } else {
          const errBody = await strategyRes.text();
          setDebug({ phase2: 'error', phase2Status: strategyRes.status, phase2Message: errBody.slice(0, 300) });
          if (strategyRes.status !== 429) console.error('analyze-brand-strategy error:', strategyRes.status, errBody.slice(0, 500));
        }
      } catch (err: any) {
        setDebug({ phase2: 'error', phase2Message: err?.message || String(err) });
        console.log('analyze-brand-strategy ended (polling tracks status):', err?.message);
      }
    } else {
      setDebug({ phase2: 'skipped', phase2Message: 'Fase 1 falló' });
      console.error('Skipping strategy phase — research phase failed');
    }
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
      doc.saveGraphicsState();
      // @ts-ignore
      doc.setGState(new doc.GState({ opacity: 0.03 }));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
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
      y += 14; // increased spacing before section
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
      checkPage(10);
      const rowH = 9;
      const rowX = margin;
      let cx = rowX;
      if (header) {
        doc.setFillColor(brandR, brandG, brandB);
      } else {
        if (rowIdx % 2 === 0) {
          doc.setFillColor(255, 255, 255);
        } else {
          doc.setFillColor(245, 246, 252);
        }
      }
      // fill background
      doc.rect(rowX, y, maxWidth, rowH, 'F');
      // cell borders
      doc.setDrawColor(204, 204, 204);
      doc.setLineWidth(0.2);
      doc.rect(rowX, y, maxWidth, rowH, 'S');
      cx = rowX;
      doc.setFont('helvetica', header ? 'bold' : 'normal');
      doc.setFontSize(header ? 9 : 8.5);
      doc.setTextColor(header ? 255 : 40, header ? 255 : 40, header ? 255 : 40);
      for (let i = 0; i < cells.length; i++) {
        // vertical divider between cells
        if (i > 0) {
          doc.setDrawColor(204, 204, 204);
          doc.setLineWidth(0.2);
          doc.line(cx, y, cx, y + rowH);
        }
        const txt = String(cells[i] ?? '').slice(0, 50);
        doc.text(txt, cx + 6, y + 6);
        cx += colWidths[i];
      }
      y += rowH;
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

    // (SEO semáforo moved to SEO audit section — removed from KPI dashboard)


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
      addKeyValue('Margen Bruto', `${formatCurrency(financials.price - financials.cost - financials.shipping)} (${marginPct}%)`);
      addKeyValue('CPA Maximo Viable', `$${cpaMax}`);
      // CPA explanation box
      if (cpaMax && margin !== null) {
        checkPage(22);
        doc.setFillColor(255, 253, 240);
        doc.roundedRect(margin, y, maxWidth, 20, 1, 1, 'F');
        doc.setDrawColor(accentR, accentG, accentB);
        doc.setLineWidth(1.5);
        doc.line(margin, y, margin, y + 20);
        doc.setLineWidth(0.2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(60, 40, 0);
        const cpaExplain = `Por que $${cpaMax}? Tu margen bruto unitario es de ${formatCurrency(margin)}. El CPA maximo viable corresponde al 30% de ese margen, lo que garantiza rentabilidad incluso en campanas de adquisicion nuevas. Superar este umbral significa vender a perdida.`;
        const cpaLines = doc.splitTextToSize(cpaExplain, maxWidth - 10);
        doc.text(cpaLines.slice(0, 4), margin + 5, y + 6);
        y += 24;
      }
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
        // Fix #6: use helvetica to avoid character-spaced monospace rendering
        const compDisplayName = String(comp.name || comp.url || 'Competidor');
        doc.text(`${i + 1}. ${compDisplayName}`, margin + 3, y + 6);
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

    // Meta Ads copies — rendered as proper visual table
    const metaStrategy = (research as any).meta_ads_strategy || research.ads_library_analysis?.meta_ads_strategy;
    // Use business name from brief (not client name/owner name)
    const businessName = stripEmojis(getResponse('business_pitch')).split(/[.,\n]/)[0].slice(0, 40).trim() || clientInfo?.company || clientInfo?.name || 'Tu Marca';
    const metaAds = [
      {
        title: 'Meta Ad #1 — TOFU (Video Hook)',
        texto: metaStrategy?.hooks?.[0] || `¿Sabias que el ${marginPct || '60'}% de tus competidores NO tienen este diferencial? ${businessName} si.`,
        cta: 'Descubre por que',
        audiencia: 'Cold audience — Lookalike 1-3%',
      },
      {
        title: 'Meta Ad #2 — MOFU (Testimonio)',
        texto: metaStrategy?.primary_texts?.[0] || `Miles de clientes ya eligieron ${businessName}. CPA optimizado. ROAS garantizado.`,
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

    // Meta Ads table
    addSubTitle('Meta Ads — Copies Listos');
    checkPage(10 + metaAds.length * 11);
    const metaColWs = [55, 75, 28, 40];
    const metaHeaders = ['Anuncio', 'Texto Principal', 'CTA', 'Audiencia'];
    addTableRow(metaHeaders, metaColWs, 0, true);
    for (let mi = 0; mi < metaAds.length; mi++) {
      const ad = metaAds[mi];
      checkPage(12);
      const rowH = 11;
      const rowIdx = mi + 1;
      doc.setFillColor(rowIdx % 2 === 0 ? 255 : 245, rowIdx % 2 === 0 ? 255 : 246, rowIdx % 2 === 0 ? 255 : 252);
      doc.rect(margin, y, maxWidth, rowH, 'F');
      doc.setDrawColor(204, 204, 204);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, maxWidth, rowH, 'S');
      const mCols = [
        ad.title.replace('Meta Ad ', ''),
        stripEmojis(ad.texto).slice(0, 55),
        ad.cta,
        ad.audiencia.slice(0, 28),
      ];
      let mcx = margin;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 40);
      for (let ci = 0; ci < mCols.length; ci++) {
        if (ci > 0) {
          doc.setDrawColor(204, 204, 204);
          doc.line(mcx, y, mcx, y + rowH);
        }
        doc.text(mCols[ci], mcx + 4, y + 7);
        mcx += metaColWs[ci];
      }
      y += rowH;
    }
    y += 8;

    // Google Ads copies — rendered as proper visual table
    const googleStrategy = (research as any).google_ads_strategy || research.ads_library_analysis?.google_ads_strategy;
    addSubTitle('Google Ads — Copies Listos');
    checkPage(10 + 3 * 11);
    const googleAds = [
      {
        headline: googleStrategy?.headlines?.[0] || `${businessName.slice(0, 25)} | Oficial`,
        desc: googleStrategy?.descriptions?.[0] || `Mejor precio garantizado. Envio gratis. ${cpaMax ? `CPA: $${cpaMax}.` : ''}`,
        url: clientInfo?.website_url || 'tusitio.com',
      },
      {
        headline: googleStrategy?.headlines?.[1] || `Compra ${businessName.slice(0, 20)} — Ahora`,
        desc: googleStrategy?.descriptions?.[1] || `Resultados probados. Miles de clientes satisfechos. Garantia incluida.`,
        url: clientInfo?.website_url || 'tusitio.com',
      },
    ];
    const gColWs = [60, 90, 50];
    const gHeaders = ['Headline (30 car.)', 'Descripcion (90 car.)', 'URL display'];
    addTableRow(gHeaders, gColWs, 0, true);
    for (let gi2 = 0; gi2 < googleAds.length; gi2++) {
      const gad = googleAds[gi2];
      checkPage(12);
      const rowH = 11;
      const rowIdx = gi2 + 1;
      doc.setFillColor(rowIdx % 2 === 0 ? 255 : 245, rowIdx % 2 === 0 ? 255 : 246, rowIdx % 2 === 0 ? 255 : 252);
      doc.rect(margin, y, maxWidth, rowH, 'F');
      doc.setDrawColor(204, 204, 204);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, maxWidth, rowH, 'S');
      const gCells = [
        stripEmojis(gad.headline).slice(0, 30),
        stripEmojis(gad.desc).slice(0, 60),
        gad.url.replace(/^https?:\/\//, '').slice(0, 30),
      ];
      let gcx = margin;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 40);
      for (let ci = 0; ci < gCells.length; ci++) {
        if (ci > 0) {
          doc.setDrawColor(204, 204, 204);
          doc.line(gcx, y, gcx, y + rowH);
        }
        doc.text(gCells[ci], gcx + 4, y + 7);
        gcx += gColWs[ci];
      }
      y += rowH;
    }
    y += 8;

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

    // cost benchmarks — show as insight box only if it has named fields, not raw JSON
    if (research.cost_benchmarks && typeof research.cost_benchmarks === 'object') {
      const cb = research.cost_benchmarks as Record<string, any>;
      const cbKeys = Object.keys(cb).slice(0, 4);
      if (cbKeys.length > 0) {
        const cbText = cbKeys.map(k => `${k}: ${String(cb[k])}`).join('  |  ');
        addInsightBox(`Benchmark de mercado: ${cbText}`);
      }
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

    // ─── FIRMA — tercio superior compacto ────────────────────────────────────────
    doc.addPage();
    y = 18;
    addWatermark();

    try {
      const sigBase64 = await loadImageAsBase64(steveSignature);
      doc.addImage(sigBase64, 'PNG', margin, y, 38, 14);
      y += 17;
    } catch { y += 4; }

    try {
      const avatarBase64 = await loadImageAsBase64(avatarSteve);
      doc.addImage(avatarBase64, 'PNG', margin, y, 16, 16);
    } catch {}

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text('Dr. Steve Dogs', margin + 20, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.text('PhD Performance Marketing, Stanford Dog University', margin + 20, y + 10);
    doc.text('Director de Estrategia, BG Consult / STEVE.IO', margin + 20, y + 15);
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Fecha de emision: ${new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
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
        <div className="space-y-3">
          <AnalysisProgressBanner progressStep={progressStep} />
          {diagnostic && elapsedSeconds >= 15 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs font-mono space-y-1">
              <p className="font-semibold text-foreground">Diagnóstico (para localizar la falla):</p>
              <p className="text-muted-foreground">
                Fase 1 (análisis de datos): {diagnostic.phase1 ?? '—'} {diagnostic.phase1Message && <span className="text-amber-600">→ {diagnostic.phase1Message}</span>}
              </p>
              <p className="text-muted-foreground">
                Fase 2 (estrategia IA): {diagnostic.phase2 ?? '—'} {diagnostic.phase2Message && <span className="text-amber-600">→ {diagnostic.phase2Message}</span>}
              </p>
              {diagnostic.dataInDb && (
                <p className="text-muted-foreground">
                  Datos en BD: executive_summary={diagnostic.dataInDb.executive_summary ? 'sí' : 'no'}, seo_audit={diagnostic.dataInDb.seo_audit ? 'sí' : 'no'}, competitor_analysis={diagnostic.dataInDb.competitor_analysis ? 'sí' : 'no'}, keywords={diagnostic.dataInDb.keywords ? 'sí' : 'no'}
                </p>
              )}
            </div>
          )}
          {elapsedSeconds >= 120 && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-green-400/40 bg-green-50 dark:bg-green-950/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <p className="text-xs text-green-700 dark:text-green-400">
                  A los 2 min el análisis se aplica automáticamente en las pestañas SEO, Keywords y Competencia. Si no se ha actualizado, pulsa el botón.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleForceShowAnalysis}
                className="text-xs border-green-500 text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30 ml-3 whitespace-nowrap"
              >
                📊 Ver análisis generado
              </Button>
            </div>
          )}
        </div>
      )}

      {analysisStatus === 'complete' && hasResearch && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
            <p className="text-sm text-primary font-medium">Análisis completado — revisa los tabs SEO, Keywords y Competencia.</p>
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

                {/* SEO Comparative Analysis */}
                {(research.seo_audit.competitive_seo_gap || research.seo_audit.meta_analysis || research.seo_audit.content_structure) && (
                  <Card className="border-primary/20">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /> Análisis SEO Comparativo vs Competencia</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {research.seo_audit.competitive_seo_gap && (
                        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                          <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide mb-1">Gap SEO vs Competencia</p>
                          <p className="text-xs leading-relaxed">{String(research.seo_audit.competitive_seo_gap)}</p>
                        </div>
                      )}
                      {research.seo_audit.meta_analysis && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">Meta Tags: Cliente vs Competidores</p>
                          <p className="text-xs leading-relaxed">{String(research.seo_audit.meta_analysis)}</p>
                        </div>
                      )}
                      {research.seo_audit.content_structure && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">Estructura de Contenido</p>
                          <p className="text-xs leading-relaxed">{String(research.seo_audit.content_structure)}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

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
                {Array.isArray(research.keywords?.negative_keywords_rich) && research.keywords.negative_keywords_rich.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">🚫 Keywords Negativas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {research.keywords.negative_keywords_rich.map((kw: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <Badge variant="outline" className="text-xs text-muted-foreground flex-shrink-0">{kw?.keyword || String(kw)}</Badge>
                            {kw?.reason && <span className="text-muted-foreground italic">— {kw.reason}</span>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {/* Keyword Strategy Roadmap — structured phases */}
                {research.keywords?.keyword_strategy_roadmap && typeof research.keywords.keyword_strategy_roadmap === 'object' && (
                  <KeywordStrategyRoadmap roadmap={research.keywords.keyword_strategy_roadmap} />
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

                {/* Competitor Cards — Full Detail */}
                {research.competitor_analysis?.competitors && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-primary" /> Análisis por Competidor ({research.competitor_analysis.competitors.length})
                    </h3>
                    {/* Group by source */}
                    {(() => {
                      const comps = research.competitor_analysis.competitors as any[];
                      const userComps = comps.filter((c: any) => c.source === 'user');
                      const autoComps = comps.filter((c: any) => c.source === 'auto');
                      const renderComp = (comp: any, i: number) => (
                        <Card key={i} className="overflow-hidden">
                          <CardHeader className="pb-3 bg-muted/30">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs font-bold">{i + 1}</Badge>
                              <h4 className="font-bold text-base">{comp.name || comp.url}</h4>
                              {comp.nivel_amenaza && (
                                <Badge className={`text-xs ${
                                  comp.nivel_amenaza === 'alto' ? 'bg-destructive text-destructive-foreground' :
                                  comp.nivel_amenaza === 'medio' ? 'bg-yellow-500 text-white' :
                                  'bg-green-500 text-white'
                                }`}>
                                  {comp.nivel_amenaza === 'alto' ? '🔴' : comp.nivel_amenaza === 'medio' ? '🟡' : '🟢'} Amenaza {comp.nivel_amenaza}
                                </Badge>
                              )}
                              {comp.source === 'auto' && (
                                <Badge variant="secondary" className="text-[10px]">🤖 Detectado por IA</Badge>
                              )}
                              {comp.url && <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline ml-auto">{comp.url}</a>}
                            </div>
                            {comp.justificacion_amenaza && (
                              <p className="text-xs text-muted-foreground mt-1 italic">{comp.justificacion_amenaza}</p>
                            )}
                          </CardHeader>
                          <CardContent className="space-y-3 pt-4">
                            {/* Propuesta de Valor */}
                            {comp.value_proposition && (
                              <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                                <p className="text-xs font-semibold text-primary mb-1">Propuesta de Valor</p>
                                <p className="text-sm leading-relaxed">{comp.value_proposition}</p>
                              </div>
                            )}

                            {/* Fortalezas & Debilidades */}
                            <div className="grid grid-cols-2 gap-3">
                              {comp.strengths?.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium flex items-center gap-1 mb-1.5">✅ Fortalezas</p>
                                  <ul className="text-xs space-y-1">{comp.strengths.map((s: string, j: number) => (
                                    <li key={j} className="flex items-start gap-1.5"><span className="text-green-500 flex-shrink-0">✓</span> {s}</li>
                                  ))}</ul>
                                </div>
                              )}
                              {comp.weaknesses?.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium flex items-center gap-1 mb-1.5">❌ Debilidades</p>
                                  <ul className="text-xs space-y-1">{comp.weaknesses.map((w: string, j: number) => (
                                    <li key={j} className="flex items-start gap-1.5"><span className="text-destructive flex-shrink-0">✗</span> {w}</li>
                                  ))}</ul>
                                </div>
                              )}
                            </div>

                            {/* Qué hacen mejor vs Qué hacemos mejor */}
                            <div className="grid grid-cols-2 gap-3">
                              {comp.que_hacen_mejor && (
                                <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800">
                                  <p className="text-xs font-semibold flex items-center gap-1 mb-1">⚠️ Qué Hacen Mejor</p>
                                  <p className="text-xs leading-relaxed">{comp.que_hacen_mejor}</p>
                                </div>
                              )}
                              {comp.que_hace_cliente_mejor && (
                                <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                                  <p className="text-xs font-semibold flex items-center gap-1 mb-1">💪 Qué Hacemos Mejor</p>
                                  <p className="text-xs leading-relaxed">{comp.que_hace_cliente_mejor}</p>
                                </div>
                              )}
                            </div>

                            {/* Estrategia de Contenido */}
                            {comp.estrategia_contenido && (
                              <div className="bg-muted/40 rounded-lg p-3 border border-border">
                                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">📝 Estrategia de Contenido</p>
                                <p className="text-xs leading-relaxed">{comp.estrategia_contenido}</p>
                              </div>
                            )}

                            {/* Attack Vector */}
                            {comp.attack_vector && comp.attack_vector !== comp.que_hace_cliente_mejor && (
                              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                                <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide mb-1">⚔️ Cómo Atacarlos</p>
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
                              {comp.seo_score && (
                                <div className="bg-muted/50 rounded px-2 py-1 flex items-center gap-1">
                                  <span className="text-muted-foreground text-[10px]">SEO:</span>
                                  <span className="font-semibold">{comp.seo_score}/100</span>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                      return (
                        <>
                          {userComps.length > 0 && (
                            <div className="space-y-3">
                              <p className="text-xs text-muted-foreground font-medium">👤 Competidores ingresados por ti</p>
                              {userComps.map(renderComp)}
                            </div>
                          )}
                          {autoComps.length > 0 && (
                            <div className="space-y-3 mt-4">
                              <p className="text-xs text-muted-foreground font-medium">🤖 Competidores detectados automáticamente</p>
                              {autoComps.map((c, i) => renderComp(c, i + userComps.length))}
                            </div>
                          )}
                          {userComps.length === 0 && autoComps.length === 0 && comps.map(renderComp)}
                        </>
                      );
                    })()}
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

                {/* Positioning Strategy */}
                {research.positioning_strategy && typeof research.positioning_strategy === 'object' && (
                  <Card className="border-primary/20 overflow-hidden">
                    <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-3">
                      <h3 className="text-sm font-bold text-primary-foreground flex items-center gap-2">
                        <Target className="h-4 w-4" /> Estrategia de Posicionamiento
                      </h3>
                    </div>
                    <CardContent className="space-y-4 pt-4">
                      {/* Statement */}
                      {(research.positioning_strategy as any).statement_posicionamiento && (
                        <div className="bg-primary/5 rounded-xl p-4 border border-primary/20">
                          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Positioning Statement</p>
                          <p className="text-sm leading-relaxed font-medium italic">"{(research.positioning_strategy as any).statement_posicionamiento}"</p>
                        </div>
                      )}

                      {/* Posicionamiento Recomendado */}
                      {(research.positioning_strategy as any).posicionamiento_recomendado && (
                        <div className="bg-muted/50 rounded-lg p-3 border border-border">
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">🎯 Posicionamiento Recomendado</p>
                          <p className="text-xs leading-relaxed">{(research.positioning_strategy as any).posicionamiento_recomendado}</p>
                        </div>
                      )}

                      {/* Posicionamiento Actual */}
                      {(research.positioning_strategy as any).posicionamiento_actual && (
                        <div className="bg-muted/50 rounded-lg p-3 border border-border">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">📍 Posicionamiento Actual</p>
                          <p className="text-xs leading-relaxed">{(research.positioning_strategy as any).posicionamiento_actual}</p>
                        </div>
                      )}

                      {/* Territorios de Comunicación */}
                      {Array.isArray((research.positioning_strategy as any).territorios_comunicacion) && (research.positioning_strategy as any).territorios_comunicacion.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-2">🏷️ Territorios de Comunicación</p>
                          <div className="flex flex-wrap gap-2">
                            {(research.positioning_strategy as any).territorios_comunicacion.map((t: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mensajes Clave Diferenciadores */}
                      {Array.isArray((research.positioning_strategy as any).mensajes_clave_diferenciadores) && (research.positioning_strategy as any).mensajes_clave_diferenciadores.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-2">💬 Mensajes Clave</p>
                          <ul className="space-y-2">
                            {(research.positioning_strategy as any).mensajes_clave_diferenciadores.map((m: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs bg-muted/40 rounded-lg p-2.5 border border-border">
                                <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                                <span className="leading-relaxed">{m}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Mapa Perceptual */}
                      {(research.positioning_strategy as any).mapa_perceptual && (
                        <div className="bg-muted/30 rounded-lg p-4 border border-border">
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-2">📊 Mapa Perceptual</p>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="text-xs"><span className="text-muted-foreground">Eje X:</span> <span className="font-medium">{(research.positioning_strategy as any).mapa_perceptual.eje_x}</span></div>
                            <div className="text-xs"><span className="text-muted-foreground">Eje Y:</span> <span className="font-medium">{(research.positioning_strategy as any).mapa_perceptual.eje_y}</span></div>
                          </div>
                          {(research.positioning_strategy as any).mapa_perceptual.posiciones && (
                            <div className="space-y-2">
                              {Object.entries((research.positioning_strategy as any).mapa_perceptual.posiciones).map(([key, val]: [string, any]) => (
                                <div key={key} className="flex items-center gap-3 text-xs bg-background rounded p-2 border border-border">
                                  <Badge variant="outline" className="text-[10px] capitalize">{key}</Badge>
                                  <span className="text-muted-foreground">({val.x}, {val.y})</span>
                                  <span className="flex-1">{val.descripcion}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Posicionamiento de Competidores */}
                      {(research.positioning_strategy as any).posicionamiento_competidores && typeof (research.positioning_strategy as any).posicionamiento_competidores === 'object' && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">🏆 Cómo se Posicionan los Competidores</p>
                          <div className="space-y-2">
                            {Object.entries((research.positioning_strategy as any).posicionamiento_competidores).map(([name, desc]: [string, any]) => (
                              <div key={name} className="flex items-start gap-2 text-xs border-l-2 border-muted pl-3 py-1">
                                <span className="font-semibold capitalize min-w-[80px]">{name}:</span>
                                <span className="text-muted-foreground">{typeof desc === 'string' ? desc : JSON.stringify(desc)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Ads Library Analysis */}
                {research.ads_library_analysis ? (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Megaphone className="h-5 w-5 text-primary" />
                        Análisis de Ads Library & Estrategia Creativa
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Competitor Strategies */}
                      {research.ads_library_analysis.competitor_strategies?.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-primary uppercase tracking-wide">🎯 Estrategia Publicitaria por Competidor</p>
                          {research.ads_library_analysis.competitor_strategies.map((cs: any, i: number) => (
                            <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                              <p className="font-semibold text-sm">{cs.name || `Competidor ${i + 1}`}</p>
                              {cs.messaging_approach && <div className="text-xs"><span className="text-muted-foreground">Mensajes:</span> {cs.messaging_approach}</div>}
                              {cs.value_proposition_promoted && <div className="text-xs"><span className="text-muted-foreground">Propuesta:</span> {cs.value_proposition_promoted}</div>}
                              {cs.probable_formats && <div className="text-xs"><span className="text-muted-foreground">Formatos:</span> {cs.probable_formats}</div>}
                              {cs.cta_used && <div className="text-xs"><span className="text-muted-foreground">CTAs:</span> {cs.cta_used}</div>}
                              {cs.sales_angles && <div className="text-xs"><span className="text-muted-foreground">Ángulos:</span> {cs.sales_angles}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Market Patterns */}
                      {research.ads_library_analysis.market_patterns && (
                        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-primary uppercase tracking-wide">📊 Patrones del Mercado</p>
                          {research.ads_library_analysis.market_patterns.dominant_content_type && <div className="text-xs"><span className="text-muted-foreground">Contenido dominante:</span> {research.ads_library_analysis.market_patterns.dominant_content_type}</div>}
                          {research.ads_library_analysis.market_patterns.probable_formats && <div className="text-xs"><span className="text-muted-foreground">Formatos más usados:</span> {research.ads_library_analysis.market_patterns.probable_formats}</div>}
                          {research.ads_library_analysis.market_patterns.common_messages && <div className="text-xs"><span className="text-muted-foreground">Mensajes comunes:</span> {research.ads_library_analysis.market_patterns.common_messages}</div>}
                        </div>
                      )}

                      {/* Creative Concepts */}
                      {research.ads_library_analysis.creative_concepts?.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-primary uppercase tracking-wide">💡 Conceptos Creativos Recomendados</p>
                          {research.ads_library_analysis.creative_concepts.map((cc: any, i: number) => (
                            <div key={i} className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">{i + 1}</Badge>
                                <span className="font-semibold text-sm">{cc.concept || cc.hook || `Concepto ${i + 1}`}</span>
                                {cc.format && <Badge variant="outline" className="text-xs ml-auto">{cc.format}</Badge>}
                              </div>
                              {cc.copy && <p className="text-xs italic text-foreground">"{cc.copy}"</p>}
                              {cc.cta && <div className="text-xs"><span className="text-muted-foreground">CTA:</span> <span className="font-semibold text-primary">{cc.cta}</span></div>}
                              {cc.rationale && <div className="text-xs text-muted-foreground">💡 {cc.rationale}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Legacy fields - backward compatible */}
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
                      {research.ads_library_analysis.creative_recommendations?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-primary mb-2">✅ Recomendaciones Creativas</p>
                          <ul className="space-y-1">{research.ads_library_analysis.creative_recommendations.map((r: string, i: number) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" /> {r}
                            </li>
                          ))}</ul>
                        </div>
                      )}

                      {/* Creative Calendar — structured timeline */}
                      {research.ads_library_analysis.creative_calendar && typeof research.ads_library_analysis.creative_calendar === 'object' ? (
                        <CreativeCalendarTimeline calendar={research.ads_library_analysis.creative_calendar} />
                      ) : research.ads_library_analysis.creative_calendar && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-primary mb-1">📅 Calendario Creativo</p>
                          <p className="text-sm">{String(research.ads_library_analysis.creative_calendar)}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="text-center py-8">
                    <CardContent>
                      <Megaphone className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Análisis de Ads Library no disponible. Ejecuta el análisis de marca para generar esta sección.</p>
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
