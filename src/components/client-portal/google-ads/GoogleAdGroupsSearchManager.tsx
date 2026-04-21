import { useState, useEffect, useCallback, useRef } from 'react';
import { callApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  RefreshCw,
  Loader2,
  Plus,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Type as TypeIcon,
  Puzzle,
  Sparkles,
  Pencil,
  X,
  Pause,
  Play,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

interface AdGroup {
  id: string;
  name: string;
  status: string;
  cpc_bid_micros: number;
  campaign_id: string;
  campaign_name: string;
  clicks: number;
  impressions: number;
  cost_micros: number;
  conversions: number;
  ctr: number;
  cost_clp: number;
  ad_strength: string;
  currency: string;
}

interface Keyword {
  criterion_id: string;
  resource_name: string;
  text: string;
  match_type: string;
  status: string;
  cpc_bid_micros: number;
  negative: boolean;
  quality_score: number | null;
  clicks: number;
  impressions: number;
  conversions: number;
  cost_micros: number;
}

interface RSA {
  resource_name: string;
  ad_id: string;
  status: string;
  ad_strength: string;
  final_urls: string[];
  headlines: Array<{ text: string; pinnedField?: string }>;
  descriptions: Array<{ text: string; pinnedField?: string }>;
  path1: string;
  path2: string;
}

interface ExtensionsByType {
  SITELINK: any[];
  CALLOUT: any[];
  STRUCTURED_SNIPPET: any[];
  CALL: any[];
  PRICE: any[];
}

interface AdGroupDetail {
  keywords_positive: Keyword[];
  keywords_negative: Keyword[];
  rsas: RSA[];
  extensions: ExtensionsByType;
  counts: {
    keywords: number; negatives: number; rsas: number;
    sitelinks: number; callouts: number; snippets: number;
    calls: number; prices: number;
  };
}

interface Props {
  connectionId: string;
  clientId: string;
}

const adStrengthColors: Record<string, string> = {
  EXCELLENT: 'bg-green-500/10 text-green-600 border-green-500/20',
  GOOD: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  AVERAGE: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  POOR: 'bg-red-500/10 text-red-600 border-red-500/20',
  UNSPECIFIED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  PENDING: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};
const adStrengthLabels: Record<string, string> = {
  EXCELLENT: 'Excelente', GOOD: 'Buena', AVERAGE: 'Promedio', POOR: 'Pobre',
  UNSPECIFIED: 'Sin datos', PENDING: 'Procesando',
};
const statusLabels: Record<string, string> = {
  ENABLED: 'Activo', PAUSED: 'Pausado', REMOVED: 'Eliminado',
};
const matchTypeColors: Record<string, string> = {
  BROAD: 'bg-gray-500/10 text-gray-700 dark:text-gray-300',
  PHRASE: 'bg-blue-500/10 text-blue-600',
  EXACT: 'bg-green-500/10 text-green-600',
};

// Scorecard config — mismo patrón que PMAX STRENGTH_CONFIG
const KEYWORDS_CONFIG = {
  keywords:  { recommended: 20, weight: 3, required: true,  label: 'Keywords activas' },
  negatives: { recommended: 10, weight: 2, required: false, label: 'Negative keywords' },
};
const RSA_CONFIG = {
  headlines:    { recommended: 15, weight: 3, required: true, label: 'Headlines' },
  descriptions: { recommended: 4,  weight: 3, required: true, label: 'Descriptions' },
  rsas:         { recommended: 1,  weight: 2, required: true, label: 'RSA ad' },
};
const EXT_CONFIG = {
  sitelinks: { recommended: 4, weight: 2, label: 'Sitelinks' },
  callouts:  { recommended: 4, weight: 2, label: 'Callouts' },
  snippets:  { recommended: 2, weight: 1, label: 'Structured snippets' },
  calls:     { recommended: 1, weight: 1, label: 'Call' },
  prices:    { recommended: 1, weight: 1, label: 'Price' },
};

function computeScore(items: Record<string, { current: number; recommended: number; weight: number; required?: boolean; label: string }>) {
  let earned = 0, total = 0;
  const missing: any[] = [];
  for (const [k, cfg] of Object.entries(items)) {
    total += cfg.weight;
    const cov = Math.min(cfg.current / cfg.recommended, 1);
    earned += cfg.weight * cov;
    if (cfg.current < cfg.recommended) missing.push({ key: k, ...cfg });
  }
  return {
    score: Math.round((earned / total) * 100),
    missing: missing.sort((a, b) => (b.required === a.required ? b.weight - a.weight : (b.required ? 1 : -1))),
  };
}

function scoreColor(s: number): string {
  if (s >= 90) return 'bg-green-500';
  if (s >= 75) return 'bg-emerald-500';
  if (s >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

// Whitelist Google snippet headers (enum fijo oficial)
const SNIPPET_HEADERS = [
  'Brands', 'Courses', 'Degree programs', 'Destinations', 'Featured hotels',
  'Insurance coverage', 'Models', 'Neighborhoods', 'Service catalog',
  'Shows', 'Styles', 'Types',
];

export default function GoogleAdGroupsSearchManager({ connectionId, clientId }: Props) {
  const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCampaign, setFilterCampaign] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, AdGroupDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const fetchingRef = useRef(false);

  // Steve suggest keywords dialog
  const [kwSuggestOpen, setKwSuggestOpen] = useState(false);
  const [kwSuggestAgId, setKwSuggestAgId] = useState<string | null>(null);
  const [kwSuggestLoading, setKwSuggestLoading] = useState(false);
  const [kwSuggestAdding, setKwSuggestAdding] = useState(false);
  const [kwSuggestOptions, setKwSuggestOptions] = useState<Array<{ text: string; match_type: string; intent?: string; reason?: string; _selected?: boolean }>>([]);
  const [kwSuggestNegatives, setKwSuggestNegatives] = useState<Array<{ text: string; reason?: string; _selected?: boolean }>>([]);
  const [kwUserIntent, setKwUserIntent] = useState('');

  // Add manual keyword dialog
  const [addKwOpen, setAddKwOpen] = useState(false);
  const [addKwAgId, setAddKwAgId] = useState<string | null>(null);
  const [addKwText, setAddKwText] = useState('');
  const [addKwMatch, setAddKwMatch] = useState('BROAD');
  const [addKwLoading, setAddKwLoading] = useState(false);

  // Add negative keyword dialog
  const [addNegOpen, setAddNegOpen] = useState(false);
  const [addNegAgId, setAddNegAgId] = useState<string | null>(null);
  const [addNegCampaignId, setAddNegCampaignId] = useState<string | null>(null);
  const [addNegText, setAddNegText] = useState('');
  const [addNegScope, setAddNegScope] = useState<'campaign' | 'ad_group'>('ad_group');
  const [addNegMatch, setAddNegMatch] = useState('EXACT');
  const [addNegLoading, setAddNegLoading] = useState(false);

  // Edit RSA dialog
  const [editRsaOpen, setEditRsaOpen] = useState(false);
  const [editRsaAgId, setEditRsaAgId] = useState<string | null>(null);
  const [editRsaOld, setEditRsaOld] = useState<RSA | null>(null);
  const [editRsaHeadlines, setEditRsaHeadlines] = useState<string[]>([]);
  const [editRsaDescriptions, setEditRsaDescriptions] = useState<string[]>([]);
  const [editRsaFinalUrl, setEditRsaFinalUrl] = useState('');
  const [editRsaPath1, setEditRsaPath1] = useState('');
  const [editRsaPath2, setEditRsaPath2] = useState('');
  const [editRsaLoading, setEditRsaLoading] = useState(false);

  // QS insights (B3): lee keyword_quality_score_history — top 5 keywords low QS + drops recientes
  const [qsAlerts, setQsAlerts] = useState<Array<{ keyword: string; current: number; previous: number | null; drop: number; ad_group_name?: string }>>([]);
  const [qsOpen, setQsOpen] = useState(false);

  // Extensions create dialog (unificado en card Extensions)
  const [extOpen, setExtOpen] = useState(false);
  const [extAgId, setExtAgId] = useState<string | null>(null);
  const [extCampaignId, setExtCampaignId] = useState<string | null>(null);
  const [extType, setExtType] = useState<'SITELINK' | 'CALLOUT' | 'SNIPPET'>('SITELINK');
  const [extScope, setExtScope] = useState<'ad_group' | 'campaign'>('ad_group');
  const [extLoading, setExtLoading] = useState(false);
  // Sitelink fields
  const [extSitelinkText, setExtSitelinkText] = useState('');
  const [extSitelinkDesc1, setExtSitelinkDesc1] = useState('');
  const [extSitelinkDesc2, setExtSitelinkDesc2] = useState('');
  const [extSitelinkUrl, setExtSitelinkUrl] = useState('');
  // Callout fields
  const [extCalloutText, setExtCalloutText] = useState('');
  // Snippet fields (header enum whitelist Google Ads)
  const [extSnippetHeader, setExtSnippetHeader] = useState<string>('Types');
  const [extSnippetValues, setExtSnippetValues] = useState<string[]>(['', '', '']);

  // Keyword Planner dialog (Tier 3 — Google Ads keyword_plan_idea_service)
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerAgId, setPlannerAgId] = useState<string | null>(null);
  const [plannerSeed, setPlannerSeed] = useState('');
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerAdding, setPlannerAdding] = useState(false);
  const [plannerIdeas, setPlannerIdeas] = useState<Array<{ text: string; avg_monthly_searches: number; competition: string; competition_index: number; cpc_low_micros: number; cpc_high_micros: number; _selected?: boolean; _match_type?: string }>>([]);
  // B4: filters client-side (sin nuevo fetch)
  const [plannerMinVolume, setPlannerMinVolume] = useState<number>(0);
  const [plannerMaxCompetition, setPlannerMaxCompetition] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('HIGH');

  // Create RSA dialog (same fields, but via create_rsa action)
  const [createRsaOpen, setCreateRsaOpen] = useState(false);
  const [createRsaAgId, setCreateRsaAgId] = useState<string | null>(null);
  const [createRsaHeadlines, setCreateRsaHeadlines] = useState<string[]>(['', '', '']);
  const [createRsaDescriptions, setCreateRsaDescriptions] = useState<string[]>(['', '']);
  const [createRsaFinalUrl, setCreateRsaFinalUrl] = useState('');
  const [createRsaLoading, setCreateRsaLoading] = useState(false);

  const fetchAdGroups = useCallback(async (opts?: { silent?: boolean }) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      if (!opts?.silent) setLoading(true);
      setRefreshing(true);
      const { data, error } = await callApi('manage-google-keywords', {
        body: { action: 'list_search_ad_groups', connection_id: connectionId },
      });
      setRefreshing(false);
      if (error) {
        if (!opts?.silent) toast.error('Error cargando Ad Groups: ' + error);
        setLoading(false);
        return;
      }
      const ags: AdGroup[] = data?.ad_groups || [];
      setAdGroups(ags);
      const warns = (data as any)?.warnings;
      if (Array.isArray(warns)) warns.forEach((w: string) => toast.warning(w));
      setLoading(false);
    } finally {
      fetchingRef.current = false;
    }
  }, [connectionId]);

  useEffect(() => { fetchAdGroups(); }, [fetchAdGroups]);

  // B3: Cargar QS alerts (low QS + drops recientes) — últimos 7 días del cron
  // Filter por connection_id para no mezclar alerts si el cliente tiene multiple Google accounts
  useEffect(() => {
    async function loadQsAlerts() {
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('keyword_quality_score_history')
        .select('criterion_id, keyword_text, quality_score, snapshot_date, ad_group_id')
        .eq('client_id', clientId)
        .eq('connection_id', connectionId)
        .gte('snapshot_date', weekAgo)
        .order('snapshot_date', { ascending: false })
        .limit(500);
      if (error || !data) return;

      // Agrupar por criterion_id: snapshot más reciente (today) + hace 7 días (weekAgo)
      const grouped = new Map<string, { current?: any; previous?: any }>();
      for (const row of data as any[]) {
        const e = grouped.get(row.criterion_id) || {};
        if (row.snapshot_date === today && !e.current) e.current = row;
        else if (row.snapshot_date === weekAgo && !e.previous) e.previous = row;
        else if (!e.current) e.current = row; // fallback al más reciente
        grouped.set(row.criterion_id, e);
      }

      const alerts: Array<{ keyword: string; current: number; previous: number | null; drop: number; ad_group_name?: string }> = [];
      for (const [, v] of grouped) {
        if (!v.current) continue;
        const current = v.current.quality_score;
        const previous = v.previous?.quality_score ?? null;
        const drop = previous ? previous - current : 0;
        if (current < 5 || drop >= 2) {
          alerts.push({ keyword: v.current.keyword_text, current, previous, drop });
        }
      }
      // Ordenar: primero los críticos (lower QS), luego mayor drop
      alerts.sort((a, b) => (a.current - b.current) || (b.drop - a.drop));
      setQsAlerts(alerts.slice(0, 20));
    }
    loadQsAlerts();
  }, [clientId, connectionId]);

  const refreshDetail = async (agId: string) => {
    setDetailLoading(p => ({ ...p, [agId]: true }));
    const { data, error } = await callApi('manage-google-keywords', {
      body: { action: 'get_ad_group_detail', connection_id: connectionId, ad_group_id: agId },
    });
    setDetailLoading(p => ({ ...p, [agId]: false }));
    if (error) {
      toast.error('Error cargando detalle: ' + error);
      return;
    }
    const warns = (data as any)?.warnings;
    if (Array.isArray(warns)) warns.forEach((w: string) => toast.warning(w));
    setDetail(p => ({ ...p, [agId]: data as AdGroupDetail }));
  };

  const toggleExpand = async (agId: string) => {
    if (expandedId === agId) { setExpandedId(null); return; }
    setExpandedId(agId);
    if (!detail[agId]) await refreshDetail(agId);
  };

  // ── Steve AI: suggest keywords ────────────────────────────────────────
  const openKwSuggest = async (agId: string) => {
    setKwSuggestAgId(agId);
    setKwSuggestOpen(true);
    setKwSuggestOptions([]);
    setKwSuggestNegatives([]);
    setKwUserIntent('');
    setKwSuggestLoading(true);
    const { data, error } = await callApi('manage-google-keywords', {
      body: {
        action: 'suggest_keywords',
        connection_id: connectionId,
        data: { client_id: clientId, count: 12, match_type_default: 'BROAD' },
      },
    });
    setKwSuggestLoading(false);
    if (error) { toast.error('Steve no pudo sugerir: ' + error); return; }
    const warns = (data as any)?.warnings;
    if (Array.isArray(warns)) warns.forEach((w: string) => toast.warning(w));
    setKwSuggestOptions((data?.options || []).map((o: any) => ({ ...o, _selected: true })));
    setKwSuggestNegatives((data?.negative_suggestions || []).map((n: any) => ({ ...n, _selected: true })));
  };

  const regenerateKwSuggest = async () => {
    if (!kwSuggestAgId) return;
    setKwSuggestLoading(true);
    const { data, error } = await callApi('manage-google-keywords', {
      body: {
        action: 'suggest_keywords',
        connection_id: connectionId,
        data: { client_id: clientId, user_intent: kwUserIntent || undefined, count: 12, match_type_default: 'BROAD' },
      },
    });
    setKwSuggestLoading(false);
    if (error) { toast.error('Steve no pudo regenerar: ' + error); return; }
    setKwSuggestOptions((data?.options || []).map((o: any) => ({ ...o, _selected: true })));
    setKwSuggestNegatives((data?.negative_suggestions || []).map((n: any) => ({ ...n, _selected: true })));
  };

  const applyKwSuggest = async () => {
    if (!kwSuggestAgId) return;
    const selectedPositive = kwSuggestOptions.filter(o => o._selected);
    const selectedNeg = kwSuggestNegatives.filter(n => n._selected);
    if (selectedPositive.length === 0 && selectedNeg.length === 0) {
      toast.error('Seleccioná al menos una sugerencia'); return;
    }
    setKwSuggestAdding(true);
    let added = 0, failed = 0;
    for (const kw of selectedPositive) {
      const { error } = await callApi('manage-google-keywords', {
        body: {
          action: 'add_keyword', connection_id: connectionId,
          data: { ad_group_id: kwSuggestAgId, keyword_text: kw.text, match_type: kw.match_type },
        },
      });
      if (error) failed++; else added++;
    }
    for (const neg of selectedNeg) {
      const { error } = await callApi('manage-google-keywords', {
        body: {
          action: 'add_negative_keyword', connection_id: connectionId,
          data: { ad_group_id: kwSuggestAgId, keyword_text: neg.text, match_type: 'EXACT' },
        },
      });
      if (error) failed++; else added++;
    }
    setKwSuggestAdding(false);
    if (added > 0) toast.success(`${added} keyword(s) agregada(s)${failed > 0 ? `, ${failed} fallaron` : ''}`);
    else if (failed > 0) toast.error(`${failed} keyword(s) fallaron`);
    if (expandedId === kwSuggestAgId) await refreshDetail(kwSuggestAgId);
    setKwSuggestOpen(false);
  };

  // ── Extensions (create unificado) ────────────────────────────────────
  const openExtensionCreate = (agId: string, campaignId: string) => {
    setExtAgId(agId);
    setExtCampaignId(campaignId);
    setExtType('SITELINK');
    setExtScope('ad_group');
    setExtSitelinkText(''); setExtSitelinkDesc1(''); setExtSitelinkDesc2(''); setExtSitelinkUrl('');
    setExtCalloutText('');
    setExtSnippetHeader('Types'); setExtSnippetValues(['', '', '']);
    setExtOpen(true);
  };

  const submitExtension = async () => {
    if (!extAgId || !extCampaignId) return;
    setExtLoading(true);
    try {
      // Step 1: crear el asset según type
      let createAction = '';
      let createData: any = {};
      if (extType === 'SITELINK') {
        const text = extSitelinkText.trim();
        const url = extSitelinkUrl.trim();
        if (!text || !url) { toast.error('Link text y final URL son obligatorios'); return; }
        if (text.length > 25) { toast.error('Link text máx 25 chars'); return; }
        createAction = 'create_sitelink';
        createData = {
          link_text: text.slice(0, 25),
          description1: extSitelinkDesc1.trim().slice(0, 35) || undefined,
          description2: extSitelinkDesc2.trim().slice(0, 35) || undefined,
          final_urls: [url],
        };
      } else if (extType === 'CALLOUT') {
        const text = extCalloutText.trim();
        if (!text) { toast.error('Callout text obligatorio'); return; }
        if (text.length > 25) { toast.error('Callout máx 25 chars'); return; }
        createAction = 'create_callout';
        createData = { callout_text: text.slice(0, 25) };
      } else if (extType === 'SNIPPET') {
        const values = extSnippetValues.map(v => v.trim()).filter(v => v.length > 0 && v.length <= 25);
        if (values.length < 3) { toast.error('Structured snippet requiere al menos 3 valores'); return; }
        createAction = 'create_snippet';
        createData = { header: extSnippetHeader, values };
      }

      const createRes = await callApi('manage-google-extensions', {
        body: { action: createAction, connection_id: connectionId, data: createData },
      });
      if (createRes.error || !createRes.data?.asset_id) {
        toast.error('Error creando asset: ' + (createRes.error || 'sin asset_id'));
        return;
      }
      const assetId = String(createRes.data.asset_id);

      // Step 2: linkear al ad_group o campaign
      const linkData: any = {
        asset_id: assetId,
        field_type: extType === 'SNIPPET' ? 'STRUCTURED_SNIPPET' : extType,
      };
      if (extScope === 'ad_group') linkData.ad_group_id = extAgId;
      else linkData.campaign_id = extCampaignId;

      const linkRes = await callApi('manage-google-extensions', {
        body: { action: 'link_asset', connection_id: connectionId, data: linkData },
      });
      if (linkRes.error) {
        toast.warning(`Asset creado pero no se pudo linkear: ${linkRes.error}. Podés linkearlo manualmente desde Google Ads.`);
      } else {
        toast.success(`${extType === 'SITELINK' ? 'Sitelink' : extType === 'CALLOUT' ? 'Callout' : 'Snippet'} creado y linkeado al ${extScope === 'ad_group' ? 'ad group' : 'campaign'}`);
      }
      if (expandedId === extAgId) await refreshDetail(extAgId);
      setExtOpen(false);
    } finally {
      setExtLoading(false);
    }
  };

  // ── Keyword Planner (Tier 3) ──────────────────────────────────────────
  const openKeywordPlanner = (agId: string) => {
    setPlannerAgId(agId);
    setPlannerOpen(true);
    setPlannerIdeas([]);
    setPlannerSeed('');
  };

  const runKeywordPlanner = async () => {
    if (!plannerAgId) return;
    const seeds = plannerSeed.split('\n').map(s => s.trim()).filter(s => s.length > 0 && s.length <= 80);
    if (seeds.length === 0) { toast.error('Pegá al menos una keyword semilla'); return; }
    setPlannerLoading(true);
    const { data, error } = await callApi('manage-google-keywords', {
      body: {
        action: 'search_keyword_ideas',
        connection_id: connectionId,
        data: { seed_keywords: seeds.slice(0, 20) },
      },
    });
    setPlannerLoading(false);
    if (error) { toast.error('Keyword Planner: ' + error); return; }
    const ideas = (data?.ideas || []).map((i: any) => ({ ...i, _selected: false, _match_type: 'BROAD' }));
    setPlannerIdeas(ideas);
    if (ideas.length === 0) toast.warning('Sin ideas retornadas — probá con otras semillas');
  };

  const applyPlannerSelected = async () => {
    if (!plannerAgId) return;
    const selected = plannerIdeas.filter(i => i._selected);
    if (selected.length === 0) { toast.error('Seleccioná al menos una'); return; }
    setPlannerAdding(true);
    let ok = 0, fail = 0;
    for (const idea of selected) {
      const { error } = await callApi('manage-google-keywords', {
        body: {
          action: 'add_keyword', connection_id: connectionId,
          data: { ad_group_id: plannerAgId, keyword_text: idea.text, match_type: idea._match_type || 'BROAD' },
        },
      });
      if (error) fail++; else ok++;
    }
    setPlannerAdding(false);
    if (ok > 0) toast.success(`${ok} keyword(s) agregada(s)${fail > 0 ? `, ${fail} fallaron` : ''}`);
    else toast.error(`Todas fallaron (${fail})`);
    if (expandedId === plannerAgId) await refreshDetail(plannerAgId);
    setPlannerOpen(false);
  };

  // ── Manual add keyword ────────────────────────────────────────────────
  const submitAddKeyword = async () => {
    if (!addKwAgId) return;
    const text = addKwText.trim();
    if (!text) { toast.error('Texto requerido'); return; }
    if (text.length > 80) { toast.error('Keyword máximo 80 chars'); return; }
    setAddKwLoading(true);
    const { error } = await callApi('manage-google-keywords', {
      body: { action: 'add_keyword', connection_id: connectionId, data: { ad_group_id: addKwAgId, keyword_text: text, match_type: addKwMatch } },
    });
    setAddKwLoading(false);
    if (error) { toast.error('Error agregando keyword: ' + error); return; }
    toast.success('Keyword agregada');
    if (expandedId === addKwAgId) await refreshDetail(addKwAgId);
    setAddKwOpen(false);
    setAddKwText(''); setAddKwAgId(null);
  };

  // ── Manual add negative keyword (XOR campaign/ad_group) ───────────────
  const submitAddNegative = async () => {
    const text = addNegText.trim();
    if (!text) { toast.error('Texto requerido'); return; }
    if (text.length > 80) { toast.error('Máximo 80 chars'); return; }
    const scopeId = addNegScope === 'campaign' ? addNegCampaignId : addNegAgId;
    if (!scopeId) { toast.error(`${addNegScope === 'campaign' ? 'Campaña' : 'Ad Group'} requerido`); return; }
    setAddNegLoading(true);
    const payload: any = { keyword_text: text, match_type: addNegMatch };
    if (addNegScope === 'campaign') payload.campaign_id = scopeId;
    else payload.ad_group_id = scopeId;
    const { error } = await callApi('manage-google-keywords', {
      body: { action: 'add_negative_keyword', connection_id: connectionId, data: payload },
    });
    setAddNegLoading(false);
    if (error) { toast.error('Error: ' + error); return; }
    toast.success(`Negative agregado a ${addNegScope === 'campaign' ? 'la campaña' : 'el ad group'}`);
    if (addNegScope === 'ad_group' && expandedId === addNegAgId) await refreshDetail(addNegAgId!);
    setAddNegOpen(false);
    setAddNegText(''); setAddNegAgId(null); setAddNegCampaignId(null);
  };

  // ── Remove keyword ────────────────────────────────────────────────────
  // Backend contracts (verified con Isidora):
  //   remove_keyword (positive):    { ad_group_id, criterion_id }
  //   remove_negative_keyword:      { resource_name, scope }
  const handleRemoveKeyword = async (agId: string, kw: Keyword) => {
    const negative = kw.negative;
    const action = negative ? 'remove_negative_keyword' : 'remove_keyword';
    const payload: any = negative
      ? { resource_name: kw.resource_name, scope: 'ad_group' }
      : { ad_group_id: agId, criterion_id: kw.criterion_id };
    const { error } = await callApi('manage-google-keywords', {
      body: { action, connection_id: connectionId, data: payload },
    });
    if (error) { toast.error('Error eliminando: ' + error); return; }
    toast.success('Keyword eliminada');
    await refreshDetail(agId);
  };

  // ── Pause/resume keyword ──────────────────────────────────────────────
  // Backend contract (verified): update_keyword espera { ad_group_id, criterion_id, status|cpc_bid }
  const togglePauseKeyword = async (agId: string, kw: Keyword) => {
    const nextStatus = kw.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    const { error } = await callApi('manage-google-keywords', {
      body: {
        action: 'update_keyword', connection_id: connectionId,
        data: { ad_group_id: agId, criterion_id: kw.criterion_id, status: nextStatus },
      },
    });
    if (error) { toast.error('Error: ' + error); return; }
    toast.success(nextStatus === 'PAUSED' ? 'Keyword pausada' : 'Keyword activada');
    await refreshDetail(agId);
  };

  // ── Create RSA ────────────────────────────────────────────────────────
  const openCreateRsa = (agId: string) => {
    setCreateRsaAgId(agId);
    setCreateRsaHeadlines(['', '', '']);
    setCreateRsaDescriptions(['', '']);
    setCreateRsaFinalUrl('');
    setCreateRsaOpen(true);
  };

  const submitCreateRsa = async () => {
    if (!createRsaAgId) return;
    const headlines = createRsaHeadlines.filter(h => h.trim().length > 0);
    const descriptions = createRsaDescriptions.filter(d => d.trim().length > 0);
    if (headlines.length < 3 || headlines.length > 15) { toast.error('3-15 headlines requeridos'); return; }
    if (descriptions.length < 2 || descriptions.length > 4) { toast.error('2-4 descriptions requeridos'); return; }
    if (!createRsaFinalUrl.trim()) { toast.error('Final URL requerido'); return; }
    setCreateRsaLoading(true);
    const { error } = await callApi('manage-google-ads-content', {
      body: {
        action: 'create_rsa', connection_id: connectionId,
        data: {
          ad_group_id: createRsaAgId,
          headlines: headlines.map(h => ({ text: h })),
          descriptions: descriptions.map(d => ({ text: d })),
          final_urls: [createRsaFinalUrl.trim()],
        },
      },
    });
    setCreateRsaLoading(false);
    if (error) { toast.error('Error: ' + error); return; }
    toast.success('RSA creado');
    if (expandedId === createRsaAgId) await refreshDetail(createRsaAgId);
    setCreateRsaOpen(false);
  };

  // ── Edit RSA (atómico replace_rsa) ────────────────────────────────────
  const openEditRsa = (agId: string, rsa: RSA) => {
    setEditRsaAgId(agId);
    setEditRsaOld(rsa);
    setEditRsaHeadlines(rsa.headlines.map(h => h.text));
    setEditRsaDescriptions(rsa.descriptions.map(d => d.text));
    setEditRsaFinalUrl(rsa.final_urls[0] || '');
    setEditRsaPath1(rsa.path1 || '');
    setEditRsaPath2(rsa.path2 || '');
    setEditRsaOpen(true);
  };

  const submitEditRsa = async () => {
    if (!editRsaAgId || !editRsaOld) return;
    const headlines = editRsaHeadlines.filter(h => h.trim().length > 0);
    const descriptions = editRsaDescriptions.filter(d => d.trim().length > 0);
    if (headlines.length < 3 || headlines.length > 15) { toast.error('3-15 headlines requeridos'); return; }
    if (descriptions.length < 2 || descriptions.length > 4) { toast.error('2-4 descriptions requeridos'); return; }
    if (!editRsaFinalUrl.trim()) { toast.error('Final URL requerido'); return; }
    setEditRsaLoading(true);
    const { error } = await callApi('manage-google-ads-content', {
      body: {
        action: 'replace_rsa', connection_id: connectionId,
        data: {
          ad_group_id: editRsaAgId,
          old_ad_resource_name: editRsaOld.resource_name,
          headlines: headlines.map(h => ({ text: h })),
          descriptions: descriptions.map(d => ({ text: d })),
          final_urls: [editRsaFinalUrl.trim()],
          path1: editRsaPath1.trim() || undefined,
          path2: editRsaPath2.trim() || undefined,
        },
      },
    });
    setEditRsaLoading(false);
    if (error) { toast.error('Error: ' + error); return; }
    toast.success('RSA actualizado (atómico)');
    if (expandedId === editRsaAgId) await refreshDetail(editRsaAgId);
    setEditRsaOpen(false);
  };

  // ── Remove RSA ────────────────────────────────────────────────────────
  const handleRemoveRsa = async (agId: string, rsa: RSA) => {
    const { error } = await callApi('manage-google-ads-content', {
      body: { action: 'remove_rsa', connection_id: connectionId, data: { ad_resource_name: rsa.resource_name } },
    });
    if (error) { toast.error('Error eliminando RSA: ' + error); return; }
    toast.success('RSA eliminado');
    await refreshDetail(agId);
  };

  // Regenerate Steve suggestion for RSA (reuses suggest_asset_content for HEADLINE/DESCRIPTION)
  const suggestRsaContent = async (fieldType: 'HEADLINE' | 'LONG_HEADLINE' | 'DESCRIPTION', count: number): Promise<string[]> => {
    const { data, error } = await callApi('manage-google-campaign', {
      body: {
        action: 'suggest_asset_content', connection_id: connectionId,
        data: { client_id: clientId, field_type: fieldType, count },
      },
    });
    if (error) { toast.error('Error: ' + error); return []; }
    return (data?.options || []).map((o: any) => o.text).filter(Boolean);
  };

  // ── Filter by campaign ────────────────────────────────────────────────
  const campaignOptions = Array.from(new Map(adGroups.map(ag => [ag.campaign_id, ag.campaign_name])).entries());
  const visibleAdGroups = filterCampaign ? adGroups.filter(ag => ag.campaign_id === filterCampaign) : adGroups;

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* QS insights banner (B3) */}
      {qsAlerts.length > 0 && (
        <Card className="border-2 border-yellow-500/40 bg-yellow-500/5">
          <div className="p-3 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Quality Score: {qsAlerts.length} keyword{qsAlerts.length !== 1 ? 's' : ''} con alertas
                </p>
                <button
                  className="text-xs underline text-yellow-700 dark:text-yellow-400"
                  onClick={() => setQsOpen(o => !o)}
                >
                  {qsOpen ? 'Ocultar' : 'Ver detalle'}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                QS &lt; 5 (crítico) o bajó ≥2 puntos en los últimos 7 días. Revisá ad relevance + landing page + expected CTR.
              </p>
              {qsOpen && (
                <div className="mt-2 max-h-[220px] overflow-y-auto space-y-1">
                  {qsAlerts.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-1.5 bg-background rounded">
                      <Badge variant="outline" className={a.current < 4 ? 'bg-red-500/10 text-red-600' : a.current < 6 ? 'bg-yellow-500/10 text-yellow-600' : 'bg-green-500/10 text-green-700'}>
                        QS {a.current}/10
                      </Badge>
                      <span className="flex-1 truncate">{a.keyword}</span>
                      {a.drop > 0 && (
                        <Badge variant="outline" className="bg-red-500/10 text-red-600">
                          ↓ {a.drop} pts
                        </Badge>
                      )}
                      {a.previous !== null && (
                        <span className="text-muted-foreground/70 text-[10px]">
                          hace 7d: {a.previous}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            {visibleAdGroups.length} Ad Group{visibleAdGroups.length !== 1 ? 's' : ''} Search
          </h3>
          <p className="text-xs text-muted-foreground">Expandí uno para ver Keywords / RSA / Extensions con Steve AI</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filterCampaign}
            onChange={e => setFilterCampaign(e.target.value)}
          >
            <option value="">Todas las campañas</option>
            {campaignOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => fetchAdGroups()} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>
      </div>

      {/* Lista Ad Groups */}
      {visibleAdGroups.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No hay Ad Groups Search. Creá una campaña Search primero.</Card>
      ) : visibleAdGroups.map(ag => {
        const expanded = expandedId === ag.id;
        const d = detail[ag.id];
        const isLoadingDetail = detailLoading[ag.id];

        return (
          <Card key={ag.id}>
            {/* Row header */}
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30"
              onClick={() => toggleExpand(ag.id)}
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{ag.name}</span>
                  <Badge variant="outline" className="text-[10px]">{ag.campaign_name}</Badge>
                  <Badge variant="outline" className={ag.status === 'ENABLED' ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}>
                    {statusLabels[ag.status] || ag.status}
                  </Badge>
                  <Badge variant="outline" className={adStrengthColors[ag.ad_strength] || adStrengthColors.UNSPECIFIED}>
                    Ad Strength: {adStrengthLabels[ag.ad_strength] || ag.ad_strength}
                  </Badge>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span>{ag.clicks.toLocaleString()} clicks</span>
                  <span>{ag.conversions.toFixed(1)} conv</span>
                  <span>CLP {ag.cost_clp.toLocaleString()}</span>
                  <span>CTR {ag.ctr.toFixed(2)}%</span>
                </div>
              </div>
            </div>

            {/* Expanded detail: 3 cards */}
            {expanded && (
              <div className="border-t p-3 bg-muted/10">
                {isLoadingDetail || !d ? (
                  <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando detalle...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

                    {/* Card 1: Keywords */}
                    <Card className="p-3 space-y-2">
                      {(() => {
                        const sc = computeScore({
                          keywords:  { current: d.counts.keywords, recommended: KEYWORDS_CONFIG.keywords.recommended, weight: KEYWORDS_CONFIG.keywords.weight, required: true, label: KEYWORDS_CONFIG.keywords.label },
                          negatives: { current: d.counts.negatives, recommended: KEYWORDS_CONFIG.negatives.recommended, weight: KEYWORDS_CONFIG.negatives.weight, label: KEYWORDS_CONFIG.negatives.label },
                        });
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Keywords</span>
                              <span className="text-xs font-semibold">{sc.score}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className={`h-full ${scoreColor(sc.score)}`} style={{ width: `${sc.score}%` }} />
                            </div>
                            {sc.missing.length > 0 && (
                              <ul className="text-[11px] space-y-0.5 text-muted-foreground">
                                {sc.missing.map(m => (
                                  <li key={m.key}>● {m.label}: {m.current}/{m.recommended}</li>
                                ))}
                              </ul>
                            )}
                            <div className="flex gap-1.5 pt-1 flex-wrap">
                              <button className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded border text-primary hover:border-primary/60" onClick={() => openKwSuggest(ag.id)}>
                                <Sparkles className="w-3 h-3" /> Steve sugiere
                              </button>
                              <button className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded border hover:border-primary/60" onClick={() => { setAddKwAgId(ag.id); setAddKwOpen(true); }}>
                                <Plus className="w-3 h-3" /> Manual
                              </button>
                              <button className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded border hover:border-primary/60" onClick={() => { setAddNegAgId(ag.id); setAddNegCampaignId(ag.campaign_id); setAddNegScope('ad_group'); setAddNegOpen(true); }}>
                                <X className="w-3 h-3" /> Negative
                              </button>
                              <button className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded border hover:border-primary/60" onClick={() => openKeywordPlanner(ag.id)} title="Buscar ideas en Google Keyword Planner">
                                <TrendingUp className="w-3 h-3" /> Planner
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Keyword list */}
                      <div className="space-y-1 max-h-[280px] overflow-y-auto pt-2 border-t">
                        {d.keywords_positive.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">Sin keywords</p>}
                        {d.keywords_positive.map(kw => (
                          <div key={kw.criterion_id} className="flex items-center gap-1.5 text-xs py-1 group">
                            <Badge variant="outline" className={`${matchTypeColors[kw.match_type] || ''} text-[9px] px-1 py-0`}>{kw.match_type}</Badge>
                            <span className="flex-1 truncate">{kw.text}</span>
                            {kw.quality_score && <Badge variant="outline" className="text-[9px]">QS {kw.quality_score}</Badge>}
                            <span className="text-muted-foreground/60 text-[10px]">{kw.clicks}c</span>
                            <button className="opacity-0 group-hover:opacity-100 text-yellow-600" onClick={() => togglePauseKeyword(ag.id, kw)}>
                              {kw.status === 'ENABLED' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            </button>
                            <button className="opacity-0 group-hover:opacity-100 text-red-500" onClick={() => handleRemoveKeyword(ag.id, kw)}>
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {d.keywords_negative.length > 0 && (
                          <div className="pt-2 border-t mt-2">
                            <p className="text-[10px] text-muted-foreground uppercase mb-1">Negatives ({d.keywords_negative.length})</p>
                            {d.keywords_negative.map(kw => (
                              <div key={kw.criterion_id} className="flex items-center gap-1.5 text-xs py-0.5 group">
                                <Badge variant="outline" className="bg-red-500/10 text-red-600 text-[9px] px-1 py-0">−{kw.match_type}</Badge>
                                <span className="flex-1 truncate">{kw.text}</span>
                                <button className="opacity-0 group-hover:opacity-100 text-red-500" onClick={() => handleRemoveKeyword(ag.id, kw)}>
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>

                    {/* Card 2: RSA */}
                    <Card className="p-3 space-y-2">
                      {(() => {
                        const firstRsa = d.rsas[0];
                        const headlineCount = firstRsa?.headlines?.length || 0;
                        const descCount = firstRsa?.descriptions?.length || 0;
                        const sc = computeScore({
                          rsas:         { current: d.counts.rsas,   recommended: RSA_CONFIG.rsas.recommended,  weight: RSA_CONFIG.rsas.weight, required: true, label: RSA_CONFIG.rsas.label },
                          headlines:    { current: headlineCount,   recommended: RSA_CONFIG.headlines.recommended, weight: RSA_CONFIG.headlines.weight, required: true, label: RSA_CONFIG.headlines.label },
                          descriptions: { current: descCount,       recommended: RSA_CONFIG.descriptions.recommended, weight: RSA_CONFIG.descriptions.weight, required: true, label: RSA_CONFIG.descriptions.label },
                        });
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium flex items-center gap-1.5"><TypeIcon className="w-3.5 h-3.5" /> RSA</span>
                              <span className="text-xs">
                                {firstRsa && <Badge variant="outline" className={`${adStrengthColors[firstRsa.ad_strength] || ''} mr-1 text-[10px]`}>{adStrengthLabels[firstRsa.ad_strength] || firstRsa.ad_strength}</Badge>}
                                <span className="font-semibold">{sc.score}%</span>
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className={`h-full ${scoreColor(sc.score)}`} style={{ width: `${sc.score}%` }} />
                            </div>
                            {sc.missing.length > 0 && (
                              <ul className="text-[11px] space-y-0.5 text-muted-foreground">
                                {sc.missing.map(m => (
                                  <li key={m.key}>● {m.label}: {m.current}/{m.recommended}</li>
                                ))}
                              </ul>
                            )}
                            {d.rsas.length === 0 && (
                              <button className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded border text-primary hover:border-primary/60" onClick={() => openCreateRsa(ag.id)}>
                                <Plus className="w-3 h-3" /> Crear RSA
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {/* RSA list */}
                      <div className="space-y-2 max-h-[280px] overflow-y-auto pt-2 border-t">
                        {d.rsas.map(rsa => (
                          <div key={rsa.resource_name} className="border rounded p-2 space-y-1 group">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Badge variant="outline" className={`${adStrengthColors[rsa.ad_strength] || ''} text-[9px] px-1 py-0`}>
                                {adStrengthLabels[rsa.ad_strength] || rsa.ad_strength}
                              </Badge>
                              <span className="truncate flex-1">{rsa.final_urls[0]}</span>
                              <button className="opacity-0 group-hover:opacity-100 text-blue-500" onClick={() => openEditRsa(ag.id, rsa)}>
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button className="opacity-0 group-hover:opacity-100 text-red-500" onClick={() => handleRemoveRsa(ag.id, rsa)}>
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="text-xs">
                              <p className="font-medium text-blue-700 dark:text-blue-400 text-[12px] leading-tight">
                                {rsa.headlines.slice(0, 3).map(h => h.text).join(' | ')}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {rsa.descriptions.slice(0, 2).map(d => d.text).join(' · ')}
                              </p>
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                {rsa.headlines.length}h · {rsa.descriptions.length}d
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* Card 3: Extensions */}
                    <Card className="p-3 space-y-2">
                      {(() => {
                        const sc = computeScore({
                          sitelinks: { current: d.counts.sitelinks, recommended: EXT_CONFIG.sitelinks.recommended, weight: EXT_CONFIG.sitelinks.weight, label: EXT_CONFIG.sitelinks.label },
                          callouts:  { current: d.counts.callouts,  recommended: EXT_CONFIG.callouts.recommended, weight: EXT_CONFIG.callouts.weight, label: EXT_CONFIG.callouts.label },
                          snippets:  { current: d.counts.snippets,  recommended: EXT_CONFIG.snippets.recommended, weight: EXT_CONFIG.snippets.weight, label: EXT_CONFIG.snippets.label },
                          calls:     { current: d.counts.calls,     recommended: EXT_CONFIG.calls.recommended,    weight: EXT_CONFIG.calls.weight, label: EXT_CONFIG.calls.label },
                          prices:    { current: d.counts.prices,    recommended: EXT_CONFIG.prices.recommended,   weight: EXT_CONFIG.prices.weight, label: EXT_CONFIG.prices.label },
                        });
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium flex items-center gap-1.5"><Puzzle className="w-3.5 h-3.5" /> Extensions</span>
                              <span className="text-xs font-semibold">{sc.score}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className={`h-full ${scoreColor(sc.score)}`} style={{ width: `${sc.score}%` }} />
                            </div>
                            {sc.missing.length > 0 && (
                              <ul className="text-[11px] space-y-0.5 text-muted-foreground">
                                {sc.missing.map(m => (
                                  <li key={m.key}>● {m.label}: {m.current}/{m.recommended}</li>
                                ))}
                              </ul>
                            )}
                            <div className="flex gap-1.5 pt-1">
                              <button
                                className="text-[11px] flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:border-primary/60"
                                onClick={() => openExtensionCreate(ag.id, ag.campaign_id)}
                              >
                                <Plus className="w-3 h-3" /> Crear extension
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Summary */}
                      <div className="pt-2 border-t space-y-1 text-[11px]">
                        <div className="flex justify-between"><span>Sitelinks</span><span>{d.counts.sitelinks}</span></div>
                        <div className="flex justify-between"><span>Callouts</span><span>{d.counts.callouts}</span></div>
                        <div className="flex justify-between"><span>Snippets</span><span>{d.counts.snippets}</span></div>
                        <div className="flex justify-between"><span>Call</span><span>{d.counts.calls}</span></div>
                        <div className="flex justify-between"><span>Price</span><span>{d.counts.prices}</span></div>
                      </div>
                    </Card>

                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {/* Dialog: Steve sugiere keywords */}
      <Dialog open={kwSuggestOpen} onOpenChange={o => { if (!o && !kwSuggestAdding) { setKwSuggestOpen(false); setKwSuggestAgId(null); setKwSuggestOptions([]); setKwSuggestNegatives([]); } }}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Steve sugiere keywords</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">¿Algo específico a enfatizar? (opcional)</Label>
              <Textarea value={kwUserIntent} onChange={e => setKwUserIntent(e.target.value)} rows={2} maxLength={300} placeholder="Ej: foco en Santiago, tono premium, priorizar mobile..." />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{kwUserIntent.length}/300</p>
                <Button size="sm" variant="outline" onClick={regenerateKwSuggest} disabled={kwSuggestLoading}>
                  {kwSuggestLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  Regenerar
                </Button>
              </div>
            </div>

            {kwSuggestLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Steve pensando...</div>
            ) : (
              <>
                <div>
                  <Label className="text-xs mb-1 block">Keywords positivas ({kwSuggestOptions.filter(o => o._selected).length}/{kwSuggestOptions.length} seleccionadas)</Label>
                  <div className="space-y-1 max-h-[220px] overflow-y-auto">
                    {kwSuggestOptions.map((opt, idx) => (
                      <label key={idx} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/30 cursor-pointer">
                        <input type="checkbox" checked={!!opt._selected} onChange={e => setKwSuggestOptions(prev => prev.map((o, i) => i === idx ? { ...o, _selected: e.target.checked } : o))} />
                        <Badge variant="outline" className={`${matchTypeColors[opt.match_type] || ''} text-[9px]`}>{opt.match_type}</Badge>
                        <span className="flex-1">{opt.text}</span>
                        {opt.intent && <span className="text-[10px] text-muted-foreground">{opt.intent}</span>}
                      </label>
                    ))}
                  </div>
                </div>
                {kwSuggestNegatives.length > 0 && (
                  <div>
                    <Label className="text-xs mb-1 block">Negative keywords sugeridas ({kwSuggestNegatives.filter(n => n._selected).length}/{kwSuggestNegatives.length})</Label>
                    <div className="space-y-1 max-h-[140px] overflow-y-auto">
                      {kwSuggestNegatives.map((neg, idx) => (
                        <label key={idx} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/30 cursor-pointer">
                          <input type="checkbox" checked={!!neg._selected} onChange={e => setKwSuggestNegatives(prev => prev.map((n, i) => i === idx ? { ...n, _selected: e.target.checked } : n))} />
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 text-[9px]">−EXACT</Badge>
                          <span className="flex-1">{neg.text}</span>
                          {neg.reason && <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{neg.reason}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKwSuggestOpen(false)} disabled={kwSuggestAdding}>Cancelar</Button>
            <Button onClick={applyKwSuggest} disabled={kwSuggestAdding || kwSuggestLoading}>
              {kwSuggestAdding && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Agregar seleccionadas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add manual keyword */}
      <Dialog open={addKwOpen} onOpenChange={o => { if (!o && !addKwLoading) { setAddKwOpen(false); setAddKwText(''); setAddKwAgId(null); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Agregar Keyword</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Texto</Label>
              <Input value={addKwText} onChange={e => setAddKwText(e.target.value)} maxLength={80} placeholder="ej: alimento natural perros" autoFocus />
              <p className="text-xs text-muted-foreground">{addKwText.length}/80</p>
            </div>
            <div>
              <Label className="text-xs">Match type</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={addKwMatch} onChange={e => setAddKwMatch(e.target.value)}>
                <option value="BROAD">Broad (amplia)</option>
                <option value="PHRASE">Phrase (frase)</option>
                <option value="EXACT">Exact (exacta)</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddKwOpen(false)} disabled={addKwLoading}>Cancelar</Button>
            <Button onClick={submitAddKeyword} disabled={addKwLoading || !addKwText.trim()}>
              {addKwLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add negative keyword (XOR scope) */}
      <Dialog open={addNegOpen} onOpenChange={o => { if (!o && !addNegLoading) { setAddNegOpen(false); setAddNegText(''); } }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>Agregar Negative Keyword</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Scope</Label>
              <div className="flex gap-2">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="radio" checked={addNegScope === 'ad_group'} onChange={() => setAddNegScope('ad_group')} />
                  Solo este Ad Group
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="radio" checked={addNegScope === 'campaign'} onChange={() => setAddNegScope('campaign')} />
                  Toda la campaña
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">{addNegScope === 'campaign' ? 'Afecta a todos los Ad Groups de la campaña' : 'Solo aplica a este Ad Group'}</p>
            </div>
            <div>
              <Label className="text-xs">Texto</Label>
              <Input value={addNegText} onChange={e => setAddNegText(e.target.value)} maxLength={80} placeholder="ej: gratis" autoFocus />
              <p className="text-xs text-muted-foreground">{addNegText.length}/80</p>
            </div>
            <div>
              <Label className="text-xs">Match type</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={addNegMatch} onChange={e => setAddNegMatch(e.target.value)}>
                <option value="EXACT">Exact (recomendado)</option>
                <option value="PHRASE">Phrase</option>
                <option value="BROAD">Broad</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddNegOpen(false)} disabled={addNegLoading}>Cancelar</Button>
            <Button onClick={submitAddNegative} disabled={addNegLoading || !addNegText.trim()}>
              {addNegLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Create RSA */}
      <Dialog open={createRsaOpen} onOpenChange={o => {
        if (!o && !createRsaLoading) {
          setCreateRsaOpen(false);
          setCreateRsaAgId(null);
          setCreateRsaHeadlines(['', '', '']);
          setCreateRsaDescriptions(['', '']);
          setCreateRsaFinalUrl('');
        }
      }}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Crear RSA</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Final URL *</Label>
              <Input value={createRsaFinalUrl} onChange={e => setCreateRsaFinalUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Headlines (3-15, max 30 chars) *</Label>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={async () => {
                  const opts = await suggestRsaContent('HEADLINE', 10);
                  if (opts.length > 0) setCreateRsaHeadlines(opts.slice(0, 15));
                }}>
                  <Sparkles className="w-3 h-3 mr-1" /> Steve genera 10
                </Button>
              </div>
              {createRsaHeadlines.map((h, idx) => (
                <div key={idx} className="flex gap-1 mt-1">
                  <Input value={h} onChange={e => setCreateRsaHeadlines(prev => prev.map((v, i) => i === idx ? e.target.value : v))} maxLength={30} placeholder={`Headline ${idx + 1}`} />
                  <span className="text-[10px] text-muted-foreground w-8 pt-2">{h.length}/30</span>
                  <Button size="sm" variant="ghost" className="h-10 px-1" onClick={() => setCreateRsaHeadlines(prev => prev.filter((_, i) => i !== idx))}><X className="w-3 h-3" /></Button>
                </div>
              ))}
              {createRsaHeadlines.length < 15 && (
                <Button size="sm" variant="ghost" className="text-xs mt-1" onClick={() => setCreateRsaHeadlines(prev => [...prev, ''])}>
                  <Plus className="w-3 h-3 mr-1" /> Agregar headline
                </Button>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Descriptions (2-4, max 90 chars) *</Label>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={async () => {
                  const opts = await suggestRsaContent('DESCRIPTION', 4);
                  if (opts.length > 0) setCreateRsaDescriptions(opts.slice(0, 4));
                }}>
                  <Sparkles className="w-3 h-3 mr-1" /> Steve genera 4
                </Button>
              </div>
              {createRsaDescriptions.map((d, idx) => (
                <div key={idx} className="flex gap-1 mt-1">
                  <Textarea rows={2} value={d} onChange={e => setCreateRsaDescriptions(prev => prev.map((v, i) => i === idx ? e.target.value : v))} maxLength={90} placeholder={`Description ${idx + 1}`} />
                  <span className="text-[10px] text-muted-foreground w-8 pt-2">{d.length}/90</span>
                  <Button size="sm" variant="ghost" className="h-auto px-1" onClick={() => setCreateRsaDescriptions(prev => prev.filter((_, i) => i !== idx))}><X className="w-3 h-3" /></Button>
                </div>
              ))}
              {createRsaDescriptions.length < 4 && (
                <Button size="sm" variant="ghost" className="text-xs mt-1" onClick={() => setCreateRsaDescriptions(prev => [...prev, ''])}>
                  <Plus className="w-3 h-3 mr-1" /> Agregar description
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRsaOpen(false)} disabled={createRsaLoading}>Cancelar</Button>
            <Button onClick={submitCreateRsa} disabled={createRsaLoading}>
              {createRsaLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Crear RSA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Crear Extension (sitelink / callout / snippet) */}
      <Dialog open={extOpen} onOpenChange={o => {
        if (!o && !extLoading) {
          setExtOpen(false);
          setExtAgId(null);
          setExtCampaignId(null);
        }
      }}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Crear Extension</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {/* Tabs tipo */}
            <div className="flex gap-1 border-b">
              {(['SITELINK', 'CALLOUT', 'SNIPPET'] as const).map(t => (
                <button
                  key={t}
                  className={`px-3 py-1.5 text-xs border-b-2 ${extType === t ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground'}`}
                  onClick={() => setExtType(t)}
                >
                  {t === 'SITELINK' ? 'Sitelink' : t === 'CALLOUT' ? 'Callout' : 'Snippet'}
                </button>
              ))}
            </div>

            {/* Scope selector */}
            <div className="space-y-1">
              <Label className="text-xs">Scope (a qué aplica)</Label>
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={extScope === 'ad_group'} onChange={() => setExtScope('ad_group')} />
                  Solo este Ad Group
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={extScope === 'campaign'} onChange={() => setExtScope('campaign')} />
                  Toda la campaña
                </label>
              </div>
            </div>

            {/* Fields por tipo */}
            {extType === 'SITELINK' && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Texto visible (max 25) *</Label>
                  <Input value={extSitelinkText} onChange={e => setExtSitelinkText(e.target.value)} maxLength={25} placeholder="Ej: Envío Gratis" />
                  <p className="text-[10px] text-muted-foreground">{extSitelinkText.length}/25</p>
                </div>
                <div>
                  <Label className="text-xs">Final URL *</Label>
                  <Input value={extSitelinkUrl} onChange={e => setExtSitelinkUrl(e.target.value)} placeholder="https://..." type="url" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Description 1 (max 35)</Label>
                    <Input value={extSitelinkDesc1} onChange={e => setExtSitelinkDesc1(e.target.value)} maxLength={35} />
                  </div>
                  <div>
                    <Label className="text-xs">Description 2 (max 35)</Label>
                    <Input value={extSitelinkDesc2} onChange={e => setExtSitelinkDesc2(e.target.value)} maxLength={35} />
                  </div>
                </div>
              </div>
            )}

            {extType === 'CALLOUT' && (
              <div>
                <Label className="text-xs">Callout text (max 25) *</Label>
                <Input value={extCalloutText} onChange={e => setExtCalloutText(e.target.value)} maxLength={25} placeholder="Ej: Atención 24/7" />
                <p className="text-[10px] text-muted-foreground">{extCalloutText.length}/25</p>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Tip: callouts son frases cortas de valor (envío gratis, garantía, soporte). Agregá varias para armar un set.
                </p>
              </div>
            )}

            {extType === 'SNIPPET' && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Header *</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={extSnippetHeader} onChange={e => setExtSnippetHeader(e.target.value)}>
                    {['Brands', 'Courses', 'Degree programs', 'Destinations', 'Featured hotels', 'Insurance coverage', 'Models', 'Neighborhoods', 'Service catalog', 'Shows', 'Styles', 'Types'].map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">Google requiere uno de esos headers fijos.</p>
                </div>
                <div>
                  <Label className="text-xs">Values (mín 3, max 25 chars cada uno) *</Label>
                  {extSnippetValues.map((v, idx) => (
                    <div key={idx} className="flex gap-1 mt-1">
                      <Input value={v} onChange={e => setExtSnippetValues(prev => prev.map((x, i) => i === idx ? e.target.value : x))} maxLength={25} placeholder={`Value ${idx + 1}`} />
                      <span className="text-[10px] text-muted-foreground w-10 pt-2.5">{v.length}/25</span>
                      <Button variant="ghost" size="sm" className="h-10 px-1" onClick={() => setExtSnippetValues(prev => prev.filter((_, i) => i !== idx))}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  {extSnippetValues.length < 10 && (
                    <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={() => setExtSnippetValues(prev => [...prev, ''])}>
                      <Plus className="w-3 h-3 mr-1" /> Agregar value
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtOpen(false)} disabled={extLoading}>Cancelar</Button>
            <Button onClick={submitExtension} disabled={extLoading}>
              {extLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Keyword Planner (Tier 3) */}
      <Dialog open={plannerOpen} onOpenChange={o => { if (!o && !plannerAdding) { setPlannerOpen(false); setPlannerAgId(null); setPlannerIdeas([]); setPlannerSeed(''); } }}>
        <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Keyword Planner</DialogTitle>
            <p className="text-[11px] text-muted-foreground">Google sugiere keywords relacionadas con volumen, competencia y CPC estimado.</p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Keywords semilla (una por línea, max 20)</Label>
              <Textarea
                value={plannerSeed}
                onChange={e => setPlannerSeed(e.target.value)}
                rows={3}
                placeholder={`alimento perros\ncomida natural para perros\nperros santiago`}
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">Por defecto busca en español, Chile. El backend ajusta según configuración.</p>
                <Button size="sm" variant="outline" onClick={runKeywordPlanner} disabled={plannerLoading}>
                  {plannerLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  Buscar ideas
                </Button>
              </div>
            </div>

            {plannerLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Google está procesando...
              </div>
            ) : plannerIdeas.length > 0 ? (
              <div>
                {/* B4: Filters client-side */}
                <div className="flex gap-2 flex-wrap mb-2 p-2 bg-muted/20 rounded">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[11px]">Volumen mínimo</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 w-24 text-xs"
                      value={plannerMinVolume}
                      onChange={e => setPlannerMinVolume(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[11px]">Competencia máx</Label>
                    <select
                      className="h-7 rounded border border-input bg-background px-2 text-xs"
                      value={plannerMaxCompetition}
                      onChange={e => setPlannerMaxCompetition(e.target.value as any)}
                    >
                      <option value="LOW">Solo LOW</option>
                      <option value="MEDIUM">LOW + MEDIUM</option>
                      <option value="HIGH">Todas</option>
                    </select>
                  </div>
                </div>

                {(() => {
                  const competitionRank: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, UNSPECIFIED: 4 };
                  const maxRank = competitionRank[plannerMaxCompetition];
                  const visibleIdeas = plannerIdeas.filter(i =>
                    i.avg_monthly_searches >= plannerMinVolume &&
                    (competitionRank[i.competition] ?? 4) <= maxRank
                  );
                  return (
                <>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs">
                    {plannerIdeas.filter(i => i._selected).length} / {visibleIdeas.length} seleccionadas
                    {visibleIdeas.length < plannerIdeas.length && <span className="text-muted-foreground/70 ml-1">({plannerIdeas.length - visibleIdeas.length} filtradas)</span>}
                  </Label>
                  <button className="text-[11px] underline" onClick={() => {
                    if (visibleIdeas.length === 0) return;
                    const allSelected = visibleIdeas.every(v => v._selected);
                    setPlannerIdeas(prev => prev.map(i => visibleIdeas.includes(i) ? { ...i, _selected: !allSelected } : i));
                  }}>
                    Seleccionar visibles
                  </button>
                </div>
                <div className="border rounded max-h-[380px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>
                        <th className="p-1.5 w-8"></th>
                        <th className="p-1.5 text-left">Keyword</th>
                        <th className="p-1.5 text-right">Volumen/mes</th>
                        <th className="p-1.5 text-center">Competencia</th>
                        <th className="p-1.5 text-right">CPC (low-high)</th>
                        <th className="p-1.5 text-center">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleIdeas.map((idea) => {
                        const idx = plannerIdeas.indexOf(idea);
                        return (
                        <tr key={idx} className="border-t hover:bg-muted/20">
                          <td className="p-1.5">
                            <input type="checkbox" checked={!!idea._selected} onChange={e => setPlannerIdeas(prev => prev.map((i, j) => j === idx ? { ...i, _selected: e.target.checked } : i))} />
                          </td>
                          <td className="p-1.5">{idea.text}</td>
                          <td className="p-1.5 text-right">{idea.avg_monthly_searches.toLocaleString()}</td>
                          <td className="p-1.5 text-center">
                            <Badge variant="outline" className={`text-[9px] ${idea.competition === 'LOW' ? 'bg-green-500/10 text-green-700' : idea.competition === 'HIGH' ? 'bg-red-500/10 text-red-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                              {idea.competition}
                            </Badge>
                          </td>
                          <td className="p-1.5 text-right text-muted-foreground">
                            {(idea.cpc_low_micros / 1_000_000).toFixed(2)} - {(idea.cpc_high_micros / 1_000_000).toFixed(2)}
                          </td>
                          <td className="p-1.5 text-center">
                            <select className="text-[10px] bg-background border rounded px-1 py-0.5" value={idea._match_type || 'BROAD'} onChange={e => setPlannerIdeas(prev => prev.map((i, j) => j === idx ? { ...i, _match_type: e.target.value } : i))}>
                              <option value="BROAD">BROAD</option>
                              <option value="PHRASE">PHRASE</option>
                              <option value="EXACT">EXACT</option>
                            </select>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
                  );
                })()}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">Pegá keywords semilla y click "Buscar ideas"</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlannerOpen(false)} disabled={plannerAdding}>Cancelar</Button>
            <Button onClick={applyPlannerSelected} disabled={plannerAdding || plannerLoading || plannerIdeas.filter(i => i._selected).length === 0}>
              {plannerAdding && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Agregar seleccionadas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit RSA (atómico replace_rsa) */}
      <Dialog open={editRsaOpen} onOpenChange={o => {
        if (!o && !editRsaLoading) {
          setEditRsaOpen(false);
          setEditRsaAgId(null);
          setEditRsaOld(null);
          setEditRsaHeadlines([]);
          setEditRsaDescriptions([]);
          setEditRsaFinalUrl('');
          setEditRsaPath1('');
          setEditRsaPath2('');
        }
      }}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar RSA</DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              <AlertCircle className="w-3 h-3 inline" /> Google no permite modificar RSA. Steve crea uno nuevo y elimina el viejo en 1 mutate atómico.
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Final URL *</Label>
              <Input value={editRsaFinalUrl} onChange={e => setEditRsaFinalUrl(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Path 1</Label>
                <Input value={editRsaPath1} onChange={e => setEditRsaPath1(e.target.value.slice(0, 15))} maxLength={15} />
              </div>
              <div>
                <Label className="text-xs">Path 2</Label>
                <Input value={editRsaPath2} onChange={e => setEditRsaPath2(e.target.value.slice(0, 15))} maxLength={15} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Headlines ({editRsaHeadlines.length}/15)</Label>
              {editRsaHeadlines.map((h, idx) => (
                <div key={idx} className="flex gap-1 mt-1">
                  <Input value={h} onChange={e => setEditRsaHeadlines(prev => prev.map((v, i) => i === idx ? e.target.value : v))} maxLength={30} />
                  <span className="text-[10px] text-muted-foreground w-8 pt-2">{h.length}/30</span>
                  <Button size="sm" variant="ghost" className="h-10 px-1" onClick={() => setEditRsaHeadlines(prev => prev.filter((_, i) => i !== idx))}><X className="w-3 h-3" /></Button>
                </div>
              ))}
              {editRsaHeadlines.length < 15 && (
                <Button size="sm" variant="ghost" className="text-xs mt-1" onClick={() => setEditRsaHeadlines(prev => [...prev, ''])}>
                  <Plus className="w-3 h-3 mr-1" /> Agregar
                </Button>
              )}
            </div>
            <div>
              <Label className="text-xs">Descriptions ({editRsaDescriptions.length}/4)</Label>
              {editRsaDescriptions.map((d, idx) => (
                <div key={idx} className="flex gap-1 mt-1">
                  <Textarea rows={2} value={d} onChange={e => setEditRsaDescriptions(prev => prev.map((v, i) => i === idx ? e.target.value : v))} maxLength={90} />
                  <span className="text-[10px] text-muted-foreground w-8 pt-2">{d.length}/90</span>
                  <Button size="sm" variant="ghost" className="h-auto px-1" onClick={() => setEditRsaDescriptions(prev => prev.filter((_, i) => i !== idx))}><X className="w-3 h-3" /></Button>
                </div>
              ))}
              {editRsaDescriptions.length < 4 && (
                <Button size="sm" variant="ghost" className="text-xs mt-1" onClick={() => setEditRsaDescriptions(prev => [...prev, ''])}>
                  <Plus className="w-3 h-3 mr-1" /> Agregar
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRsaOpen(false)} disabled={editRsaLoading}>Cancelar</Button>
            <Button onClick={submitEditRsa} disabled={editRsaLoading}>
              {editRsaLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
