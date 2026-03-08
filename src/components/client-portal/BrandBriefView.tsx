import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { registerPdfFont } from '@/lib/pdf-font';
import {
  PdfContext, PdfHelpers, renderGlossaryBox,
  renderBrandIdentity, renderFinancialAnalysis, renderConsumerProfile,
  renderPositioningStrategy, renderActionPlan, renderCompetitorCards,
  renderKeywordPhases, renderMetaAdsStrategy, renderGoogleAdsStrategy,
  renderAdsLibraryAnalysis, renderBudgetAndFunnel,
} from './briefPdfSections';
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

// Error Boundary to prevent blank screens
class BriefErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BrandBriefView] Render crash:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 bg-destructive/10 border border-destructive/30 rounded-lg m-4">
          <h3 className="font-bold text-destructive mb-2">Error al renderizar</h3>
          <p className="text-sm text-destructive/80 mb-2">{this.state.error.message}</p>
          <pre className="text-xs bg-background p-3 rounded overflow-auto max-h-40">{this.state.error.stack}</pre>
          <button onClick={() => this.setState({ error: null })} className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded text-sm">
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Safe text render — prevents React error #31 (objects rendered as children)
function safeText(val: any): string {
  if (val == null) return '';
  let text: string;
  if (typeof val === 'string') text = val;
  else if (typeof val === 'number' || typeof val === 'boolean') text = String(val);
  else text = JSON.stringify(val);
  // Detect truncated text — add ellipsis if it doesn't end in punctuation
  if (text.length > 10 && !/[.!?")\]:]$/.test(text.trim())) {
    text = text.trim() + '...';
  }
  return text;
}

// Extract JSON objects from truncated raw_text using bracket-counting
function parsePartialJsonArray(raw: string): any[] {
  const arrStart = raw.indexOf('[');
  if (arrStart < 0) return [];
  const s = raw.slice(arrStart + 1);
  const items: any[] = [];
  let depth = 0;
  let current = '';
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { current += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; current += ch; continue; }
    if (inString) { current += ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    current += ch;
    if (depth === 0 && current.trim().length > 2) {
      const cleaned = current.trim().replace(/^,/, '').trim();
      if (cleaned.startsWith('{')) {
        try { items.push(JSON.parse(cleaned)); } catch { /* skip incomplete */ }
      }
      current = '';
    }
  }
  return items;
}

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

// Structured Accionables from AI action_plan array
function StructuredAccionables({ items }: { items: any[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-3">
      {items.slice(0, 7).map((item: any, i: number) => {
        const isExpanded = !!expanded[i];
        const hasSCR = item.situation || item.complication || item.resolution;
        return (
          <div key={i} className="bg-muted/40 rounded-xl border border-border hover:border-primary/30 transition-colors overflow-hidden">
            <div className="flex gap-3 p-4 items-start">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground leading-snug">{item.title || `Accionable ${i + 1}`}</p>
                {(item.priority || item.timeline) && (
                  <div className="flex gap-2 mt-1">
                    {item.priority && <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${item.priority === 'alta' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>{item.priority}</span>}
                    {item.timeline && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{item.timeline}</span>}
                  </div>
                )}
              </div>
              {hasSCR && (
                <button onClick={() => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))} className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors flex-shrink-0 mt-0.5">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              )}
            </div>
            {isExpanded && hasSCR && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                {item.situation && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border-l-4 border-blue-400">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">Situacion (S)</p>
                    <p className="text-xs text-foreground leading-relaxed">{item.situation}</p>
                  </div>
                )}
                {item.complication && (
                  <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 border-l-4 border-orange-400">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-1">Complicacion (C)</p>
                    <p className="text-xs text-foreground leading-relaxed">{item.complication}</p>
                  </div>
                )}
                {item.resolution && (
                  <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border-l-4 border-green-500">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-500 mb-1">Resolucion (R)</p>
                    <p className="text-xs text-foreground leading-relaxed">{item.resolution}</p>
                  </div>
                )}
                {item.expected_impact && (
                  <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Impacto de Negocio</p>
                    <p className="text-xs text-foreground leading-relaxed font-medium">{item.expected_impact}</p>
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
                      {focus && <span className={`text-xs font-semibold ${cfg.text} truncate max-w-[200px]`} title={focus}>{focus}</span>}
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
            const label = key.replace(/_/g, ' ')
              .replace(/week\s*(\d+)\s+(\d+)/i, 'Semana $1-$2')
              .replace(/week/i, 'Semana');
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
  budget_and_funnel?: any;
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
  { quote: "Un buen análisis toma tiempo, pero un mal análisis te cuesta dinero.", author: "Steve AI", role: "Tu Consultor de Marketing" },
  { quote: "Los datos sin estrategia son solo números. La estrategia sin datos es solo opinión.", author: "Steve AI", role: "Tu Consultor de Marketing" },
];

function AnalysisProgressBanner({ progressStep, elapsedSeconds }: { progressStep: { step: string; detail: string; pct: number } | null; elapsedSeconds?: number }) {
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const maxPctRef = useRef(0);

  // Ensure displayed percentage never decreases
  const rawPct = progressStep?.pct ?? 0;
  if (rawPct > maxPctRef.current) {
    maxPctRef.current = rawPct;
  }
  const displayPct = Math.max(rawPct, maxPctRef.current);

  // Format elapsed time as mm:ss
  const elapsed = elapsedSeconds || 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

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
    { key: ['inicio', 'sitio_web'], icon: <Globe className="h-4 w-4 mx-auto mb-1" />, label: 'Escaneando web', desc: 'Tu sitio' },
    { key: ['detectando'], icon: <Search className="h-4 w-4 mx-auto mb-1" />, label: 'Detectando', desc: 'Competencia' },
    { key: ['competidor_0', 'competidor_1', 'competidor_2', 'competidor_3', 'competidor_4', 'competidor_5'], icon: <Trophy className="h-4 w-4 mx-auto mb-1" />, label: 'Analizando', desc: '6 competidores' },
    { key: ['ia'], icon: <Sparkles className="h-4 w-4 mx-auto mb-1" />, label: 'Estrategia IA', desc: '12 análisis' },
  ];
  const thresholds = [0, 20, 25, 70];

  // Dynamic status message based on progress
  const statusMessage = displayPct < 20
    ? 'Escaneando tu sitio web...'
    : displayPct < 25
    ? 'Identificando competidores...'
    : displayPct < 70
    ? 'Analizando sitios de competencia...'
    : displayPct < 95
    ? 'Generando estrategia con equipo de Marketing Steve...'
    : 'Finalizando tu análisis...';

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-primary/3 to-background overflow-hidden shadow-lg">
      <CardContent className="pt-5 pb-5">
        {/* Header row with timer */}
        <div className="flex items-start gap-3 mb-4">
          <div className="relative flex-shrink-0">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-sm">
              S
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-bold text-foreground">
                Generando estrategia con equipo de Marketing Steve
              </p>
              <div className="flex items-center gap-1.5 bg-muted/80 rounded-full px-3 py-1 flex-shrink-0">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-mono font-bold text-foreground">{timeStr}</span>
              </div>
            </div>
            <p className="text-sm text-primary font-medium mt-0.5">
              {statusMessage}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tiempo estimado: 8-10 minutos. Usamos el modelo de IA mas avanzado para darte un analisis de nivel consultora.
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4 bg-background/60 rounded-lg p-3 border border-border/50">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Progreso del analisis</span>
            <span className="text-sm font-bold text-primary">{displayPct}%</span>
          </div>
          <Progress value={displayPct || 3} className="h-2.5" />
        </div>

        {/* Step indicators */}
        <div className="grid grid-cols-4 gap-2 text-center mb-5">
          {phases.map((phase, i) => {
            const isActive = progressStep && phase.key.includes(progressStep.step);
            const isDone = displayPct > thresholds[i] && !isActive;
            return (
              <div key={i} className={`rounded-xl p-2.5 border transition-all duration-500 ${isActive ? 'bg-primary/10 border-primary/40 shadow-sm shadow-primary/10 scale-[1.02]' : isDone ? 'bg-green-50 dark:bg-green-950/20 border-green-400/40' : 'bg-background/80 border-border/50'}`}>
                <div className={`transition-colors duration-300 ${isActive ? 'text-primary' : isDone ? 'text-green-500' : 'text-muted-foreground/60'}`}>
                  {isDone ? <CheckCircle2 className="h-4 w-4 mx-auto mb-1" /> : phase.icon}
                </div>
                <p className={`text-[10px] font-semibold leading-tight ${isActive ? 'text-primary' : isDone ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/60'}`}>{phase.label}</p>
                <p className={`text-[9px] mt-0.5 ${isActive ? 'text-primary/70' : isDone ? 'text-green-500/70' : 'text-muted-foreground/40'}`}>{phase.desc}</p>
                {isActive && <div className="mt-1.5 h-0.5 bg-primary/20 rounded-full overflow-hidden"><div className="h-0.5 bg-primary rounded-full animate-pulse w-full" /></div>}
              </div>
            );
          })}
        </div>

        {/* What you'll get section */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { icon: '🔍', label: 'SEO + Keywords', sub: 'Auditoría completa' },
            { icon: '📊', label: 'Meta + Google Ads', sub: 'Copies listos' },
            { icon: '🎯', label: '7 Accionables', sub: 'Plan estratégico' },
          ].map((item, i) => (
            <div key={i} className="text-center bg-background/60 rounded-lg p-2 border border-border/30">
              <span className="text-lg">{item.icon}</span>
              <p className="text-[10px] font-semibold text-foreground mt-0.5">{item.label}</p>
              <p className="text-[9px] text-muted-foreground">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Rotating quote */}
        <div
          className="rounded-xl border border-primary/15 bg-background/80 backdrop-blur-sm p-4"
          style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(6px)', transition: 'opacity 0.4s ease, transform 0.4s ease' }}
        >
          <div className="flex gap-3 items-start">
            <span className="text-3xl leading-none text-primary/25 font-serif select-none flex-shrink-0 -mt-1">"</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground leading-snug italic">
                {quote.quote}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <div className="h-px flex-1 bg-border/50" />
                <div className="text-right flex-shrink-0">
                  <p className="text-[11px] font-bold text-primary">{quote.author}</p>
                  <p className="text-[10px] text-muted-foreground">{quote.role}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer tip */}
        <p className="text-[10px] text-center text-muted-foreground/70 mt-3">
          Puedes navegar a otras pestanas mientras Steve trabaja. Te avisaremos cuando termine.
        </p>
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
        .in('research_type', ['executive_summary', 'seo_audit', 'competitive_analysis', 'competitor_analysis', 'keywords']);
      const dataInDb: Record<string, boolean> = {};
      for (const r of rows ?? []) {
        const d = (r as any).research_data;
        const has = !!d && (Array.isArray(d) ? d.length > 0 : typeof d === 'object' ? Object.keys(d).length > 0 : !!d);
        dataInDb[(r as any).research_type] = has;
        if ((r as any).research_type === 'competitive_analysis') dataInDb['competitor_analysis'] = has;
      }
      setDiagnostic(prev => ({ ...prev, dataInDb }));
    })();
  }, [analysisStatus, elapsedSeconds, clientId]);

  // A los 300s aplicar automáticamente solo si ya hay datos de research (SEO, keywords, competencia). Si no, seguir comprobando cada 8s.
  useEffect(() => {
    if (analysisStatus !== 'pending' || elapsedSeconds < 300) return;
    if (hasAutoAppliedAt120Ref.current) return;
    hasAutoAppliedAt120Ref.current = true;

    async function hasResearchData(): Promise<boolean> {
      const { data: rows } = await supabase
        .from('brand_research')
        .select('research_type, research_data')
        .eq('client_id', clientId)
        .in('research_type', ['executive_summary', 'seo_audit', 'competitive_analysis', 'competitor_analysis', 'keywords']);
      return (rows ?? []).some((r: any) => {
        const d = r.research_data;
        if (!d || typeof d !== 'object') return false;
        if (r.research_type === 'executive_summary' && (d.summary || d.executive_summary)) return true;
        if (r.research_type === 'seo_audit' && (d.issues?.length || d.recommendations?.length || d.score != null || d.score_seo != null || d.problemas_detectados?.length || d.acciones_prioritarias?.length)) return true;
        if ((r.research_type === 'competitor_analysis' || r.research_type === 'competitive_analysis') && (d.competitors?.length || d.individual_analysis?.length || d.overview)) return true;
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
      toast.success('Análisis aplicado automáticamente — revisa las pestañas SEO, Keywords y Competencia.');
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
    toast.success('Análisis cargado — mostrando datos disponibles.');
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

    // ── COMPETITIVE ANALYSIS: map competitive_analysis → competitor_analysis, then individual_analysis → competitors ──
    // The DB stores research_type='competitive_analysis' but UI expects r.competitor_analysis
    if ((r as any).competitive_analysis && !(r as any).competitor_analysis) {
      (r as any).competitor_analysis = (r as any).competitive_analysis;
    }
    if (r.competitor_analysis && typeof r.competitor_analysis === 'object') {
      const ca = r.competitor_analysis;
      const indiv = ca.individual_analysis || ca.individual_analyses;
      if (!Array.isArray(ca.competitors) && Array.isArray(indiv)) {
        ca.competitors = indiv.map((comp: any) => ({
          ...comp,
          strengths: comp.strengths || comp.fortalezas || [],
          weaknesses: comp.weaknesses || comp.debilidades || [],
          value_proposition: comp.value_proposition || comp.propuesta_de_valor || comp.propuesta_valor || '',
          ad_strategy_inferred: comp.ad_strategy_inferred || comp.estrategia_contenido_observada || comp.estrategia_contenido || '',
          positioning: comp.positioning || comp.propuesta_de_valor || comp.propuesta_valor || '',
          attack_vector: comp.attack_vector || comp.que_hace_cliente_mejor || '',
          que_hacen_mejor: comp.que_hacen_mejor || comp.que_hacen_mejor_que_cliente || '',
          que_hace_cliente_mejor: comp.que_hace_cliente_mejor || '',
          estrategia_contenido: comp.estrategia_contenido || comp.estrategia_contenido_observada || '',
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
      // market_gaps from insights_estrategicos or general analysis
      if (!Array.isArray(ca.market_gaps)) {
        if (Array.isArray(ca.insights_estrategicos?.gaps_de_mercado_sin_cubrir)) {
          ca.market_gaps = ca.insights_estrategicos.gaps_de_mercado_sin_cubrir;
        } else if (ca.competitors?.length > 0) {
          const gaps: string[] = [];
          for (const comp of ca.competitors) {
            if (comp.attack_vector) gaps.push(`${comp.name}: ${comp.attack_vector}`);
          }
          if (gaps.length > 0) ca.market_gaps = gaps;
        }
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
      const { data: researchData, error: researchErr } = await callApi('analyze-brand-research', {
        body: { client_id: clientId, website_url: websiteUrl, competitor_urls: competitorUrls },
      });
      if (researchErr) {
        setDebug({ phase1: 'error', phase1Message: researchErr });
        console.error('analyze-brand-research error:', researchErr);
      } else {
        research = researchData?.research;
        setDebug({ phase1: 'ok', phase1Status: 200 });
      }
    } catch (err: any) {
      setDebug({ phase1: 'error', phase1Message: err?.message || String(err) });
      console.error('analyze-brand-research failed:', err);
    }

    // Phase 2: strategy — await to capture error for diagnóstico
    if (research) {
      setDebug({ phase2: 'running' });
      try {
        // Extract fase_negocio and presupuesto_ads from brief data
        const briefFase = (briefData as any)?.fase_negocio || '';
        const briefPresupuesto = (briefData as any)?.presupuesto_ads || '';
        const { data: strategyData, error: strategyErr } = await callApi('analyze-brand-strategy', {
          body: { client_id: clientId, research, fase_negocio: briefFase, presupuesto_ads: briefPresupuesto },
        });
        if (strategyErr) {
          setDebug({ phase2: 'error', phase2Message: strategyErr });
          console.error('analyze-brand-strategy error:', strategyErr);
        } else {
          setDebug({ phase2: 'ok', phase2Status: 200 });
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

    try {
    const doc = new jsPDF();
    registerPdfFont(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    const maxWidth = pageWidth - margin * 2;
    let y = 15;

    // ─── COLOR PALETTE ────────────────────────────────────────────────────────
    const brandR = 27, brandG = 42, brandB = 74;   // #1B2A4A navy
    const accentR = 200, accentG = 163, accentB = 90; // #C8A35A gold
    const midBlueR = 45, midBlueG = 74, midBlueB = 122; // #2D4A7A
    const lightGray = [245, 246, 252] as [number,number,number];
    const midGray   = [200, 200, 210] as [number,number,number];

    // Rotating section backgrounds for visual variety
    const sectionBgs: [number, number, number][] = [
      [238, 242, 249], // azul claro #EEF2F9
      [253, 248, 240], // crema #FDF8F0
      [237, 247, 240], // verde agua #EDF7F0
      [243, 239, 248], // lavanda #F3EFF8
    ];
    let sectionBgIdx = 0;

    // ─── HELPERS ──────────────────────────────────────────────────────────────
    const checkPage = (needed: number) => {
      if (y + needed > pageHeight - 25) { doc.addPage(); y = 20; addWatermark(); }
    };

    const addWatermark = () => {
      doc.saveGraphicsState();
      // @ts-ignore
      doc.setGState(new doc.GState({ opacity: 0.03 }));
      doc.setFont('NotoSans', 'bold');
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
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`STEVE.IO — BG Consult | Confidencial | Pág ${pageNum}/${pageCount}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    };

    const stripEmojis = (text: string) => text
      // Strip markdown formatting
      .replace(/#{1,4}\s*/g, '').replace(/\*\*/g, '').replace(/\*/g, '')
      // Strip emojis (Unicode emoji ranges)
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
      .replace(/[\u{200D}]/gu, '')
      .replace(/[\u{20E3}]/gu, '')
      .replace(/[⚠️✅❌★⭐🔴🟡🟢⚧]/g, '')
      .replace(/1️⃣|2️⃣|3️⃣/g, '')
      // Replace -> with bullet
      .replace(/->/g, ' - ')
      // Fix "1ã", "2ã" etc. (encoding artifact)
      .replace(/(\d)ã/g, '$1.')
      // Replace dashes and special punctuation that may not be in font
      .replace(/–/g, '-').replace(/—/g, '-').replace(/´/g, "'")
      .replace(/©/g, '(c)').replace(/®/g, '(R)')
      // Keep accented Latin characters (á, é, í, ó, ú, ñ, Ñ, ü, Ü, ¿, ¡, etc.)
      // Only strip chars outside Basic Latin + Latin-1 Supplement that aren't in the font
      .replace(/[^\x20-\x7E\u00A0-\u00FF\n\r\t•]/g, '')
      .trim();

    const addBody = (text: string, indent = 0, lineH = 5) => {
      doc.setFont('NotoSans', 'normal');
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
      checkPage(14);
      y += 5;
      // Gold accent dot + mid-blue text
      doc.setFillColor(accentR, accentG, accentB);
      doc.circle(margin + 3, y - 1.5, 1.5, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(midBlueR, midBlueG, midBlueB);
      doc.text(title, margin + 8, y);
      // Subtle underline
      doc.setDrawColor(accentR, accentG, accentB);
      doc.setLineWidth(0.3);
      doc.line(margin + 8, y + 1.5, margin + 8 + Math.min(doc.getTextWidth(title), maxWidth - 12), y + 1.5);
      doc.setTextColor(0, 0, 0);
      y += 8;
    };

    let sectionCounter = 0;
    // Track section titles and their page numbers for Table of Contents
    const tocEntries: { num: number; title: string; page: number }[] = [];

    const addSectionHeader = (_numOrTitle: string, title?: string) => {
      // Support both (num, title) legacy calls and (title) new calls
      const sectionTitle = title ?? _numOrTitle;
      sectionCounter++;
      const num = String(sectionCounter);
      // Record ToC entry
      tocEntries.push({ num: sectionCounter, title: sectionTitle, page: doc.getNumberOfPages() });

      checkPage(24);
      y += 6;
      // Rotating background band
      const bg = sectionBgs[sectionBgIdx % sectionBgs.length];
      sectionBgIdx++;
      doc.setFillColor(...bg);
      doc.rect(0, y - 2, pageWidth, 16, 'F');
      // Navy bar
      doc.setFillColor(brandR, brandG, brandB);
      doc.roundedRect(margin, y, maxWidth, 12, 2, 2, 'F');
      // Gold accent line at top
      doc.setFillColor(accentR, accentG, accentB);
      doc.rect(margin, y, maxWidth, 1.5, 'F');
      // Number circle in gold
      doc.setFillColor(accentR, accentG, accentB);
      doc.circle(margin + 8, y + 7, 4.5, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(num, margin + 8, y + 8.5, { align: 'center' });
      // Title text in white
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(sectionTitle, margin + 16, y + 8);
      doc.setTextColor(0, 0, 0);
      y += 18;
    };

    const addInsightBox = (text: string) => {
      checkPage(20);
      // Cream background with thick gold left border
      doc.setFillColor(253, 248, 240);
      doc.roundedRect(margin, y, maxWidth, 16, 1.5, 1.5, 'F');
      doc.setFillColor(accentR, accentG, accentB);
      doc.rect(margin, y, 3, 16, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text('*', margin + 7, y + 6);
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60, 40, 0);
      const lines = doc.splitTextToSize(stripEmojis(text), maxWidth - 14);
      doc.text(lines.slice(0, 3), margin + 11, y + 6);
      y += 19;
    };

    const addKeyValue = (label: string, value: string) => {
      checkPage(7);
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(midBlueR, midBlueG, midBlueB);
      doc.text(`${label}:`, margin + 4, y);
      const labelWidth = doc.getTextWidth(`${label}: `);
      doc.setFont('NotoSans', 'normal');
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
      // Gold bullet
      doc.setFillColor(accentR, accentG, accentB);
      doc.circle(margin + indent + 4, y - 1, 1, 'F');
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      const lines = doc.splitTextToSize(stripEmojis(text), maxWidth - indent - 10);
      for (const line of lines) {
        checkPage(5);
        doc.text(line, margin + indent + 8, y);
        y += 5;
      }
      y += 1;
    };

    const addTableRow = (cells: string[], colWidths: number[], rowIdx: number, header = false) => {
      checkPage(12);
      const rowH = 11;
      const rowX = margin;
      const totalW = colWidths.reduce((a, b) => a + b, 0);
      const scale = totalW > maxWidth ? maxWidth / totalW : 1;
      const scaledWidths = colWidths.map(w => w * scale);
      let cx = rowX;
      if (header) {
        doc.setFillColor(brandR, brandG, brandB);
      } else {
        const altBg: [number,number,number] = rowIdx % 2 === 0 ? [255, 255, 255] : [238, 242, 249];
        doc.setFillColor(...altBg);
      }
      doc.rect(rowX, y, maxWidth, rowH, 'F');
      doc.setDrawColor(midBlueR, midBlueG, midBlueB);
      doc.setLineWidth(header ? 0 : 0.15);
      if (!header) {
        doc.setDrawColor(215, 218, 228);
        doc.line(rowX, y + rowH, rowX + maxWidth, y + rowH);
      }
      cx = rowX;
      doc.setFont('helvetica', header ? 'bold' : 'normal');
      doc.setFontSize(header ? 8 : 7.5);
      doc.setTextColor(header ? 255 : 40, header ? 255 : 40, header ? 255 : 40);
      for (let i = 0; i < cells.length; i++) {
        if (i > 0) {
          doc.setDrawColor(header ? 60 : 200, header ? 80 : 205, header ? 120 : 220);
          doc.setLineWidth(0.15);
          doc.line(cx, y + 1, cx, y + rowH - 1);
        }
        const colW = scaledWidths[i];
        let txt = String(cells[i] ?? '');
        while (txt.length > 3 && doc.getTextWidth(txt) > colW - 6) {
          txt = txt.slice(0, -1);
        }
        if (txt.length < String(cells[i] ?? '').length && txt.length > 3) txt = txt.slice(0, -2) + '..';
        doc.text(txt, cx + 3, y + 7);
        cx += colW;
      }
      y += rowH;
    };

    // ─── PDF CONTEXT & HELPERS for external section renderers ─────────────────
    const pdfCtx: PdfContext = { doc, y, pageWidth, pageHeight, margin, maxWidth, brandR, brandG, brandB, accentR, accentG, accentB, lightGray };
    const pdfHelpers: PdfHelpers = {
      checkPage, addWatermark, addBody, addSubTitle, addSectionHeader, addInsightBox,
      addKeyValue, addArrowBullet, addTableRow, stripEmojis,
      getY: () => y,
      setY: (val: number) => { y = val; },
    };

    // ─── PAGE 1: PORTADA (FULL NAVY) ────────────────────────────────────────────
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    addWatermark();

    // Gold accent band at 1/3
    const bandY = pageHeight / 3 - 1.5;
    doc.setFillColor(accentR, accentG, accentB);
    doc.rect(0, bandY, pageWidth, 3, 'F');

    // Text-based logo — clean and crisp, no pixelated image
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text('STEVE.IO', pageWidth / 2, 36, { align: 'center' });
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 210);
    doc.text('PERFORMANCE MARKETING ESTRATÉGICO', pageWidth / 2, 43, { align: 'center' });

    // Business name as main title, user name as subtitle
    const businessName_cover = clientInfo?.company || clientInfo?.name || 'Cliente';
    const userName_cover = clientInfo?.name || '';
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(32);
    doc.setTextColor(255, 255, 255);
    doc.text(businessName_cover, pageWidth / 2, bandY + 22, { align: 'center' });
    if (userName_cover && userName_cover !== businessName_cover) {
      doc.setFontSize(12);
      doc.setFont('NotoSans', 'normal');
      doc.setTextColor(200, 200, 220);
      doc.text(`Preparado para ${userName_cover} — ${businessName_cover}`, pageWidth / 2, bandY + 32, { align: 'center' });
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
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 220);
    doc.text('Preparado por Dr. Steve Dogs, PhD Performance Marketing', pageWidth / 2, bandY + 60, { align: 'center' });
    doc.text('BG Consult / STEVE.IO', pageWidth / 2, bandY + 66, { align: 'center' });

    // Footer of cover
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 180);
    const coverDate = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(coverDate, pageWidth / 2, pageHeight - 20, { align: 'center' });
    doc.setFont('NotoSans', 'bold');
    doc.setTextColor(accentR + 40, accentG + 20, accentB);
    doc.text('ESTRICTAMENTE CONFIDENCIAL', pageWidth / 2, pageHeight - 14, { align: 'center' });

    // ─── PAGE 2: TABLE OF CONTENTS (placeholder — filled in after all sections) ─
    doc.addPage();
    const tocPageNum = doc.getNumberOfPages();
    addWatermark();

    // ─── PAGE 3: DASHBOARD EJECUTIVO DE KPIs ────────────────────────────────────
    doc.addPage();
    y = 20;
    addWatermark();

    // Header
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, 16, 'F');
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('DASHBOARD EJECUTIVO DE KPIs', pageWidth / 2, 11, { align: 'center' });
    y = 24;

    // Helper to format numbers in CLP
    const fmtCLP = (val: number) => '$' + Math.round(val).toLocaleString('es-CL') + ' CLP';
    // CPA is already in CLP (margin is in CLP), no USD conversion needed
    const cpaMaxCLP = cpaMax ? fmtCLP(Number(cpaMax)) : null;

    // Dynamic budget from meta_ads_strategy or financial config
    const metaBudget = (research as any).meta_ads_strategy?.presupuesto_sugerido;
    const totalBudget = typeof metaBudget === 'object' && metaBudget?.total
      ? metaBudget.total : typeof metaBudget === 'string' ? metaBudget : null;
    const roasObj = (research as any).meta_ads_strategy?.kpis_objetivo?.bofu?.roas
      || (research as any).google_ads_strategy?.target_roas || null;

    // Calculate ROAS based on real client data
    const budgetFunnel = (research as any).budget_and_funnel;
    const roasFromBudget = budgetFunnel?.roas_projection?.day_90?.roas || budgetFunnel?.roas_projection?.day_60?.roas;
    const calculatedRoas = roasObj ? String(roasObj) : roasFromBudget ? String(roasFromBudget) : (financials && marginPct ? (() => {
      const mp = Number(marginPct);
      const minRoas = (100 / mp).toFixed(1);
      const targetRoas = (100 / (mp * 0.3)).toFixed(1);
      return `${minRoas}x min / ${targetRoas}x obj`;
    })() : 'Pendiente');

    // SEO Score with better fallback
    const seoScore = research.seo_audit?.score || research.seo_audit?.score_seo;
    const seoDisplay = seoScore ? `${seoScore}/100` : (analysisStatus === 'pending' ? 'Analizando...' : 'Pendiente analisis');

    // Budget from budget_and_funnel or meta_ads_strategy
    const budgetFromFunnel = budgetFunnel?.monthly_budget_clp;
    const finalBudget = budgetFromFunnel || totalBudget;

    const kpiData = [
      { label: 'Ticket Promedio', value: financials ? fmtCLP(financials.price) : 'Completar brief', dark: true },
      { label: 'CPA Maximo Viable', value: cpaMaxCLP || 'Completar brief', dark: false },
      { label: 'ROAS Objetivo', value: calculatedRoas, dark: true },
      { label: 'Margen Bruto', value: marginPct ? `${marginPct}%` : 'Completar brief', dark: false },
      { label: 'Presupuesto Sugerido', value: finalBudget ? (typeof finalBudget === 'number' ? fmtCLP(finalBudget) : String(finalBudget)) : 'A definir', dark: true },
      { label: 'SEO Score', value: seoDisplay, dark: false },
    ];

    const kpiCols = 3;
    const kpiGap = 6;
    const kpiW = (maxWidth - kpiGap * (kpiCols - 1)) / kpiCols;
    const kpiH = 32;
    let kpiIdx = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < kpiCols; col++) {
        const kpi = kpiData[kpiIdx++];
        const kx = margin + col * (kpiW + kpiGap);
        const ky = y + row * (kpiH + 8);
        // Card shadow effect
        doc.setFillColor(220, 222, 235);
        doc.roundedRect(kx + 0.5, ky + 0.5, kpiW, kpiH, 3, 3, 'F');
        // Card background
        if (kpi.dark) {
          doc.setFillColor(brandR, brandG, brandB);
        } else {
          doc.setFillColor(accentR, accentG, accentB);
        }
        doc.roundedRect(kx, ky, kpiW, kpiH, 3, 3, 'F');
        // Value — auto-scale font to fit card width
        doc.setFont('NotoSans', 'bold');
        doc.setTextColor(255, 255, 255);
        let valSize = 22;
        doc.setFontSize(valSize);
        let valText = kpi.value;
        while (valSize > 8 && doc.getTextWidth(valText) > kpiW - 6) {
          valSize -= 1;
          doc.setFontSize(valSize);
        }
        // If still too wide at min size, truncate with ellipsis
        if (doc.getTextWidth(valText) > kpiW - 6) {
          while (valText.length > 5 && doc.getTextWidth(valText + '...') > kpiW - 6) {
            valText = valText.slice(0, -1);
          }
          valText = valText.trim() + '...';
        }
        doc.text(valText, kx + kpiW / 2, ky + 16, { align: 'center' });
        // Label
        doc.setFontSize(7.5);
        doc.setFont('NotoSans', 'normal');
        doc.setTextColor(220, 220, 240);
        doc.text(kpi.label.toUpperCase(), kx + kpiW / 2, ky + 24, { align: 'center' });
      }
    }
    y += 2 * (kpiH + 8) + 12;

    // (SEO semáforo moved to SEO audit section — removed from KPI dashboard)


    // ─── PAGE 3: RESUMEN EJECUTIVO PARA DIRECTORIO ──────────────────────────────
    doc.addPage();
    y = 20;
    addWatermark();
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, 16, 'F');
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('RESUMEN EJECUTIVO PARA DIRECTORIO', pageWidth / 2, 11, { align: 'center' });
    y = 26;

    // Use AI-generated executive summary if available, otherwise fall back to template
    const aiExecSummary = (research as any).executive_summary?.executive_summary || (research as any).executive_summary;
    const hasAiExec = aiExecSummary && typeof aiExecSummary === 'object' &&
      (aiExecSummary.situacion_actual || aiExecSummary.posicion_competitiva || aiExecSummary.oportunidades_detectadas || aiExecSummary.amenazas_identificadas || aiExecSummary.recomendaciones_priorizadas || !aiExecSummary.summary);

    if (hasAiExec) {
      // Render AI-generated executive summary as flowing content blocks
      const execSections: { title: string; content: string }[] = [];

      // Extract key sections from AI executive summary (flexible key names)
      const situacion = aiExecSummary.situacion_actual || aiExecSummary.current_situation || aiExecSummary.situacion || '';
      const oportunidades = aiExecSummary.oportunidades_detectadas || aiExecSummary.oportunidades || aiExecSummary.opportunities || [];
      const amenazas = aiExecSummary.amenazas_identificadas || aiExecSummary.amenazas || aiExecSummary.threats || [];
      const recomendaciones = aiExecSummary.recomendaciones_priorizadas || aiExecSummary.recomendaciones || aiExecSummary.recommendations || aiExecSummary.top_recommendations || [];
      const posicion = aiExecSummary.posicion_competitiva || aiExecSummary.competitive_position || '';

      if (situacion) execSections.push({ title: 'SITUACION ACTUAL', content: typeof situacion === 'string' ? situacion : JSON.stringify(situacion) });
      if (posicion) {
        if (typeof posicion === 'string') {
          execSections.push({ title: 'POSICION COMPETITIVA', content: posicion });
        } else if (typeof posicion === 'object') {
          // Flatten object into readable text
          const parts: string[] = [];
          for (const [pk, pv] of Object.entries(posicion)) {
            if (Array.isArray(pv)) parts.push(`${pk.replace(/_/g, ' ')}: ${(pv as any[]).slice(0, 3).join('; ')}`);
            else if (pv) parts.push(`${pk.replace(/_/g, ' ')}: ${String(pv)}`);
          }
          if (parts.length > 0) execSections.push({ title: 'POSICION COMPETITIVA', content: parts.join('. ') });
        }
      }

      if (Array.isArray(oportunidades) && oportunidades.length > 0) {
        execSections.push({ title: 'OPORTUNIDADES', content: oportunidades.slice(0, 3).map((o: any) => typeof o === 'string' ? o : o.oportunidad || o.description || o.titulo || JSON.stringify(o)).join('. ') });
      }
      if (Array.isArray(amenazas) && amenazas.length > 0) {
        execSections.push({ title: 'AMENAZAS', content: amenazas.slice(0, 3).map((a: any) => typeof a === 'string' ? a : a.amenaza || a.description || a.titulo || JSON.stringify(a)).join('. ') });
      }
      if (Array.isArray(recomendaciones) && recomendaciones.length > 0) {
        execSections.push({ title: 'RECOMENDACIONES TOP', content: recomendaciones.slice(0, 3).map((r: any) => typeof r === 'string' ? r : r.recomendacion || r.description || r.titulo || r.recommendation || JSON.stringify(r)).join('. ') });
      }

      // If no structured sections were extracted, try to render the raw object keys
      if (execSections.length === 0) {
        for (const [key, val] of Object.entries(aiExecSummary)) {
          if (typeof val === 'string' && val.length > 10) {
            execSections.push({ title: key.replace(/_/g, ' ').toUpperCase(), content: val });
          }
        }
      }

      // Render exec blocks in a 2-column grid
      const bW = (maxWidth - 6) / 2;
      const bH = 38;
      for (let bi = 0; bi < Math.min(execSections.length, 6); bi++) {
        const b = execSections[bi];
        const col = bi % 2;
        const row = Math.floor(bi / 2);
        const bx = margin + col * (bW + 6);
        const by = y + row * (bH + 8);
        if (by + bH > pageHeight - 25) { doc.addPage(); y = 20; addWatermark(); }
        doc.setFillColor(...lightGray);
        doc.roundedRect(bx, by, bW, bH, 2, 2, 'F');
        doc.setDrawColor(accentR, accentG, accentB);
        doc.setLineWidth(2);
        doc.line(bx, by, bx, by + bH);
        doc.setLineWidth(0.2);
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(brandR, brandG, brandB);
        doc.text(stripEmojis(b.title), bx + 5, by + 7);
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(50, 50, 50);
        const bLines = doc.splitTextToSize(stripEmojis(b.content), bW - 10);
        let biy = by + 13;
        for (const bl of bLines.slice(0, 5)) {
          doc.text(bl, bx + 5, biy);
          biy += 4.8;
        }
      }
      const execRows = Math.ceil(Math.min(execSections.length, 6) / 2);
      y += execRows * (bH + 8) + 12;
    } else {
      // Fallback: hardcoded template
      const execBlocks = [
        {
          title: 'PROBLEMA',
          text: `${clientInfo?.name || 'La empresa'} opera en un mercado competitivo donde los costos de adquisicion siguen subiendo y la diferenciacion es critica. Sin una estrategia de marca clara y metricas de performance optimizadas, el crecimiento sostenible es imposible.`,
          col: 0, row: 0,
        },
        {
          title: 'SOLUCION',
          text: `Brief estrategico completo: buyer persona definido, CPA maximo calculado en ${cpaMaxCLP || 'N/D'}, keywords identificadas y competencia mapeada. Steve Ads ejecuta la estrategia en tiempo real.`,
          col: 1, row: 0,
        },
        {
          title: 'INVERSION REQUERIDA',
          text: `Presupuesto inicial recomendado: ${totalBudget ? (typeof totalBudget === 'number' ? fmtCLP(totalBudget) : totalBudget) + '/mes' : 'A definir con el equipo'}. Distribuido en Meta Ads, Google Ads y SEO para maximizar cobertura del funnel completo.`,
          col: 0, row: 1,
        },
        {
          title: 'RETORNO ESPERADO',
          text: `ROAS Fase 1: 1x-2x (aprendizaje). Fase 2: 3x (escala). Fase 3: 5x+ (optimizacion). Margen bruto actual: ${marginPct ? marginPct + '%' : 'N/D'}. SEO score: ${research.seo_audit?.score || 'pendiente'}/100.`,
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
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(brandR, brandG, brandB);
        doc.text(b.title, bx + 5, by + 7);
        doc.setFont('NotoSans', 'normal');
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
    }

    // ─── SECCIÓN: ADN DE MARCA ───────────────────────────────────────────────────
    addSectionHeader('1', 'ADN DE MARCA');
    const q1 = getResponse('business_pitch');
    if (q1) { addSubTitle('Descripcion del Negocio'); addBody(q1); }

    if (financials && margin !== null) {
      addSubTitle('Indicadores Financieros Clave');
      // Render financial KPIs as premium styled cards (2x2 grid)
      const grossMargin = financials.price - financials.cost - financials.shipping;
      checkPage(50);
      const finCards = [
        { label: 'PRECIO DE VENTA', value: fmtCLP(financials.price), color: [brandR, brandG, brandB] as [number,number,number] },
        { label: 'COSTO PRODUCTO', value: fmtCLP(financials.cost), color: [midBlueR, midBlueG, midBlueB] as [number,number,number] },
        { label: 'COSTO ENVIO', value: fmtCLP(financials.shipping), color: [midBlueR, midBlueG, midBlueB] as [number,number,number] },
        { label: 'MARGEN BRUTO', value: `${fmtCLP(grossMargin)} (${marginPct}%)`, color: [22, 120, 50] as [number,number,number] },
      ];
      const finCardW = (maxWidth - 6) / 2;
      const finCardH = 20;
      for (let fi = 0; fi < finCards.length; fi++) {
        const col = fi % 2;
        const row = Math.floor(fi / 2);
        const fx = margin + col * (finCardW + 6);
        const fy = y + row * (finCardH + 4);
        // Card bg
        doc.setFillColor(...lightGray);
        doc.roundedRect(fx, fy, finCardW, finCardH, 2, 2, 'F');
        // Left accent bar
        doc.setFillColor(...finCards[fi].color);
        doc.rect(fx, fy, 3, finCardH, 'F');
        // Label
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 120);
        doc.text(finCards[fi].label, fx + 7, fy + 7);
        // Value
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...finCards[fi].color);
        doc.text(finCards[fi].value, fx + 7, fy + 15);
      }
      y += 2 * (finCardH + 4) + 4;

      // CPA Max card — standalone highlight
      checkPage(22);
      doc.setFillColor(accentR, accentG, accentB);
      doc.roundedRect(margin, y, maxWidth, 18, 2, 2, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text('CPA MAXIMO VIABLE', margin + 6, y + 6);
      doc.setFontSize(14);
      doc.text(cpaMaxCLP || 'N/D', margin + 6, y + 14);
      // Right side explanation
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 240);
      const cpaNote = '30% del margen bruto — limite para no vender a perdida';
      doc.text(cpaNote, margin + maxWidth - 4, y + 10, { align: 'right' });
      y += 22;

      // CPA explanation insight box
      if (cpaMax && grossMargin > 0) {
        checkPage(22);
        doc.setFillColor(255, 253, 240);
        doc.roundedRect(margin, y, maxWidth, 18, 1, 1, 'F');
        doc.setDrawColor(accentR, accentG, accentB);
        doc.setLineWidth(1.5);
        doc.line(margin, y, margin, y + 18);
        doc.setLineWidth(0.2);
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(60, 40, 0);
        const cpaExplain = `Por que ${cpaMaxCLP || 'N/D'}? Tu margen bruto unitario es de ${fmtCLP(grossMargin)}. El CPA maximo viable corresponde al 30% de ese margen, lo que garantiza rentabilidad incluso en campanas de adquisicion nuevas. Superar este umbral significa vender a perdida.`;
        const cpaLines = doc.splitTextToSize(cpaExplain, maxWidth - 10);
        doc.text(cpaLines.slice(0, 3), margin + 5, y + 6);
        y += 22;
      }
    }


    // Sales channels as styled table
    const q3 = getResponse('sales_channels');
    if (q3) {
      addSubTitle('Canales de Venta');
      const channels = q3.split('\n').filter(l => l.trim());
      checkPage(10 + channels.length * 11);
      const chColWs = [90, 80];
      addTableRow(['Canal', 'Participacion'], chColWs, 0, true);
      for (let chi = 0; chi < channels.length; chi++) {
        const clean = stripEmojis(channels[chi].replace(/^[🛒🏪🏬📱📸👥]+\s*/, ''));
        // Try to split "Canal: XX%" pattern
        const parts = clean.match(/^(.+?):\s*(.+)$/);
        if (parts) {
          addTableRow([parts[1].trim(), parts[2].trim()], chColWs, chi + 1);
        } else {
          // No percentage found — show 0%
          addTableRow([clean, '0%'], chColWs, chi + 1);
        }
      }
      y += 6;
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
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(profileName, px, y + 6);
      doc.setFont('NotoSans', 'normal');
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

    // (Competitive analysis section consolidated into INTELIGENCIA COMPETITIVA below)
    // Keep advantage response for positioning section
    const advResp = getResponse('your_advantage');

    // ─── SECCIÓN: POSICIONAMIENTO ────────────────────────────────────────────────
    addSectionHeader('4', 'POSICIONAMIENTO Y DIFERENCIACION');
    const cowResp = getResponse('purple_cow_promise');
    if (cowResp) { addSubTitle('Concepto Diferenciador (Vaca Purpura)'); addBody(cowResp); }
    const villResp = getResponse('villain_guarantee');
    if (villResp) { addSubTitle('Narrativa de Marca y Garantia'); addBody(villResp); }
    const proofResp = getResponse('proof_tone');
    if (proofResp) { addSubTitle('Prueba Social y Tono de Comunicacion'); addBody(proofResp); }

    // ─── SECCIÓN: EVALUACIÓN ESTRATÉGICA — ACCIONABLES (SCR Cards) ─────────────
    if (briefData.summary) {
      addSectionHeader('5', 'EVALUACION ESTRATEGICA — 7 ACCIONABLES');
      let planText = briefData.summary;
      const section7Match = planText.match(/##\s*7\./);
      const section6Match = planText.match(/##\s*6\./);
      const startMatch = section7Match || section6Match;
      if (startMatch?.index !== undefined) planText = planText.slice(startMatch.index);
      const planLines = planText.split('\n').filter(l => l.trim());
      // Skip lines that are the section header itself (e.g. "7. EVALUACIÓN ESTRATÉGICA...")
      const filteredPlanLines = planLines.filter(l => {
        const t = l.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '');
        return !t.match(/^\d+\.\s*(EVALUACION|EVALUACIÓN)\s+ESTRATEG/i);
      });
      let accionableNum = 0;
      let currentTitle = '';
      let currentSCR: { s: string; c: string; r: string } = { s: '', c: '', r: '' };
      let currentImpacto = '';
      const scrColors: Record<string, { bg: [number,number,number]; fg: [number,number,number]; label: string }> = {
        s: { bg: [230, 240, 255], fg: [27, 42, 74], label: 'SITUACION' },
        c: { bg: [255, 243, 230], fg: [180, 100, 20], label: 'COMPLICACION' },
        r: { bg: [230, 250, 235], fg: [22, 120, 50], label: 'RESOLUCION' },
      };

      const flushSCR = () => {
        if (accionableNum === 0) return;
        // Measure dynamic card height
        const scrEntries = (['s', 'c', 'r'] as const).filter(k => currentSCR[k]);
        const scrBlockH = scrEntries.length * 10;
        const titleClean = stripEmojis(currentTitle.replace(/^(Accionable\s*\d+[:.]\s*|\d+[:.]\s*)/i, ''));
        const cardH = 18 + scrBlockH + (currentImpacto ? 12 : 0) + 4;
        checkPage(cardH + 4);
        // Card container
        doc.setFillColor(250, 250, 254);
        doc.roundedRect(margin, y, maxWidth, cardH, 2, 2, 'F');
        doc.setDrawColor(midBlueR, midBlueG, midBlueB);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, y, maxWidth, cardH, 2, 2, 'S');
        // Number circle
        doc.setFillColor(brandR, brandG, brandB);
        doc.circle(margin + 8, y + 8, 5, 'F');
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text(String(accionableNum), margin + 8, y + 9.5, { align: 'center' });
        // Title — stripped of redundant numbering
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(brandR, brandG, brandB);
        const titleLines = doc.splitTextToSize(titleClean, maxWidth - 24);
        doc.text(titleLines[0] || '', margin + 16, y + 9);
        let sy = y + 16;
        // SCR sections
        for (const key of ['s', 'c', 'r'] as const) {
          const scr = scrColors[key];
          const text = currentSCR[key] || '';
          if (!text) continue;
          doc.setFillColor(...scr.bg);
          doc.roundedRect(margin + 4, sy, maxWidth - 8, 9, 1, 1, 'F');
          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(...scr.fg);
          doc.text(scr.label, margin + 7, sy + 3.5);
          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(40, 40, 40);
          const scrLines = doc.splitTextToSize(stripEmojis(text), maxWidth - 18);
          doc.text(scrLines[0] || '', margin + 7, sy + 7);
          sy += 10;
        }
        // Impacto de Negocio — styled colored block
        if (currentImpacto) {
          doc.setFillColor(253, 248, 240);
          doc.roundedRect(margin + 4, sy, maxWidth - 8, 10, 1, 1, 'F');
          doc.setFillColor(accentR, accentG, accentB);
          doc.rect(margin + 4, sy, 2, 10, 'F');
          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(accentR, accentG, accentB);
          doc.text('IMPACTO DE NEGOCIO', margin + 9, sy + 3.5);
          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(60, 40, 0);
          const impLines = doc.splitTextToSize(stripEmojis(currentImpacto), maxWidth - 22);
          doc.text(impLines[0] || '', margin + 9, sy + 7.5);
          sy += 12;
        }
        y += cardH + 4;
      };

      for (const line of filteredPlanLines) {
        const trimmed = line.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '');
        if (!trimmed || trimmed.match(/^\|[\s-:]+\|$/)) continue;
        if (trimmed.match(/^Accionable\s+\d+/i) || (trimmed.match(/^\d+\.\s/) && trimmed.length < 80)) {
          if (accionableNum > 0) flushSCR();
          accionableNum++;
          currentTitle = trimmed;
          currentSCR = { s: '', c: '', r: '' };
          currentImpacto = '';
        } else if (trimmed.toLowerCase().startsWith('impacto de negocio') || trimmed.toLowerCase().startsWith('impacto:')) {
          currentImpacto = trimmed.replace(/^[^:]*:\s*/, '');
        } else if (trimmed.toLowerCase().startsWith('situaci')) {
          currentSCR.s = trimmed.replace(/^[^:]*:\s*/, '');
        } else if (trimmed.toLowerCase().startsWith('complic')) {
          currentSCR.c = trimmed.replace(/^[^:]*:\s*/, '');
        } else if (trimmed.toLowerCase().startsWith('resolu')) {
          currentSCR.r = trimmed.replace(/^[^:]*:\s*/, '');
        } else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
          // Attach to last SCR field
          if (currentSCR.r) currentSCR.r += ' ' + trimmed.replace(/^[-•]\s*/, '');
          else if (currentSCR.c) currentSCR.c += ' ' + trimmed.replace(/^[-•]\s*/, '');
          else currentSCR.s += ' ' + trimmed.replace(/^[-•]\s*/, '');
        } else {
          addBody(trimmed, 4);
        }
      }
      flushSCR();
    }

    // ─── SECCIÓN: AUDITORÍA SEO ──────────────────────────────────────────────────
    if (research.seo_audit) {
      const seo = research.seo_audit;
      addSectionHeader('6', 'AUDITORIA SEO — ' + (clientInfo?.website_url || ''));
      checkPage(38);
      // ── SEO GAUGE ──
      const score = seo.score || 0;
      const gaugeX = margin + maxWidth / 2;
      const gaugeY = y + 20;
      const gaugeR = 18;
      // Background arc (gray)
      doc.setDrawColor(220, 222, 235);
      doc.setLineWidth(5);
      // Draw as segmented arcs — red, orange, yellow, green
      const gaugeSegments: { start: number; end: number; color: [number,number,number] }[] = [
        { start: 180, end: 234, color: [200, 40, 40] },   // 0-30
        { start: 234, end: 270, color: [230, 160, 30] },   // 31-50
        { start: 270, end: 306, color: [220, 200, 40] },   // 51-70
        { start: 306, end: 360, color: [22, 160, 70] },     // 71-100
      ];
      for (const seg of gaugeSegments) {
        doc.setDrawColor(...seg.color);
        doc.setLineWidth(4);
        // Approximate arc with lines
        const steps = 12;
        for (let si = 0; si < steps; si++) {
          const a1 = ((seg.start + (seg.end - seg.start) * si / steps) * Math.PI) / 180;
          const a2 = ((seg.start + (seg.end - seg.start) * (si + 1) / steps) * Math.PI) / 180;
          doc.line(
            gaugeX + Math.cos(a1) * gaugeR, gaugeY + Math.sin(a1) * gaugeR,
            gaugeX + Math.cos(a2) * gaugeR, gaugeY + Math.sin(a2) * gaugeR
          );
        }
      }
      // Needle position (score maps 0→180° to 100→360°)
      const needleAngle = (180 + (score / 100) * 180) * Math.PI / 180;
      doc.setDrawColor(brandR, brandG, brandB);
      doc.setLineWidth(1.5);
      doc.line(gaugeX, gaugeY, gaugeX + Math.cos(needleAngle) * (gaugeR - 3), gaugeY + Math.sin(needleAngle) * (gaugeR - 3));
      doc.setFillColor(brandR, brandG, brandB);
      doc.circle(gaugeX, gaugeY, 2, 'F');
      // Score value
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(20);
      const scoreColor: [number,number,number] = score >= 70 ? [22,160,70] : score >= 50 ? [200,150,0] : score >= 30 ? [230,160,30] : [200,40,40];
      doc.setTextColor(...scoreColor);
      doc.text(String(score), gaugeX, gaugeY + 10, { align: 'center' });
      doc.setFontSize(8);
      doc.text('/100', gaugeX + 10, gaugeY + 10);
      // Label
      const scoreLabel = score >= 70 ? 'BUENO' : score >= 50 ? 'REGULAR' : 'CRITICO';
      doc.setFontSize(9);
      doc.setFont('NotoSans', 'bold');
      doc.setTextColor(...scoreColor);
      doc.text(scoreLabel, gaugeX, gaugeY + 16, { align: 'center' });
      // Problems & recs count
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text(`${seo.issues?.length || 0} problemas  |  ${seo.recommendations?.length || 0} recomendaciones`, gaugeX, gaugeY + 21, { align: 'center' });
      y = gaugeY + 26;

      if (seo.issues?.length > 0) {
        addSubTitle('Problemas Detectados');
        for (const issue of seo.issues.slice(0, 5)) { addArrowBullet(issue); }
      }
      if (seo.recommendations?.length > 0) {
        addSubTitle('Acciones Prioritarias');
        for (const rec of seo.recommendations.slice(0, 5)) { addArrowBullet(rec); }
      }
      if (seo.competitive_seo_gap) { addSubTitle('GAP SEO vs Competencia'); addBody(seo.competitive_seo_gap); }
      renderGlossaryBox(pdfCtx, pdfHelpers, 'seo');
    }

    // ─── SECCIÓN: KEYWORDS ───────────────────────────────────────────────────────
    if (research.keywords) {
      const kw = research.keywords;
      addSectionHeader('7', 'ESTRATEGIA DE KEYWORDS Y SEM');

      // Keywords as styled badge-like chips in colored boxes
      const renderKwGroupStyled = (label: string, list: string[], bgColor: [number,number,number]) => {
        if (!list?.length) return;
        addSubTitle(label);
        checkPage(14);
        // Background box
        doc.setFillColor(...bgColor);
        const kwText = list.join('  |  ');
        const kwLines = doc.splitTextToSize(kwText, maxWidth - 10);
        const boxH = Math.max(10, kwLines.length * 4.5 + 6);
        doc.roundedRect(margin, y, maxWidth, boxH, 2, 2, 'F');
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(40, 40, 50);
        for (let kli = 0; kli < kwLines.length; kli++) {
          doc.text(kwLines[kli], margin + 5, y + 5 + kli * 4.5);
        }
        y += boxH + 4;
      };
      renderKwGroupStyled('Keywords Principales', kw.primary || [], [238, 242, 249]);
      renderKwGroupStyled('Long-tail (Baja Competencia)', kw.long_tail || [], [237, 247, 240]);
      renderKwGroupStyled('Keywords de Competidores', kw.competitor_keywords || [], [253, 248, 240]);
      // Keyword phases from roadmap
      if (kw.keyword_strategy_roadmap) { renderKeywordPhases(pdfCtx, pdfHelpers, kw.keyword_strategy_roadmap); }
      else { renderGlossaryBox(pdfCtx, pdfHelpers, 'keywords'); }
    }

    // ─── SECCIÓN: INTELIGENCIA COMPETITIVA (consolidated) ──────────────────────
    {
      const hasCompetitorAnalysis = !!research.competitor_analysis;
      const compResp = getResponse('competitors');
      if (hasCompetitorAnalysis || compResp) {
        addSectionHeader('8', 'ANALISIS COMPETITIVO E INTELIGENCIA DE MERCADO');

        // Show competitor listing from brief (simple table)
        if (compResp) {
          addSubTitle('Competidores Identificados');
          const compLines = compResp.split('\n').filter((l: string) => l.trim());
          const compEntries: { name: string; url: string }[] = [];
          let currentComp: { name: string; url: string } = { name: '', url: '' };
          for (const line of compLines) {
            const nameMatch = line.match(/(?:Nombre\s*(?:Competidor\s*)?\d*|comp\d*_name)\s*:\s*(.+)/i);
            const urlMatch = line.match(/(?:Web|URL|Instagram|comp\d*_url)\s*[/:]\s*(.+)/i);
            if (nameMatch) {
              if (currentComp.name) compEntries.push({ ...currentComp });
              currentComp = { name: nameMatch[1].trim(), url: '' };
            } else if (urlMatch) {
              currentComp.url = urlMatch[1].trim();
            }
          }
          if (currentComp.name) compEntries.push(currentComp);

          if (compEntries.length > 0) {
            checkPage(10 + compEntries.length * 11);
            const compColWs = [10, 60, 100];
            addTableRow(['#', 'Competidor', 'Web / Instagram'], compColWs, 0, true);
            for (let ci3 = 0; ci3 < compEntries.length; ci3++) {
              addTableRow([String(ci3 + 1), compEntries[ci3].name, compEntries[ci3].url], compColWs, ci3 + 1);
            }
            y += 6;
          } else {
            addBody(compResp);
          }
        }

        // Competitive advantage from brief
        if (advResp) { addSubTitle('Ventaja Competitiva'); addBody(advResp); }

        // Market gaps from AI analysis
        if (research.competitor_analysis?.market_gaps?.length > 0) {
          addSubTitle('Oportunidades de Mercado');
          for (const gap of research.competitor_analysis.market_gaps.slice(0, 5)) {
            addArrowBullet(gap);
          }
        }
      }
    }

    // ── Safe PDF section renderer — catches errors so one bad section doesn't kill the PDF ──
    const safePdfRender = (label: string, fn: () => void) => {
      try {
        fn();
      } catch (err) {
        console.error(`[PDF] Error rendering "${label}":`, err);
        try {
          addSubTitle(`Error en seccion: ${label}`);
          addBody('Esta seccion no pudo generarse correctamente. Los datos pueden estar incompletos.', 0, 5);
        } catch (_) { /* ignore nested error */ }
      }
    };

    // Enhanced competitor cards with full details (AI-generated)
    const compsForCards = research.competitor_analysis?.competitors || [];
    if (compsForCards.length > 0) {
      safePdfRender('Competidores', () => renderCompetitorCards(pdfCtx, pdfHelpers, compsForCards));
    }

    // Brand Identity
    safePdfRender('Identidad de Marca', () => renderBrandIdentity(pdfCtx, pdfHelpers, (research as any).brand_identity));

    // Financial Analysis
    safePdfRender('Analisis Financiero', () => renderFinancialAnalysis(pdfCtx, pdfHelpers, (research as any).financial_analysis));

    // Consumer Profile
    safePdfRender('Perfil del Consumidor', () => renderConsumerProfile(pdfCtx, pdfHelpers, (research as any).consumer_profile));

    // Positioning Strategy
    safePdfRender('Estrategia de Posicionamiento', () => renderPositioningStrategy(pdfCtx, pdfHelpers, (research as any).positioning_strategy));

    // Action Plan — handle _repair_failed gracefully
    const actionPlanData = (research as any).action_plan;
    let pdfActionPlanItems = Array.isArray(actionPlanData) ? actionPlanData : null;
    if (!pdfActionPlanItems && actionPlanData?._repair_failed && actionPlanData?.raw_text) {
      try {
        const parsed = JSON.parse(actionPlanData.raw_text);
        pdfActionPlanItems = Array.isArray(parsed) ? parsed
          : Array.isArray(parsed?.action_plan) ? parsed.action_plan : null;
      } catch {
        // ignored — expected for truncated JSON
      }
      if (!pdfActionPlanItems) {
        pdfActionPlanItems = parsePartialJsonArray(actionPlanData.raw_text);
        if (pdfActionPlanItems.length === 0) pdfActionPlanItems = null;
      }
      console.log('[PDF] action_plan _repair_failed, parsed items:', pdfActionPlanItems?.length ?? 0);
    }
    if (pdfActionPlanItems && pdfActionPlanItems.length > 0) {
      safePdfRender('Plan de Accion', () => renderActionPlan(pdfCtx, pdfHelpers, pdfActionPlanItems!));
    } else if (actionPlanData && (actionPlanData as any)._repair_failed) {
      // Try to extract action items from raw_text using regex
      safePdfRender('Plan de Accion', () => {
        addSectionHeader('E', 'PLAN DE ACCION ESTRATEGICO');
        const rawText = String(actionPlanData.raw_text || '');
        // Try to extract individual objects like {"title": "...", ...}
        const itemMatches = rawText.match(/\{[^{}]*"title"\s*:\s*"[^"]+[^{}]*\}/g);
        if (itemMatches && itemMatches.length > 0) {
          const extracted: any[] = [];
          for (const m of itemMatches) {
            try { extracted.push(JSON.parse(m)); } catch {
              try { extracted.push(JSON.parse(m + '}')); } catch {}
            }
          }
          if (extracted.length > 0) {
            renderActionPlan(pdfCtx, pdfHelpers, extracted);
            return;
          }
        }
        // Fallback: try section 7 from summary
        const summaryRaw = briefData?.summary || '';
        const sec7Match = summaryRaw.match(/##\s*7[\.\s]/);
        if (sec7Match && sec7Match.index !== undefined) {
          const sec7Text = summaryRaw.slice(sec7Match.index);
          const lines = sec7Text.split('\n').filter((l: string) => l.trim()).slice(0, 30);
          for (const line of lines) {
            const cleanLine = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
            if (cleanLine.length > 5) {
              if (/^(Accionable|\d+[\.\)])/.test(cleanLine)) {
                addSubTitle(cleanLine);
              } else {
                addBody(cleanLine, 0, 4.5);
              }
            }
          }
        } else {
          addBody('Los datos del plan de accion se generaron parcialmente. Regenera el brief para obtener el plan completo.', 0, 5);
        }
      });
    } else {
      safePdfRender('Plan de Accion', () => renderActionPlan(pdfCtx, pdfHelpers, actionPlanData));
    }

    // Meta Ads Strategy
    safePdfRender('Meta Ads', () => renderMetaAdsStrategy(pdfCtx, pdfHelpers, (research as any).meta_ads_strategy));

    // Google Ads Strategy
    safePdfRender('Google Ads', () => renderGoogleAdsStrategy(pdfCtx, pdfHelpers, (research as any).google_ads_strategy));

    // Ads Library full analysis
    safePdfRender('Ads Library', () => renderAdsLibraryAnalysis(pdfCtx, pdfHelpers, (research as any).ads_library_analysis));

    // Budget & Funnel (Charlie Methodology) — dynamic from backend
    safePdfRender('Presupuesto e Inversion', () => renderBudgetAndFunnel(pdfCtx, pdfHelpers, (research as any).budget_and_funnel));

    // ─── SECCIÓN: EMBUDO TOFU-MOFU-BOFU (fallback when no budget_and_funnel) ──
    if (!(research as any).budget_and_funnel) {
    checkPage(55);
    addSectionHeader('9', 'ESTRATEGIA DE EMBUDO — TOFU / MOFU / BOFU');
    // Use dynamic funnel distribution from meta_ads_strategy if available
    const funnelDist = (research as any).meta_ads_strategy?.distribucion_presupuesto || {};
    const tofuPct = funnelDist.tofu || '40%';
    const mofuPct = funnelDist.mofu || '40%';
    const bofuPct = funnelDist.bofu || '20%';
    const funnelLabels = [`TOFU — Awareness (${tofuPct})`, `MOFU — Consideracion (${mofuPct})`, `BOFU — Conversion (${bofuPct})`];
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
      doc.setFont('NotoSans', 'bold');
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
    // Use AI-generated ROAS projections if available
    const aiRoas = (research as any).budget_and_funnel?.roas_projection;
    const roasDay30Label = aiRoas?.day_30?.roas || '3x';
    const roasDay90Label = aiRoas?.day_90?.roas || '5x+';
    const roasPoints = [
      { x: chartStartX, y: chartStartY, label: 'Dia 0\n1x' },
      { x: chartStartX + (chartEndX - chartStartX) / 3, y: chartStartY - 15, label: `Dia 30\n${roasDay30Label}` },
      { x: chartEndX, y: chartTopY, label: `Dia 90\n${roasDay90Label}` },
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
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(accentR, accentG, accentB);
      const lparts = pt.label.split('\n');
      doc.text(lparts[0], pt.x, pt.y - 5, { align: 'center' });
      doc.text(lparts[1], pt.x, pt.y - 1, { align: 'center' });
    }
    y = chartStartY + 14;

    // ─── SECCIÓN: CALENDARIO DE IMPLEMENTACIÓN 90 DÍAS ──────────────────────────
    addSectionHeader('10', 'CALENDARIO DE IMPLEMENTACION — 90 DIAS');
    checkPage(70);

    // Use AI-generated implementation calendar if available
    const aiCalendar = (research as any).budget_and_funnel?.implementation_calendar;
    if (aiCalendar && typeof aiCalendar === 'object') {
      const calChannelKeys = ['meta_ads', 'google_ads', 'seo', 'email', 'ugc'];
      const calChannelLabels: Record<string, string> = {
        meta_ads: 'Meta Ads', google_ads: 'Google Ads', seo: 'SEO', email: 'Email/Klaviyo', ugc: 'UGC/Influencers'
      };
      const calPhases = Object.entries(aiCalendar);
      // Build table from AI data
      const aiCalChannels = calChannelKeys.filter(k => calPhases.some(([, pd]: [string, any]) => pd && pd[k]));
      const aiCalColWs = [30, 55, 55, 55];
      const phaseHeaders = calPhases.slice(0, 3).map(([, pd]: [string, any]) => {
        const days = pd?.days || '';
        const focus = pd?.focus || '';
        return days ? `${days}${focus ? ': ' + focus.slice(0, 15) : ''}` : focus?.slice(0, 20) || '';
      });
      addTableRow(['Canal', phaseHeaders[0] || 'Fase 1', phaseHeaders[1] || 'Fase 2', phaseHeaders[2] || 'Fase 3'], aiCalColWs, 0, true);
      for (let ci = 0; ci < aiCalChannels.length; ci++) {
        checkPage(10);
        const chKey = aiCalChannels[ci];
        const actions = calPhases.slice(0, 3).map(([, pd]: [string, any]) => stripEmojis(String(pd?.[chKey] || '')).slice(0, 35));
        addTableRow([calChannelLabels[chKey] || chKey, actions[0] || '', actions[1] || '', actions[2] || ''], aiCalColWs, ci + 1);
      }
    } else {
      // Fallback: hardcoded calendar
      const calChannels = ['Meta Ads', 'Google Ads', 'SEO', 'Email/Klaviyo', 'UGC/Influencers'];
      const calActions = [
        ['Campanas TOFU cold audiences', 'MOFU retargeting + Lookalike', 'BOFU retargeting caliente + upsell'],
        ['Search campana de marca', 'Shopping + Display remarketing', 'Performance Max escala'],
        ['Auditoria tecnica y fichas', 'Blog posts keywords principales', 'Link building + featured snippets'],
        ['Welcome + abandono carrito', 'Post-compra + recompra', 'Segmentacion VIP + winback'],
        ['1 creator micro-influencer', '3 UGC videos para ads', 'Programa embajadores'],
      ];
      const calColWs = [30, 55, 55, 55];
      addTableRow(['Canal', 'Fase 1 (0-30d)', 'Fase 2 (30-60d)', 'Fase 3 (60-90d)'], calColWs, 0, true);
      for (let ci = 0; ci < calChannels.length; ci++) {
        checkPage(10);
        addTableRow([calChannels[ci], calActions[ci][0], calActions[ci][1], calActions[ci][2]], calColWs, ci + 1);
      }
    }
    y += 6;
    } // end fallback (no budget_and_funnel)


    addSectionHeader('11', 'PLANTILLAS DE COPY LISTAS PARA USAR');

    // Meta Ads copies — use AI-generated creativos if available
    const metaStrategy = (research as any).meta_ads_strategy || research.ads_library_analysis?.meta_ads_strategy;
    const businessName = stripEmojis(getResponse('business_pitch')).split(/[.,\n]/)[0].slice(0, 40).trim() || clientInfo?.company || clientInfo?.name || 'Tu Marca';

    // Build Meta Ads from AI-generated creativos (not hardcoded)
    const aiCreativos = metaStrategy?.creativos_recomendados || [];
    const metaAds = aiCreativos.length > 0
      ? aiCreativos.slice(0, 5).map((c: any, i: number) => ({
          title: `Meta Ad #${i + 1} — ${stripEmojis(c.formato || c.format || 'Creativo')}`,
          texto: stripEmojis(c.copy || c.primary_copy || c.hook || ''),
          cta: c.cta || 'Ver mas',
          audiencia: c.audiencia || (i === 0 ? 'Cold audience — Prospecting' : i < 3 ? 'Tibia — Retargeting' : 'Caliente — Remarketing'),
        }))
      : [
          {
            title: 'Meta Ad #1 — TOFU (Video Hook)',
            texto: metaStrategy?.hooks?.[0] || `Descubra por que ${businessName} se ha convertido en la primera opcion del mercado.`,
            cta: 'Descubre por que',
            audiencia: 'Cold audience — Lookalike 1-3%',
          },
          {
            title: 'Meta Ad #2 — MOFU (Testimonio)',
            texto: metaStrategy?.primary_texts?.[0] || `Resultados comprobados. ${businessName} ha transformado la experiencia de miles de clientes.`,
            cta: 'Ver testimonios',
            audiencia: 'Retargeting — visitaron sitio 30d',
          },
          {
            title: 'Meta Ad #3 — BOFU (Oferta)',
            texto: metaStrategy?.primary_texts?.[1] || `Oferta exclusiva por tiempo limitado. ${businessName} — sin riesgos, con garantia completa.`,
            cta: 'Comprar ahora',
            audiencia: 'ATC + ViewContent — ultimos 14 dias',
          },
        ];

    // Meta Ads — premium styled cards with full text
    addSubTitle('Meta Ads — Copies Listos');
    const metaFunnelColors: [number,number,number][] = [
      [27, 42, 74],   // TOFU navy
      [45, 74, 122],  // MOFU mid-blue
      [200, 163, 90], // BOFU gold
      [22, 120, 80],  // Green
      [120, 60, 140], // Purple
    ];
    for (let mi = 0; mi < metaAds.length; mi++) {
      const ad = metaAds[mi];
      const mColor = metaFunnelColors[mi % metaFunnelColors.length];

      // Calculate dynamic card height based on text content
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8.5);
      const adTextLines = doc.splitTextToSize(stripEmojis(ad.texto), maxWidth - 12);
      const cardH = 12 + adTextLines.length * 4.5 + 10; // header + text + audiencia

      checkPage(cardH + 4);
      // Card bg — dynamic height
      doc.setFillColor(250, 250, 254);
      doc.roundedRect(margin, y, maxWidth, cardH, 2, 2, 'F');
      doc.setDrawColor(...mColor);
      doc.setLineWidth(0.5);
      doc.roundedRect(margin, y, maxWidth, cardH, 2, 2, 'S');
      // Header bar
      doc.setFillColor(...mColor);
      doc.roundedRect(margin, y, maxWidth, 9, 2, 2, 'F');
      doc.rect(margin, y + 5, maxWidth, 4, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(ad.title, margin + 5, y + 6.5);
      // CTA badge
      doc.setFillColor(accentR, accentG, accentB);
      doc.roundedRect(pageWidth - margin - 30, y + 2, 28, 5, 2, 2, 'F');
      doc.setFontSize(6.5);
      doc.text(String(ad.cta).slice(0, 18), pageWidth - margin - 16, y + 5.5, { align: 'center' });
      // Body text — ALL lines (no truncation)
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(40, 40, 50);
      for (let tli = 0; tli < adTextLines.length; tli++) {
        doc.text(adTextLines[tli], margin + 5, y + 14 + tli * 4.5);
      }
      // Audiencia tag
      const audY = y + 14 + adTextLines.length * 4.5 + 2;
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 120);
      doc.text('Audiencia: ', margin + 5, audY);
      doc.setFont('NotoSans', 'normal');
      doc.setTextColor(60, 60, 70);
      doc.text(ad.audiencia, margin + 5 + doc.getTextWidth('Audiencia: '), audY);
      y += cardH + 4;
    }
    y += 4;

    // Google Ads copies — use AI-generated ad_copies if available
    const googleStrategy = (research as any).google_ads_strategy || research.ads_library_analysis?.google_ads_strategy;
    addSubTitle('Google Ads — Copies Listos');

    // Build Google Ads from AI ad_copies or fall back to extracted headlines
    const aiAdCopies = googleStrategy?.ad_copies || [];
    const googleAds = aiAdCopies.length > 0
      ? aiAdCopies.slice(0, 5).map((c: any) => ({
          headline: [c.headline1, c.headline2, c.headline3].filter(Boolean).join(' | '),
          desc: [c.description1, c.description2].filter(Boolean).join(' '),
          url: clientInfo?.website_url || 'tusitio.com',
        }))
      : [
          {
            headline: googleStrategy?.headlines?.[0] || `${businessName.slice(0, 25)} | Oficial`,
            desc: googleStrategy?.descriptions?.[0] || `Mejor precio garantizado. Envio gratis hoy.`,
            url: clientInfo?.website_url || 'tusitio.com',
          },
          {
            headline: googleStrategy?.headlines?.[1] || `Compra ${businessName.slice(0, 20)} — Ahora`,
            desc: googleStrategy?.descriptions?.[1] || `Resultados probados. Miles de clientes satisfechos. Garantia incluida.`,
            url: clientInfo?.website_url || 'tusitio.com',
          },
        ];
    for (let gi2 = 0; gi2 < googleAds.length; gi2++) {
      const gad = googleAds[gi2];
      // Dynamic card height
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8);
      const descLines = doc.splitTextToSize(stripEmojis(gad.desc), maxWidth - 14);
      const gCardH = 14 + descLines.length * 4 + 4;

      checkPage(gCardH + 4);
      doc.setFillColor(248, 249, 255);
      doc.roundedRect(margin, y, maxWidth, gCardH, 2, 2, 'F');
      doc.setDrawColor(brandR, brandG, brandB);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, maxWidth, gCardH, 2, 2, 'S');
      // Google blue accent
      doc.setFillColor(66, 133, 244);
      doc.rect(margin, y, 3, gCardH, 'F');
      // Headline
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(66, 133, 244);
      const hText = stripEmojis(gad.headline);
      const hLines = doc.splitTextToSize(hText, maxWidth - 14);
      for (let hli = 0; hli < hLines.length; hli++) {
        doc.text(hLines[hli], margin + 7, y + 7 + hli * 4.5);
      }
      // URL
      let descStartY = y + 7 + hLines.length * 4.5 + 1;
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(22, 130, 50);
      doc.text((gad.url || '').replace(/^https?:\/\//, '').slice(0, 40), margin + 7, descStartY);
      descStartY += 5;
      // Description — ALL lines
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      for (const dl of descLines) {
        doc.text(dl, margin + 7, descStartY);
        descStartY += 4;
      }
      y += gCardH + 4;
    }
    y += 4;

    // ─── SECCIÓN: PRESUPUESTO RECOMENDADO (fallback when no budget_and_funnel) ──
    if (!(research as any).budget_and_funnel) {
      addSectionHeader('12', 'PRESUPUESTO RECOMENDADO');
      checkPage(60);

      const metaBudgetObj = (research as any).meta_ads_strategy?.presupuesto_sugerido;
      const googleBudgetObj = (research as any).google_ads_strategy?.presupuesto_sugerido;
      const hasDynamicBudget = metaBudgetObj || googleBudgetObj;

      if (hasDynamicBudget && typeof metaBudgetObj === 'object') {
        addSubTitle('Distribucion de Presupuesto por Canal');
        const dynBudgetCols = ['Canal', 'Presupuesto Sugerido'];
        const dynBudgetColWs = [70, 100];
        addTableRow(dynBudgetCols, dynBudgetColWs, 0, true);
        let budgetRowIdx = 1;
        for (const [key, val] of Object.entries(metaBudgetObj)) {
          addTableRow([key.replace(/_/g, ' '), String(val)], dynBudgetColWs, budgetRowIdx++);
        }
        if (googleBudgetObj && typeof googleBudgetObj === 'object') {
          for (const [key, val] of Object.entries(googleBudgetObj)) {
            addTableRow([`Google: ${key.replace(/_/g, ' ')}`, String(val)], dynBudgetColWs, budgetRowIdx++);
          }
        }
      } else {
        addInsightBox('El presupuesto detallado se define en funcion del CPA maximo viable y los objetivos de ROAS. Consulte con su estratega para una propuesta personalizada basada en los datos de este brief.');
      }
      y += 8;
    }

    // cost benchmarks
    if (research.cost_benchmarks && typeof research.cost_benchmarks === 'object') {
      const cb = research.cost_benchmarks as Record<string, any>;
      const cbKeys = Object.keys(cb).slice(0, 4);
      if (cbKeys.length > 0) {
        const cbText = cbKeys.map(k => `${k}: ${String(cb[k])}`).join('  |  ');
        addInsightBox(`Benchmark de mercado: ${cbText}`);
      }
    }

    // ─── SECCIÓN: CHECKLIST DE ACCION INMEDIATA ─────────────────────────────────
    addSectionHeader('13', 'CHECKLIST DE ACCION INMEDIATA — ESTA SEMANA');
    checkPage(70);

    // Use AI-generated checklist if available
    const aiChecklist = (research as any).budget_and_funnel?.weekly_optimization_checklist;
    const checklist = (Array.isArray(aiChecklist) && aiChecklist.length > 0)
      ? aiChecklist.slice(0, 10).map((item: any) => stripEmojis(String(item)))
      : [
        'Instalar Meta Pixel y Google Tag en el sitio web',
        'Conectar Shopify, Meta Ads y Google Ads al portal STEVE.IO',
        'Definir y aprobar el Buyer Persona con el equipo',
        `Verificar que el CPA objetivo sea <= ${cpaMaxCLP || 'N/D'} antes de lanzar`,
        'Crear o revisar la landing page de producto principal',
        'Activar flujo de abandono de carrito en Klaviyo',
        'Solicitar 3 testimonios reales a clientes actuales',
        'Revisar y optimizar el titulo H1 y meta description del sitio',
        'Configurar Google Analytics 4 con conversion tracking',
        'Programar primera revision de KPIs para el dia 14',
      ];
    // Calculate total height dynamically based on text wrapping
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(9);
    const checkTextWidth = maxWidth - 18; // leave room for number prefix and checkbox
    const wrappedChecklist = checklist.map((item: string) => {
      const prefix = `${checklist.indexOf(item) + 1}. [  ] `;
      return doc.splitTextToSize(item, checkTextWidth);
    });
    const totalCheckH = wrappedChecklist.reduce((sum: number, lines: string[]) => sum + lines.length * 5 + 2, 0) + 8;

    doc.setFillColor(248, 248, 250);
    doc.roundedRect(margin, y, maxWidth, totalCheckH, 2, 2, 'F');
    doc.setDrawColor(accentR, accentG, accentB);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin, y + totalCheckH);
    doc.setLineWidth(0.2);
    y += 5;
    for (let ci2 = 0; ci2 < checklist.length; ci2++) {
      checkPage(12);
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      const prefix = `${ci2 + 1}. [  ] `;
      const lines = doc.splitTextToSize(checklist[ci2], checkTextWidth);
      // First line with prefix
      doc.text(`${prefix}${lines[0]}`, margin + 5, y);
      y += 5;
      // Continuation lines indented
      for (let li = 1; li < lines.length; li++) {
        doc.text(lines[li], margin + 5 + doc.getTextWidth(prefix), y);
        y += 5;
      }
      y += 2;
    }
    y += 4;

    // ─── SECCIÓN: GLOSARIO COMPACTO ─────────────────────────────────────────────
    // No forced page break — let content flow naturally
    checkPage(30);
    addSectionHeader('14', 'GLOSARIO COMPACTO DE PERFORMANCE MARKETING');

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
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(compactGlossary[gi].term, gx + 3, gy + 5.5);
      doc.setFont('NotoSans', 'normal');
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

    // Text-based logo on final page — no pixelated image
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('STEVE.IO', pageWidth / 2, 32, { align: 'center' });

    // Title
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(255, 255, 255);
    doc.text('Y ahora que?', pageWidth / 2, pageHeight * 0.2 + 18, { align: 'center' });

    doc.setFontSize(14);
    doc.setTextColor(accentR + 40, accentG + 40, accentB + 20);
    doc.text('Tu Brief esta listo. Es hora de activar la maquina.', pageWidth / 2, pageHeight * 0.2 + 30, { align: 'center' });

    doc.setFont('NotoSans', 'normal');
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
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(accentR + 40, accentG + 40, 80);
      doc.text(`•  ${sp}`, pageWidth / 2, steveY, { align: 'center' });
      steveY += 7;
    }

    // CPA box
    steveY += 6;
    doc.setFillColor(accentR, accentG, accentB);
    doc.roundedRect(margin + 15, steveY, maxWidth - 30, 20, 2, 2, 'F');
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`Tu CPA maximo viable es ${cpaMaxCLP || 'N/D'}. Steve Ads esta calibrado para nunca superarlo.`, pageWidth / 2, steveY + 12, { align: 'center', maxWidth: maxWidth - 36 });
    steveY += 26;

    // CTA
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin + 30, steveY, maxWidth - 60, 14, 2, 2, 'F');
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text('Accede a Steve Ads en app.steve.io', pageWidth / 2, steveY + 9, { align: 'center' });
    steveY += 20;

    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 180);
    doc.text('Este informe fue generado por STEVE.IO — Plataforma de Performance Marketing para e-commerce latinoamericano', pageWidth / 2, steveY + 4, { align: 'center', maxWidth: maxWidth });

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

    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(brandR, brandG, brandB);
    doc.text('Dr. Steve Dogs', margin + 20, y + 5);
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.text('PhD Performance Marketing, Stanford Dog University', margin + 20, y + 10);
    doc.text('Director de Estrategia, BG Consult / STEVE.IO', margin + 20, y + 15);
    y += 20;

    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Fecha de emision: ${new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);
    y += 5;

    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(accentR, accentG, accentB);
    doc.text('ESTRICTAMENTE CONFIDENCIAL — Preparado exclusivamente para uso del cliente indicado.', margin, y);


    // ─── RENDER TABLE OF CONTENTS (go back to the reserved ToC page) ───────────
    doc.setPage(tocPageNum);
    let tocY = 12;
    // Header bar
    doc.setFillColor(brandR, brandG, brandB);
    doc.rect(0, 0, pageWidth, 16, 'F');
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('INDICE DE CONTENIDOS', pageWidth / 2, 11, { align: 'center' });
    tocY = 26;

    // Gold accent line
    doc.setDrawColor(accentR, accentG, accentB);
    doc.setLineWidth(0.8);
    doc.line(margin, tocY - 2, pageWidth - margin, tocY - 2);
    tocY += 4;

    for (const entry of tocEntries) {
      if (tocY > pageHeight - 30) break; // safety
      const numStr = String(entry.num);
      const titleStr = entry.title;
      const pageStr = `Pag. ${entry.page}`;

      // Number circle
      doc.setFillColor(accentR, accentG, accentB);
      doc.circle(margin + 5, tocY + 1, 3.5, 'F');
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(brandR, brandG, brandB);
      doc.text(numStr, margin + 5, tocY + 2.5, { align: 'center' });

      // Title
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 50);
      doc.text(stripEmojis(titleStr), margin + 14, tocY + 2);

      // Page number (right-aligned)
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text(pageStr, pageWidth - margin, tocY + 2, { align: 'right' });

      // Dotted leader line
      doc.setDrawColor(200, 200, 210);
      doc.setLineWidth(0.2);
      const titleWidth = doc.getTextWidth(stripEmojis(titleStr));
      const pageNumWidth = doc.getTextWidth(pageStr);
      const leaderStart = margin + 14 + titleWidth + 4;
      const leaderEnd = pageWidth - margin - pageNumWidth - 4;
      if (leaderEnd > leaderStart + 10) {
        for (let dx = leaderStart; dx < leaderEnd; dx += 3) {
          doc.line(dx, tocY + 3, dx + 1, tocY + 3);
        }
      }

      tocY += 10;
    }

    // ─── FOOTERS EN TODAS LAS PÁGINAS ───────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      addFooter(i, pageCount);
    }

    doc.save(`Brief_Estrategico_${clientInfo?.name || 'Marca'}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Brief estratégico descargado con éxito');
    } catch (pdfError) {
      console.error('Error generando PDF:', pdfError);
      toast.error('Error al generar el PDF. Intenta nuevamente.');
    }
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
    <BriefErrorBoundary>
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
          <AnalysisProgressBanner progressStep={progressStep} elapsedSeconds={elapsedSeconds} />
          {diagnostic && elapsedSeconds >= 15 && user?.email === 'jmbarros@bgconsult.cl' && (
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
          {elapsedSeconds >= 480 && (
            <Card className="border-green-400/50 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 shadow-sm">
              <CardContent className="py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-800 dark:text-green-300">Tu analisis esta listo</p>
                    <p className="text-xs text-green-600/80 dark:text-green-400/70 mt-0.5">
                      Si no se actualizo automaticamente, pulsa el boton para verlo.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleForceShowAnalysis}
                  className="bg-green-600 hover:bg-green-700 text-white shadow-sm whitespace-nowrap"
                >
                  Ver analisis
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {analysisStatus === 'complete' && hasResearch && (
        <Card className="border-green-400/40 bg-gradient-to-r from-green-50/80 to-emerald-50/80 dark:from-green-950/20 dark:to-emerald-950/20 shadow-sm">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-green-800 dark:text-green-300">Analisis estrategico completado</p>
              <p className="text-xs text-green-600/80 dark:text-green-400/70 mt-0.5">Revisa las pestanas SEO, Keywords, Meta Ads, Google Ads y Competencia para ver los resultados.</p>
            </div>
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
              Habla con Steve para crear tu Brief Estratégico en solo 16 preguntas.
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
            {(() => {
              const aiPersona = (research as any).consumer_profile?.buyer_persona_principal;
              const hasAI = aiPersona && typeof aiPersona === 'object' && (aiPersona.nombre_ficticio || aiPersona.pain_points);

              if (!hasAI && !personaResponse) return null;

              // AI persona data helpers
              const aiName = aiPersona?.nombre_ficticio || '';
              const aiAge = aiPersona?.edad;
              const aiGender = (aiPersona?.genero || '').toLowerCase();
              const aiImage = aiGender.includes('fem') || aiGender.includes('mujer') ? personaFemale : aiGender.includes('masc') || aiGender.includes('hombre') ? personaMale : personaImage;
              const aiLocation = aiPersona?.ubicacion || '';
              const aiOccupation = aiPersona?.ocupacion || '';
              const aiIncome = aiPersona?.nivel_socioeconomico || '';
              const aiFamily = aiPersona?.estado_civil || '';

              const painText = hasAI
                ? (Array.isArray(aiPersona.pain_points) ? aiPersona.pain_points.slice(0, 3).join('. ') + '.' : String(aiPersona.pain_points || ''))
                : getResponse('persona_pain') || 'Pendiente';
              const quoteText = hasAI
                ? (aiPersona.frase_que_lo_define || '')
                : '';
              const lifestyleText = hasAI
                ? (typeof aiPersona.psicografia === 'object' ? (aiPersona.psicografia.estilo_de_vida || '') : String(aiPersona.psicografia || ''))
                : getResponse('persona_lifestyle') || 'Pendiente';
              const transformText = hasAI
                ? (Array.isArray(aiPersona.motivadores_de_compra) ? aiPersona.motivadores_de_compra.slice(0, 3).join('. ') + '.' : String(aiPersona.motivadores_de_compra || ''))
                : getResponse('persona_transformation') || 'Pendiente';
              const barrerasText = hasAI && Array.isArray(aiPersona.barreras_y_objeciones)
                ? aiPersona.barreras_y_objeciones.slice(0, 3).join('. ') + '.'
                : '';

              return (
              <Card className="overflow-hidden border-2 border-primary/10">
                <CardHeader className="bg-primary/5 pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Buyer Persona {hasAI && <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium ml-auto">AI</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid md:grid-cols-[200px_1fr] gap-6">
                    <div className="text-center">
                      <img
                        src={hasAI ? aiImage : personaImage}
                        alt="Buyer Persona"
                        className="w-36 h-36 object-cover rounded-xl mx-auto mb-3 shadow-md border-2 border-primary/10"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <h3 className="font-bold text-lg">{hasAI ? aiName : (personaProfile['nombre ficticio'] || personaProfile['nombre'] || 'Cliente Ideal')}</h3>
                      <p className="text-sm text-muted-foreground">{hasAI ? (aiAge ? `${aiAge} anos` : '') : (personaProfile['edad'] ? `${personaProfile['edad']} anos` : '')}</p>
                      {(hasAI ? aiLocation : (personaProfile['ciudad / zona'] || personaProfile['ciudad'])) && (
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {hasAI ? aiLocation : (personaProfile['ciudad / zona'] || personaProfile['ciudad'])}
                        </p>
                      )}
                      {(hasAI ? aiOccupation : (personaProfile['ocupación'] || personaProfile['ocupacion'])) && (
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
                          <Briefcase className="h-3 w-3" />
                          {hasAI ? aiOccupation : (personaProfile['ocupación'] || personaProfile['ocupacion'])}
                        </p>
                      )}
                      {(hasAI ? aiFamily : (personaProfile['estado civil / familia'] || personaProfile['familia'])) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {hasAI ? aiFamily : (personaProfile['estado civil / familia'] || personaProfile['familia'])}
                        </p>
                      )}
                      {(hasAI ? aiIncome : (personaProfile['ingreso mensual aprox.'] || personaProfile['ingreso'])) && (
                        <p className="text-xs font-medium text-primary mt-1">
                          {hasAI ? aiIncome : formatCurrency(personaProfile['ingreso mensual aprox.'] || personaProfile['ingreso'] || '')}
                        </p>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                          <Heart className="h-3 w-3" /> Dolor Principal
                        </p>
                        <p className="text-sm leading-relaxed">{painText}</p>
                      </div>

                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> Lo que Dice
                        </p>
                        {hasAI && quoteText ? (
                          <p className="text-sm italic text-muted-foreground border-l-2 border-primary/20 pl-2">"{quoteText}"</p>
                        ) : getResponse('persona_words') ? (
                          <ul className="space-y-1">
                            {(() => {
                              const raw = getResponse('persona_words');
                              const parts = raw
                                .split(/\s*\/\s*|\n+/)
                                .map((l: string) =>
                                  l.replace(/^[-\u2022*\d.)]+\s*/, '').replace(/^["'\u00AB\u201C\u201D]\s*/, '').replace(/\s*["'\u00BB\u201C\u201D]$/, '').replace(/^[^a-zA-Z\u00E1\u00E9\u00ED\u00F3\u00FA\u00C1\u00C9\u00CD\u00D3\u00DA\u00F1\u00D1]+/, '').trim()
                                )
                                .filter((s: string) => s.length > 8);
                              return parts.map((frase: string, i: number) => (
                                <li key={i} className="text-sm italic text-muted-foreground border-l-2 border-primary/20 pl-2">"{frase}"</li>
                              ));
                            })()}
                          </ul>
                        ) : <p className="text-sm text-muted-foreground italic">Pendiente</p>}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                          <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> Motivadores de Compra
                          </p>
                          <p className="text-sm leading-relaxed">{transformText}</p>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
                            <Gem className="h-3 w-3" /> Estilo de Vida
                          </p>
                          <p className="text-sm leading-relaxed">{lifestyleText}</p>
                        </div>
                      </div>

                      {barrerasText && (
                        <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
                          <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-1.5 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Barreras y Objeciones
                          </p>
                          <p className="text-sm leading-relaxed">{barrerasText}</p>
                        </div>
                      )}

                      {!hasAI && (personaProfile['¿por qué te compra?'] || personaProfile['por qué te compra']) && (
                        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                          <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                            <Target className="h-3 w-3" /> ¿Por que Compra?
                          </p>
                          <p className="text-sm font-medium">{personaProfile['¿por qué te compra?'] || personaProfile['por qué te compra']}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })()}

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
            {(() => {
              const raw = briefData?.summary || '';
              const hasMarkdownContent = raw.includes('## ') && raw.length > 300;
              const execSummary = (research as any)?.executive_summary;
              const showSection = isComplete && (hasMarkdownContent || execSummary);
              if (!showSection) return null;
              return (
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
                  {hasMarkdownContent ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed [&>h1]:text-lg [&>h1]:font-bold [&>h1]:text-primary [&>h1]:mt-6 [&>h1]:mb-3 [&>h2]:text-base [&>h2]:font-bold [&>h2]:text-primary [&>h2]:mt-5 [&>h2]:mb-2 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:text-primary/80 [&>h3]:mt-4 [&>h3]:mb-2 [&>h3]:border-l-2 [&>h3]:border-primary/30 [&>h3]:pl-3 [&>p]:mb-3 [&>table]:text-sm [&>table]:w-full [&_th]:bg-primary/10 [&_th]:text-left [&_th]:p-2 [&_td]:p-2 [&_td]:border-b [&_td]:border-border [&>ul]:my-2 [&>ol]:my-2 [&>ul>li]:mb-1 [&>ol>li]:mb-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{
                      (() => {
                        const firstHeader = raw.indexOf('## ');
                        const section7 = raw.match(/##\s*7\./);
                        const start = firstHeader > 0 ? firstHeader : 0;
                        const end = section7?.index ?? raw.length;
                        return raw.slice(start, end).trim();
                      })()
                    }</ReactMarkdown>
                  </div>
                  ) : execSummary ? (
                  <div className="space-y-4">
                    {/* Render executive_summary structured data */}
                    {execSummary.situacion_actual && (
                      <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                        <h3 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">📊 Situación Actual</h3>
                        <p className="text-sm leading-relaxed">{typeof execSummary.situacion_actual === 'string' ? execSummary.situacion_actual : safeText(execSummary.situacion_actual)}</p>
                      </div>
                    )}
                    {execSummary.posicion_competitiva && (
                      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <h3 className="text-sm font-bold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2">🏆 Posición Competitiva</h3>
                        {typeof execSummary.posicion_competitiva === 'string' ? (
                          <p className="text-sm leading-relaxed">{execSummary.posicion_competitiva}</p>
                        ) : typeof execSummary.posicion_competitiva === 'object' ? (
                          <div className="space-y-2">
                            {Object.entries(execSummary.posicion_competitiva).map(([k, v]: [string, any]) => (
                              <div key={k}>
                                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase mb-0.5">{k.replace(/_/g, ' ')}</p>
                                {Array.isArray(v) ? (
                                  <ul className="text-xs space-y-0.5 list-disc list-inside">{v.map((item: any, j: number) => <li key={j}>{safeText(item)}</li>)}</ul>
                                ) : <p className="text-xs">{safeText(v)}</p>}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                    {execSummary.oportunidades_detectadas && (
                      <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                        <h3 className="text-sm font-bold text-green-700 dark:text-green-400 mb-2 flex items-center gap-2">💡 Oportunidades Detectadas</h3>
                        {Array.isArray(execSummary.oportunidades_detectadas) ? (
                          <ul className="space-y-2">{execSummary.oportunidades_detectadas.map((op: any, j: number) => (
                            <li key={j} className="text-sm border-l-2 border-green-400 pl-3">
                              {typeof op === 'string' ? op : (
                                <div>
                                  {op.oportunidad && <p className="font-semibold text-xs">{op.oportunidad}</p>}
                                  {op.accion_recomendada && <p className="text-xs text-muted-foreground">{op.accion_recomendada}</p>}
                                  {op.impacto_estimado && <p className="text-xs text-green-600 dark:text-green-400 italic">{op.impacto_estimado}</p>}
                                </div>
                              )}
                            </li>
                          ))}</ul>
                        ) : <p className="text-sm">{safeText(execSummary.oportunidades_detectadas)}</p>}
                      </div>
                    )}
                    {execSummary.amenazas_identificadas && (
                      <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                        <h3 className="text-sm font-bold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">⚠️ Amenazas Identificadas</h3>
                        {Array.isArray(execSummary.amenazas_identificadas) ? (
                          <ul className="space-y-1">{execSummary.amenazas_identificadas.map((a: any, j: number) => (
                            <li key={j} className="text-sm flex items-start gap-2"><span className="text-red-500 mt-0.5">•</span>{safeText(a)}</li>
                          ))}</ul>
                        ) : <p className="text-sm">{safeText(execSummary.amenazas_identificadas)}</p>}
                      </div>
                    )}
                    {execSummary.recomendaciones_priorizadas && (
                      <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                        <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">🎯 Recomendaciones Priorizadas</h3>
                        {Array.isArray(execSummary.recomendaciones_priorizadas) ? (
                          <ul className="space-y-2">{execSummary.recomendaciones_priorizadas.map((rec: any, j: number) => (
                            <li key={j} className="text-sm border-l-2 border-amber-400 pl-3">
                              {typeof rec === 'string' ? rec : (
                                <div>
                                  {rec.recomendacion && <p className="font-semibold text-xs">{rec.recomendacion}</p>}
                                  {rec.justificacion && <p className="text-xs text-muted-foreground">{rec.justificacion}</p>}
                                  {rec.impacto_estimado && <p className="text-xs text-amber-600 dark:text-amber-400 italic">{rec.impacto_estimado}</p>}
                                </div>
                              )}
                            </li>
                          ))}</ul>
                        ) : <p className="text-sm">{safeText(execSummary.recomendaciones_priorizadas)}</p>}
                      </div>
                    )}
                    {/* Render summary text if it's a JSON string with additional data */}
                    {execSummary.summary && typeof execSummary.summary === 'string' && execSummary.summary.length > 200 && !execSummary.summary.startsWith('{') && (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{execSummary.summary}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  ) : null}
                </CardContent>
              </Card>
              );
            })()}

            {/* Evaluación Estratégica — 7 Accionables as numbered cards */}
            {(() => {
              const rawActionPlan = (research as any).action_plan;
              let parsedActionPlan = Array.isArray(rawActionPlan) ? rawActionPlan : null;
              if (!parsedActionPlan && rawActionPlan?._repair_failed && rawActionPlan?.raw_text) {
                // First try: full JSON parse
                try {
                  const parsed = JSON.parse(rawActionPlan.raw_text);
                  parsedActionPlan = Array.isArray(parsed) ? parsed
                    : Array.isArray(parsed?.action_plan) ? parsed.action_plan : null;
                } catch {
                  // ignored — expected for truncated JSON
                }
                // Second try: bracket-counting parser for truncated JSON
                if (!parsedActionPlan) {
                  parsedActionPlan = parsePartialJsonArray(rawActionPlan.raw_text);
                  if (parsedActionPlan.length === 0) parsedActionPlan = null;
                }
                console.log('[BrandBriefView] action_plan _repair_failed, parsed items:', parsedActionPlan?.length ?? 0);
              }
              const showSection = (parsedActionPlan && parsedActionPlan.length > 0) || isComplete;
              if (!showSection) return null;
              return (
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
                  {parsedActionPlan && parsedActionPlan.length > 0 ? (
                    <StructuredAccionables items={parsedActionPlan} />
                  ) : (() => {
                    // Try to extract from raw_text of action_plan even if JSON parse failed
                    if (rawActionPlan?._repair_failed && rawActionPlan?.raw_text) {
                      const rawText = String(rawActionPlan.raw_text);
                      // Try to extract individual items with regex
                      const titleMatches = rawText.match(/"title"\s*:\s*"([^"]+)"/g);
                      if (titleMatches && titleMatches.length > 0) {
                        const items: any[] = [];
                        const itemBlocks = rawText.match(/\{[^{}]*"title"\s*:\s*"[^"]+[^{}]*/g) || [];
                        for (const block of itemBlocks) {
                          const title = block.match(/"title"\s*:\s*"([^"]+)"/)?.[1] || '';
                          const priority = block.match(/"priority"\s*:\s*"([^"]+)"/)?.[1] || '';
                          const timeline = block.match(/"timeline"\s*:\s*"([^"]+)"/)?.[1] || '';
                          const situation = block.match(/"situation"\s*:\s*"([^"]+)"/)?.[1] || '';
                          const resolution = block.match(/"resolution"\s*:\s*"([^"]+)"/)?.[1] || '';
                          if (title) items.push({ title, priority, timeline, situation, resolution });
                        }
                        if (items.length > 0) {
                          return <StructuredAccionables items={items} />;
                        }
                      }
                    }
                    const raw = briefData?.summary || '';
                    const section7Match = raw.match(/##\s*7[\.\s]/) || raw.match(/##\s*(Evaluaci|Accionable|Plan de Acci)/i);
                    if (!section7Match || section7Match.index === undefined) {
                      return (
                        <p className="text-sm text-muted-foreground italic">La evaluacion estrategica se generara al completar el brief.</p>
                      );
                    }
                    const section7Text = raw.slice(section7Match.index);
                    const firstAcc = section7Text.search(/###\s*(Accionable\s*)?\d/i);
                    const introText = firstAcc > 0
                      ? section7Text.slice(0, firstAcc).replace(/^##[^#\n]*\n/, '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim()
                      : '';
                    const accionableSection = firstAcc >= 0 ? section7Text.slice(firstAcc) : section7Text;
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
                          <ExpandableAccionables blocks={accionableBlocks.slice(0, 7)} />
                        </div>
                      );
                    }
                    return (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>h2]:text-base [&>h2]:font-bold [&>h2]:text-primary [&>h2]:mt-4 [&>h2]:mb-2 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:text-primary/80 [&>h3]:mt-3 [&>h3]:mb-1 [&>h3]:border-l-2 [&>h3]:border-primary/30 [&>h3]:pl-3 [&>p]:mb-2 [&>ul>li]:mb-1 [&>table]:text-xs [&_th]:bg-primary/10 [&_th]:p-2 [&_td]:p-2 [&_td]:border-b [&_td]:border-border">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{section7Text}</ReactMarkdown>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
              );
            })()}

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
            {analysisStatus === 'pending' ? (
              <Card className="text-center py-14 border-primary/20 bg-gradient-to-b from-primary/5 to-background">
                <CardContent className="space-y-4">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  </div>
                  <div>
                    <p className="text-primary font-bold text-base">Auditoria SEO en progreso</p>
                    <p className="text-muted-foreground text-sm mt-1">Analizando estructura, meta tags, velocidad, mobile-first y posicionamiento vs competencia.</p>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Score detallado</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Problemas + soluciones</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Gap vs competencia</span>
                  </div>
                </CardContent>
              </Card>
            ) : !hasSEO ? (
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
                        <div key={i} className="border border-border rounded-lg p-4 space-y-3">
                          {/* Header: name, URL, threat badge */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs font-bold">{i + 1}</Badge>
                              <span className="font-semibold text-sm">{comp.name || comp.url || `Competidor ${i + 1}`}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {comp.seo_score != null && (
                                <span className={`text-xs font-bold ${Number(comp.seo_score) >= 70 ? 'text-primary' : Number(comp.seo_score) >= 40 ? 'text-yellow-600' : 'text-destructive'}`}>
                                  SEO: {comp.seo_score}/100
                                </span>
                              )}
                              {comp.nivel_amenaza && (
                                <Badge className={`text-[10px] ${
                                  ['alto', 'high'].includes(String(comp.nivel_amenaza).toLowerCase()) ? 'bg-destructive text-destructive-foreground' :
                                  ['medio', 'medium'].includes(String(comp.nivel_amenaza).toLowerCase()) ? 'bg-yellow-500 text-yellow-950' :
                                  'bg-primary/20 text-primary'
                                }`}>
                                  🎯 {String(comp.nivel_amenaza).charAt(0).toUpperCase() + String(comp.nivel_amenaza).slice(1)}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {comp.url && (
                            <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline block">{comp.url}</a>
                          )}

                          {/* Value Proposition */}
                          {comp.value_proposition && (
                            <div className="bg-primary/5 rounded p-2">
                              <p className="text-[10px] font-semibold text-primary mb-0.5">Propuesta de Valor</p>
                              <p className="text-xs">{String(comp.value_proposition)}</p>
                            </div>
                          )}

                          {/* Strengths & Weaknesses grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {comp.strengths?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">✅ Fortalezas</p>
                                <ul className="text-xs space-y-0.5">
                                  {comp.strengths.map((s: string, j: number) => (
                                    <li key={j} className="flex items-start gap-1"><span className="text-primary">✅</span>{s == null ? '' : String(s)}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {comp.weaknesses?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide mb-1">❌ Debilidades</p>
                                <ul className="text-xs space-y-0.5">
                                  {comp.weaknesses.map((w: string, j: number) => (
                                    <li key={j} className="flex items-start gap-1"><span className="text-destructive">❌</span>{w == null ? '' : String(w)}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          {/* What they do better / What client does better */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {comp.que_hacen_mejor && (
                              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-2">
                                <p className="text-[10px] font-semibold text-yellow-700 dark:text-yellow-400 uppercase tracking-wide mb-0.5">⚠️ Qué Hacen Mejor</p>
                                <p className="text-xs">{String(comp.que_hacen_mejor)}</p>
                              </div>
                            )}
                            {comp.que_hace_cliente_mejor && (
                              <div className="bg-primary/5 border border-primary/20 rounded p-2">
                                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-0.5">💪 Qué Hacemos Mejor</p>
                                <p className="text-xs">{String(comp.que_hace_cliente_mejor)}</p>
                              </div>
                            )}
                          </div>

                          {/* Content Strategy */}
                          {comp.estrategia_contenido && (
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">📋 Estrategia de Contenido</p>
                              <p className="text-xs text-muted-foreground">{String(comp.estrategia_contenido)}</p>
                            </div>
                          )}

                          {/* Threat justification */}
                          {comp.justificacion_amenaza && (
                            <div className="border-t border-border pt-2">
                              <p className="text-[10px] text-muted-foreground italic">{String(comp.justificacion_amenaza)}</p>
                            </div>
                          )}
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
            {analysisStatus === 'pending' ? (
              <Card className="text-center py-14 border-primary/20 bg-gradient-to-b from-primary/5 to-background">
                <CardContent className="space-y-4">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  </div>
                  <div>
                    <p className="text-primary font-bold text-base">Investigacion de keywords en progreso</p>
                    <p className="text-muted-foreground text-sm mt-1">Analizando tu sitio y competencia para encontrar oportunidades de posicionamiento.</p>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> 8-10 keywords</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Long-tail</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Negativas</span>
                  </div>
                </CardContent>
              </Card>
            ) : !hasKeywords ? (
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
                      <CardDescription className="text-xs">Featured snippets y oportunidades detectadas</CardDescription>
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
                      <CardDescription className="text-xs">Keywords y posicionamiento competitivo detectado</CardDescription>
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
                              {comp.seo_score && (
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px]">SEO Score: {String(comp.seo_score)}</Badge>
                                </div>
                              )}
                              {comp.estrategia_contenido && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Estrategia de Contenido</p>
                                  <p className="text-xs text-muted-foreground">{String(comp.estrategia_contenido)}</p>
                                </div>
                              )}
                              {comp.que_hacen_mejor && (
                                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                                  <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-0.5">Qué Hacen Mejor</p>
                                  <p className="text-xs leading-relaxed">{String(comp.que_hacen_mejor)}</p>
                                </div>
                              )}
                              {Array.isArray(comp.weaknesses) && comp.weaknesses.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Debilidades</p>
                                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                                    {comp.weaknesses.map((w: any, wi: number) => (
                                      <li key={wi}>{safeText(w)}</li>
                                    ))}
                                  </ul>
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
            {analysisStatus === 'pending' ? (
              <Card className="text-center py-14 border-primary/20 bg-gradient-to-b from-primary/5 to-background">
                <CardContent className="space-y-4">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  </div>
                  <div>
                    <p className="text-primary font-bold text-base">Analisis de competencia en progreso</p>
                    <p className="text-muted-foreground text-sm mt-1">Escaneando sitios web de hasta 6 competidores y generando benchmark comparativo.</p>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Benchmark</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Gaps</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Oportunidades</span>
                  </div>
                </CardContent>
              </Card>
            ) : !hasCompetitors && !research.ads_library_analysis ? (
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
                                <Badge variant="secondary" className="text-[10px]">🤖 Detectado automáticamente</Badge>
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
                          <p className="text-sm leading-relaxed font-medium italic">"{typeof (research.positioning_strategy as any).statement_posicionamiento === 'string' ? (research.positioning_strategy as any).statement_posicionamiento : JSON.stringify((research.positioning_strategy as any).statement_posicionamiento)}"</p>
                        </div>
                      )}

                      {/* Posicionamiento Recomendado */}
                      {(research.positioning_strategy as any).posicionamiento_recomendado && (
                        <div className="bg-muted/50 rounded-lg p-3 border border-border">
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1">🎯 Posicionamiento Recomendado</p>
                          <p className="text-xs leading-relaxed">{typeof (research.positioning_strategy as any).posicionamiento_recomendado === 'string' ? (research.positioning_strategy as any).posicionamiento_recomendado : JSON.stringify((research.positioning_strategy as any).posicionamiento_recomendado)}</p>
                        </div>
                      )}

                      {/* Posicionamiento Actual */}
                      {(research.positioning_strategy as any).posicionamiento_actual && (
                        <div className="bg-muted/50 rounded-lg p-3 border border-border">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">📍 Posicionamiento Actual</p>
                          <p className="text-xs leading-relaxed">{typeof (research.positioning_strategy as any).posicionamiento_actual === 'string' ? (research.positioning_strategy as any).posicionamiento_actual : JSON.stringify((research.positioning_strategy as any).posicionamiento_actual)}</p>
                        </div>
                      )}

                      {/* Territorios de Comunicación */}
                      {Array.isArray((research.positioning_strategy as any).territorios_comunicacion) && (research.positioning_strategy as any).territorios_comunicacion.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-2">🏷️ Territorios de Comunicación</p>
                          <div className="flex flex-wrap gap-2">
                            {(research.positioning_strategy as any).territorios_comunicacion.map((t: any, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">{typeof t === 'string' ? t : (t?.nombre || t?.territorio || JSON.stringify(t))}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mensajes Clave Diferenciadores */}
                      {Array.isArray((research.positioning_strategy as any).mensajes_clave_diferenciadores) && (research.positioning_strategy as any).mensajes_clave_diferenciadores.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-2">💬 Mensajes Clave</p>
                          <ul className="space-y-2">
                            {(research.positioning_strategy as any).mensajes_clave_diferenciadores.map((m: any, i: number) => {
                              const text = typeof m === 'string' ? m : (m?.mensaje || m?.text || JSON.stringify(m));
                              const context = typeof m === 'object' ? (m?.contexto_uso || m?.diferenciacion_vs_competencia || '') : '';
                              return (
                              <li key={i} className="flex items-start gap-2 text-xs bg-muted/40 rounded-lg p-2.5 border border-border">
                                <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                                <div className="leading-relaxed">
                                  <span className="font-medium">{text}</span>
                                  {context && <p className="text-muted-foreground mt-1">{context}</p>}
                                </div>
                              </li>
                              );
                            })}
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
                                  <Badge variant="outline" className="text-[10px] capitalize">{key.replace(/_/g, ' ')}</Badge>
                                  {typeof val === 'string' ? (
                                    <span className="flex-1">{val}</span>
                                  ) : (
                                    <>
                                      {(val.x || val.posicion_x || val.score_x) && (val.y || val.posicion_y || val.score_y) ? (
                                        <span className="text-muted-foreground">({val.x || val.posicion_x || val.score_x}, {val.y || val.posicion_y || val.score_y})</span>
                                      ) : null}
                                      <span className="flex-1">{val.descripcion || val.description || (typeof val === 'object' ? Object.entries(val).filter(([,v]) => v != null && String(v).trim()).map(([k,v]) => `${k}: ${v}`).join(' | ') : safeText(val))}</span>
                                    </>
                                  )}
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
    </BriefErrorBoundary>
  );
}
