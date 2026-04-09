import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, ArrowLeft, RefreshCw, Brain, Wifi, WifiOff, Clock,
  MessageSquare, ChevronDown, ChevronUp, Shield, BarChart3, Zap,
  Database, Cloud, Monitor, Mail, ShoppingBag, Image, Phone, Search,
  AlertTriangle, CheckCircle2, FileText, Cog, ArrowRight, Layers,
  Timer, GitBranch, Globe
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

/* ── Types ────────────────────────────────────────────── */

interface AgentSession {
  id: string;
  agent_code: string;
  agent_name: string;
  squad: string;
  module: string;
  personality_md: string | null;
  status_md: string | null;
  memory_md: string | null;
  last_challenge: string | null;
  tasks_pending: any;
  tasks_completed: any;
  session_count: number;
  last_session_at: string | null;
  updated_at: string;
}

/* ── Agent metadata (static, for the org chart) ───────── */

interface AgentInfo {
  code: string;
  name: string;
  squad: 'canales' | 'producto' | 'infra' | 'qa';
  module: string;
  whatSimple: string;
  ifNotExist: string;
  icon: typeof Brain;
  challenge: string;
  contextFile: string;
  tables: number;
  crons: number;
}

const AGENTS: AgentInfo[] = [
  {
    code: 'w2', name: 'Felipe', squad: 'canales', module: 'Meta Ads + IG',
    icon: BarChart3, tables: 8, crons: 3,
    contextFile: 'agents/contexts/felipe-w2.md',
    whatSimple: 'Mantiene la conexión con Meta para que los clientes creen campañas y vean métricas desde Steve',
    ifNotExist: 'Los clientes no podrían crear ni monitorear campañas de Meta/IG desde la plataforma',
    challenge: 'Solo 3 de 127 clientes tienen Meta conectado. El 97% tiene un módulo de Meta vacío.',
  },
  {
    code: 'w3', name: 'Andrés', squad: 'canales', module: 'Google Ads',
    icon: Search, tables: 2, crons: 0,
    contextFile: 'agents/contexts/andres-w3.md',
    whatSimple: 'Mantiene la integración con Google Ads para que los clientes vean sus métricas de Google en Steve',
    ifNotExist: 'Google Ads 100% desconectado — faltan 3 credenciales en Cloud Run',
    challenge: 'Google Ads está completamente desconectado. Los clientes que usan Google no ven NADA de su inversión.',
  },
  {
    code: 'w0', name: 'Rodrigo', squad: 'canales', module: 'Klaviyo',
    icon: Mail, tables: 5, crons: 0,
    contextFile: 'agents/contexts/rodrigo-w0.md',
    whatSimple: 'Mantiene el sync con Klaviyo para que los clientes gestionen flows de email desde Steve',
    ifNotExist: 'El módulo de email marketing vía Klaviyo dejaría de funcionar',
    challenge: 'email_send_queue = 0. Tenemos 7 edge functions de Klaviyo pero no enviamos nada.',
  },
  {
    code: 'w1', name: 'Valentina', squad: 'canales', module: 'Steve Mail',
    icon: Mail, tables: 15, crons: 2,
    contextFile: 'agents/contexts/valentina-w1.md',
    whatSimple: 'Mantiene el editor de emails propio (GrapeJS), templates y pipeline de envío directo',
    ifNotExist: 'Los clientes no podrían crear ni enviar emails directamente desde Steve',
    challenge: 'El editor lleva semanas sin que nadie lo toque. Sin editor no hay emails.',
  },
  {
    code: 'w7', name: 'Tomás', squad: 'producto', module: 'Steve AI & Brain',
    icon: Brain, tables: 19, crons: 11,
    contextFile: 'agents/contexts/tomas-w7.md',
    whatSimple: 'Mantiene el cerebro: knowledge base, swarm research, content hunter, agent loop',
    ifNotExist: 'Steve sería un dashboard tonto — sin inteligencia propia',
    challenge: 'El swarm tiene 16 runs exitosos de 360 posibles. El Brain opera al 5% de capacidad.',
  },
  {
    code: 'w17', name: 'Ignacio', squad: 'producto', module: 'Métricas & Reportes',
    icon: BarChart3, tables: 5, crons: 6,
    contextFile: 'agents/contexts/ignacio-w17.md',
    whatSimple: 'Mantiene dashboards, reportes semanales, anomalías y atribución de revenue',
    ifNotExist: 'Los clientes no tendrían visibilidad — irían a cada plataforma por separado',
    challenge: 'El reporte semanal se genera pero nadie lo lee. Datos sin acción = tokens desperdiciados.',
  },
  {
    code: 'w19', name: 'Paula', squad: 'producto', module: 'WA, CRM & Ventas',
    icon: Phone, tables: 14, crons: 8,
    contextFile: 'agents/contexts/paula-w19.md',
    whatSimple: 'Mantiene WhatsApp Steve, seguimiento de prospectos y carritos abandonados',
    ifNotExist: 'Los clientes no podrían usar Steve como canal de ventas vía WhatsApp',
    challenge: 'wa-action-processor corre 1440 veces/día. ¿Cuántas acciones procesó hoy?',
  },
  {
    code: 'w18', name: 'Valentín', squad: 'producto', module: 'Creativos & Assets',
    icon: Image, tables: 3, crons: 3,
    contextFile: 'agents/contexts/valentin-w18.md',
    whatSimple: 'Mantiene generación de imágenes AI, fatiga creativa y biblioteca de assets',
    ifNotExist: 'Los clientes tendrían que crear todos sus creativos fuera de Steve',
    challenge: 'El fatigue detector corre diario. ¿Cuántas alertas generó este mes?',
  },
  {
    code: 'w20', name: 'Martín', squad: 'producto', module: 'Landing & Conversión',
    icon: Globe, tables: 0, crons: 0,
    contextFile: 'agents/contexts/martin-w20.md',
    whatSimple: 'Mantiene las landing pages públicas, CTAs, audit-store y el flujo de conversión de visitante a lead',
    ifNotExist: 'La primera impresión de Steve moriría — visitantes llegarían y se irían sin entender qué es',
    challenge: 'audit-store funciona perfecto pero no tiene UI. Es un Ferrari en el garage.',
  },
  {
    code: 'w8', name: 'Diego', squad: 'infra', module: 'Base de Datos',
    icon: Database, tables: 8, crons: 0,
    contextFile: 'agents/contexts/diego-w8.md',
    whatSimple: 'Mantiene 97 tablas, 120 RLS policies y la integridad de los datos de 127 clientes',
    ifNotExist: 'Los datos podrían corromperse, perderse o quedar expuestos',
    challenge: 'steve_sources = 0, swarm_sources = 0. Las tablas del Brain están vacías.',
  },
  {
    code: 'w5', name: 'Sebastián', squad: 'infra', module: 'Cloud & Crons',
    icon: Cloud, tables: 6, crons: 44,
    contextFile: 'agents/contexts/sebastian-w5.md',
    whatSimple: 'Mantiene 44 crons, 65 edge functions, Cloud Run y 20 env vars',
    ifNotExist: 'La plataforma entera se caería y nadie se enteraría',
    challenge: 'Health-check cubre 10 de 69 endpoints. Eso es 14% de cobertura.',
  },
  {
    code: 'w4', name: 'Camila', squad: 'infra', module: 'Frontend & Portal',
    icon: Monitor, tables: 1, crons: 0,
    contextFile: 'agents/contexts/camila-w4.md',
    whatSimple: 'Mantiene 130+ componentes React, portal del cliente, onboarding y dashboard',
    ifNotExist: 'Los clientes no tendrían interfaz para usar Steve',
    challenge: '130 componentes y cero design system. Cada página se ve diferente.',
  },
  {
    code: 'w13', name: 'Matías', squad: 'infra', module: 'Shopify',
    icon: ShoppingBag, tables: 3, crons: 0,
    contextFile: 'agents/contexts/matias-w13.md',
    whatSimple: 'Mantiene sync de productos, orders y webhooks de las tiendas de los clientes',
    ifNotExist: 'Anuncios mostrarían productos agotados, no sabríamos cuánto venden',
    challenge: 'Shopify App desconectada. Faltan 3 credenciales. La mitad del equipo trabaja ciego.',
  },
  {
    code: 'w6', name: 'Isidora', squad: 'qa', module: 'CRITERIO + Code Review',
    icon: Shield, tables: 2, crons: 3,
    contextFile: 'agents/contexts/isidora-w6.md',
    whatSimple: 'Mantiene 493 reglas de calidad + reviewer obligatoria de lógica y calidad de código',
    ifNotExist: 'Steve aprobaría contenido malo — ads con errores, copies que no convierten',
    challenge: '493 reglas — ¿cuántas se crearon automáticamente y nunca se revisaron?',
  },
  {
    code: 'w12', name: 'Javiera', squad: 'qa', module: 'El Chino (QA) + Code Review',
    icon: AlertTriangle, tables: 3, crons: 4,
    contextFile: 'agents/contexts/javiera-w12.md',
    whatSimple: 'Audita todo: 800 checks diarios + reviewer obligatoria de integridad y seguridad',
    ifNotExist: 'Errores silenciosos se acumularían — nadie verificaría que el sistema funciona',
    challenge: 'qa_log tiene 550+ registros. ¿Cuántos revisaste? Apuesto que cero.',
  },
];

const SQUAD_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  canales:  { label: 'Canales',  color: 'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/30' },
  producto: { label: 'Producto', color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/30' },
  infra:    { label: 'Infra',    color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' },
  qa:       { label: 'QA',       color: 'text-pink-400',   bg: 'bg-pink-400/10',   border: 'border-pink-400/30' },
};

/* ── Helpers ──────────────────────────────────────────── */

function timeAgo(iso: string | null): string {
  if (!iso) return 'Nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function simpleMd(md: string | null): string[] {
  if (!md) return [];
  return md.split('\n').filter(l => l.trim().length > 0);
}

/* ── Component ────────────────────────────────────────── */

export default function AdminOrganigrama() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [mdTab, setMdTab] = useState<'status' | 'personality' | 'context' | 'memory'>('status');

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    if (!roleLoading && !authLoading && !isSuperAdmin) navigate('/portal');
  }, [authLoading, roleLoading, user, isSuperAdmin]);

  useEffect(() => {
    if (user && isSuperAdmin) fetchSessions();
  }, [user, isSuperAdmin]);

  async function fetchSessions() {
    setLoading(true);
    const { data } = await supabase
      .from('agent_sessions' as any)
      .select('*')
      .order('agent_code');
    setSessions((data || []) as unknown as AgentSession[]);
    setLoading(false);
  }

  function getSession(code: string): AgentSession | undefined {
    return sessions.find(s => s.agent_code === code);
  }

  function hasActivity(s: AgentSession | undefined): boolean {
    if (!s) return false;
    return !!(s.status_md || s.memory_md || s.session_count > 0);
  }

  if (authLoading || roleLoading) {
    return <div className="min-h-screen flex items-center justify-center"><RefreshCw className="animate-spin" /></div>;
  }

  const squads = ['canales', 'producto', 'infra', 'qa'] as const;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/cerebro')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Users className="h-6 w-6 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold">Organigrama del Equipo</h1>
          <p className="text-sm text-muted-foreground">14 agentes que mantienen la plataforma Steve</p>
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="organigrama" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="organigrama">Organigrama</TabsTrigger>
          <TabsTrigger value="agentes">Agentes en Vivo</TabsTrigger>
        </TabsList>

        {/* ═══════ TAB 1: ORGANIGRAMA ═══════ */}
        <TabsContent value="organigrama" className="space-y-6">

          {/* Platform banner */}
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="pt-6 text-center">
              <p className="text-lg font-semibold text-orange-400 mb-2">Steve es una plataforma SaaS</p>
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                Tus <span className="font-bold text-foreground">127 clientes</span> usan Steve para manejar sus campañas.
                Estos 14 agentes <span className="font-bold text-foreground">no hacen marketing</span> — mantienen los
                <span className="font-bold text-foreground"> módulos de la plataforma</span> para que cada cliente opere sin problemas.
              </p>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { n: '14', l: 'Agentes' },
              { n: '127', l: 'Clientes' },
              { n: '130+', l: 'Componentes' },
              { n: '170+', l: 'Rutas API' },
              { n: '45', l: 'Crons' },
              { n: '69', l: 'Edge Fns' },
            ].map(k => (
              <Card key={k.l} className="text-center">
                <CardContent className="pt-4 pb-3">
                  <div className="text-2xl font-extrabold text-orange-500">{k.n}</div>
                  <div className="text-xs text-muted-foreground">{k.l}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Org by squad */}
          {squads.map(sq => {
            const cfg = SQUAD_CONFIG[sq];
            const agents = AGENTS.filter(a => a.squad === sq);
            return (
              <div key={sq}>
                <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${cfg.color}`}>
                  Squad {cfg.label}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {agents.map(a => {
                    const Icon = a.icon;
                    const session = getSession(a.code);
                    const active = hasActivity(session);
                    return (
                      <Card key={a.code} className={`${cfg.border} border`}>
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${cfg.bg}`}>
                              <Icon className={`h-5 w-5 ${cfg.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold">{a.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">{a.code.toUpperCase()}</span>
                                {active ? (
                                  <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-[10px]">
                                    <Wifi className="h-3 w-3 mr-1" /> Activo
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                    <WifiOff className="h-3 w-3 mr-1" /> Sin sesión
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-xs font-medium text-muted-foreground">{a.module}</p>
                                <span className="text-[10px] text-muted-foreground/60">
                                  {a.tables}T {a.crons > 0 ? `· ${a.crons}C` : ''}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">{a.whatSimple}</p>
                              <div className="mt-2 text-xs border-l-2 border-orange-500/50 pl-2 italic text-muted-foreground">
                                "{a.challenge}"
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Activation Protocol — 4 layers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-orange-500" />
                Protocolo de Activación (4 Capas)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground mb-3">
                Cuando se activa un agente, se leen 4 capas en orden. Cada capa aporta un tipo de contexto diferente.
              </p>
              {[
                { n: 1, icon: '1.', label: 'Personality', file: 'agents/personalities/', desc: 'QUIÉN eres — personalidad, 5 misiones, mandato de desafío', color: 'text-purple-400', note: 'Nunca cambia' },
                { n: 2, icon: '2.', label: 'Context', file: 'agents/contexts/', desc: 'CON QUÉ trabajas — tablas, crons, archivos, dependencias', color: 'text-blue-400', note: 'Referencia estática' },
                { n: 3, icon: '3.', label: 'State', file: 'agents/state/', desc: 'DÓNDE quedaste — tareas actuales, progreso, blockers', color: 'text-amber-400', note: 'Cambia cada sesión' },
                { n: 4, icon: '4.', label: 'Memory', file: 'agents/memory/', desc: 'QUÉ aprendiste — decisiones, descubrimientos, desacuerdos', color: 'text-emerald-400', note: 'Crece siempre' },
              ].map(layer => (
                <div key={layer.n} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <span className={`text-lg font-extrabold w-6 text-center ${layer.color}`}>{layer.n}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{layer.label}</span>
                      <code className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{layer.file}</code>
                      <Badge variant="outline" className="text-[9px]">{layer.note}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{layer.desc}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <span className="text-lg font-extrabold w-6 text-center text-orange-400">5</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Unassigned Check</span>
                    <code className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">agents/state/_unassigned.md</code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Revisa si hay tablas o crons nuevos sin dueño asignado</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Automatizaciones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cog className="h-4 w-4 text-blue-400" />
                Automatizaciones del Sistema de Agentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                {
                  name: 'Context Validator',
                  schedule: 'Cada 12h (6am/6pm UTC)',
                  cron: 'context-validator-12h',
                  desc: 'Compara tablas en Supabase y crons en Cloud Scheduler contra los context files. Items nuevos sin dueño van a _unassigned.md. Crea task si hay discrepancias.',
                  color: 'text-blue-400',
                },
                {
                  name: 'SYNC Agresivo',
                  schedule: 'Cada interacción de agente',
                  cron: 'via curl PATCH',
                  desc: 'Cada agente guarda su estado en agent_sessions después de cada tarea, descubrimiento o challenge. Se lee aquí en "Agentes en Vivo".',
                  color: 'text-emerald-400',
                },
                {
                  name: 'Cross-Review Obligatorio',
                  schedule: 'Antes de cada commit',
                  cron: 'via sub-agente',
                  desc: 'Isidora W6 revisa lógica/calidad. Javiera W12 revisa integridad/seguridad. Sin aprobación no hay commit.',
                  color: 'text-pink-400',
                },
                {
                  name: 'Bug → Task Automático',
                  schedule: 'Al detectar bug',
                  cron: 'insert directo',
                  desc: 'Cualquier agente que encuentre un bug critical/major/high lo inserta inmediatamente como task en Supabase.',
                  color: 'text-red-400',
                },
                {
                  name: 'El Chino (QA Patrol)',
                  schedule: '~800 checks/día',
                  cron: 'chino-patrol + chino-fixer',
                  desc: 'Javiera W12 ejecuta 7 tipos de checks cada 30min. Auto-fix cada 10min. Reportes 4x/día.',
                  color: 'text-amber-400',
                },
              ].map(auto => (
                <div key={auto.name} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Timer className={`h-4 w-4 mt-0.5 ${auto.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{auto.name}</span>
                      <span className="text-[10px] text-muted-foreground">{auto.schedule}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{auto.desc}</p>
                    <code className="text-[9px] text-muted-foreground/60">{auto.cron}</code>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Dependency layers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-emerald-400" />
                Orden de Activación (Dependencias)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { n: 1, name: 'Cimientos', agents: ['Diego W8', 'Sebastián W5'], sq: 'infra' },
                { n: 2, name: 'Conexiones', agents: ['Felipe W2', 'Andrés W3', 'Rodrigo W0', 'Matías W13', 'Camila W4'], sq: 'canales' },
                { n: 3, name: 'Inteligencia', agents: ['Tomás W7', 'Ignacio W17', 'Valentín W18', 'Valentina W1'], sq: 'producto' },
                { n: 4, name: 'Autonomía', agents: ['Paula W19', 'Isidora W6', 'Javiera W12'], sq: 'qa' },
              ].map(layer => (
                <div key={layer.n} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                  <span className="text-2xl font-extrabold text-orange-500 w-8 text-center">{layer.n}</span>
                  <span className="font-semibold w-28">{layer.name}</span>
                  <div className="flex gap-2 flex-wrap">
                    {layer.agents.map(a => (
                      <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

        </TabsContent>

        {/* ═══════ TAB 2: AGENTES EN VIVO ═══════ */}
        <TabsContent value="agentes" className="space-y-4">

          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Aquí ves el estado real de cada agente. Cuando un agente trabaja, guarda su estado en la base de datos.
                Si un agente muestra <span className="font-bold">"Sin sesión"</span>, significa que todavía no ha sido activado o no ha guardado su estado.
              </p>
            </CardContent>
          </Card>

          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="text-center">
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-extrabold text-emerald-500">
                  {sessions.filter(s => s.session_count > 0).length}
                </div>
                <div className="text-xs text-muted-foreground">Con sesiones</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-extrabold text-muted-foreground">
                  {sessions.filter(s => !s.session_count).length}
                </div>
                <div className="text-xs text-muted-foreground">Sin activar</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-extrabold text-orange-500">
                  {sessions.reduce((sum, s) => sum + (s.session_count || 0), 0)}
                </div>
                <div className="text-xs text-muted-foreground">Sesiones totales</div>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-extrabold text-blue-400">
                  {sessions.filter(s => s.last_challenge).length}
                </div>
                <div className="text-xs text-muted-foreground">Con challenges</div>
              </CardContent>
            </Card>
          </div>

          {/* Agent list */}
          {squads.map(sq => {
            const cfg = SQUAD_CONFIG[sq];
            const agentsInSquad = AGENTS.filter(a => a.squad === sq);
            return (
              <div key={sq}>
                <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${cfg.color}`}>
                  Squad {cfg.label}
                </h3>
                <div className="space-y-2">
                  {agentsInSquad.map(a => {
                    const session = getSession(a.code);
                    const isExpanded = expandedAgent === a.code;
                    const Icon = a.icon;
                    const active = hasActivity(session);

                    return (
                      <Card key={a.code} className={`${cfg.border} border transition-all ${isExpanded ? 'ring-1 ring-orange-500/30' : ''}`}>
                        {/* Row header */}
                        <div
                          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                          onClick={() => setExpandedAgent(isExpanded ? null : a.code)}
                        >
                          <div className={`p-2 rounded-lg ${cfg.bg}`}>
                            <Icon className={`h-4 w-4 ${cfg.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">{a.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">{a.code.toUpperCase()}</span>
                              <span className="text-xs text-muted-foreground">· {a.module}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {active ? (
                              <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {session?.session_count || 0} sesiones
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                Sin sesión
                              </Badge>
                            )}
                            {session?.last_session_at && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {timeAgo(session.last_session_at)}
                              </span>
                            )}
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && session && (
                          <div className="border-t px-4 pb-4 pt-3 space-y-4">
                            {/* Last challenge */}
                            {session.last_challenge && (
                              <div className="border-l-2 border-orange-500/50 pl-3 py-1">
                                <div className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-1">Último Challenge</div>
                                <p className="text-sm italic text-muted-foreground">"{session.last_challenge}"</p>
                              </div>
                            )}

                            {/* MD tabs */}
                            <div className="space-y-2">
                              <div className="flex gap-1">
                                {(['status', 'personality', 'context', 'memory'] as const).map(tab => (
                                  <button
                                    key={tab}
                                    onClick={(e) => { e.stopPropagation(); setMdTab(tab); }}
                                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                                      mdTab === tab
                                        ? 'bg-orange-500/20 text-orange-400 font-semibold'
                                        : 'text-muted-foreground hover:bg-muted/30'
                                    }`}
                                  >
                                    {tab === 'status' ? 'Estado' : tab === 'personality' ? 'Personalidad' : tab === 'context' ? 'Contexto' : 'Memoria'}
                                  </button>
                                ))}
                              </div>

                              <div className="bg-muted/20 rounded-lg p-3 max-h-64 overflow-y-auto">
                                {mdTab === 'context' ? (
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-sm">
                                      <FileText className="h-4 w-4 text-blue-400" />
                                      <code className="text-xs bg-muted/50 px-2 py-1 rounded">{a.contextFile}</code>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="bg-muted/30 rounded p-2 text-center">
                                        <div className="text-lg font-bold text-blue-400">{a.tables}</div>
                                        <div className="text-[10px] text-muted-foreground">Tablas propias</div>
                                      </div>
                                      <div className="bg-muted/30 rounded p-2 text-center">
                                        <div className="text-lg font-bold text-amber-400">{a.crons}</div>
                                        <div className="text-[10px] text-muted-foreground">Crons propios</div>
                                      </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      El context file contiene las tablas exactas (con columnas y estado), crons, archivos de código,
                                      edge functions y dependencias con otros agentes. Es la referencia operacional que el agente
                                      lee al activarse para saber CON QUÉ trabaja.
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/60">
                                      Validación automática cada 12h via <code>context-validator-12h</code> — detecta tablas/crons
                                      nuevos sin dueño y los escala a <code>_unassigned.md</code>
                                    </p>
                                  </div>
                                ) : (() => {
                                  const content = mdTab === 'status' ? session.status_md
                                    : mdTab === 'personality' ? session.personality_md
                                    : session.memory_md;
                                  const lines = simpleMd(content);
                                  if (lines.length === 0) {
                                    return (
                                      <p className="text-sm text-muted-foreground italic text-center py-4">
                                        {mdTab === 'status' && 'Este agente no ha guardado estado todavía. Actívalo con "activa a ' + a.name + '".'}
                                        {mdTab === 'personality' && 'Personalidad no cargada aún. Se carga cuando el agente se activa por primera vez.'}
                                        {mdTab === 'memory' && 'Sin entradas en el journal. La memoria se acumula con cada sesión.'}
                                      </p>
                                    );
                                  }
                                  return (
                                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                                      {lines.join('\n')}
                                    </pre>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Tasks */}
                            {(Array.isArray(session.tasks_pending) && session.tasks_pending.length > 0) && (
                              <div>
                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                  Tareas Pendientes
                                </div>
                                <div className="space-y-1">
                                  {session.tasks_pending.map((t: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                      {typeof t === 'string' ? t : t.title || JSON.stringify(t)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(Array.isArray(session.tasks_completed) && session.tasks_completed.length > 0) && (
                              <div>
                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                  Completadas
                                </div>
                                <div className="space-y-1">
                                  {session.tasks_completed.map((t: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                      {typeof t === 'string' ? t : t.title || JSON.stringify(t)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Meta */}
                            <div className="flex gap-4 text-[11px] text-muted-foreground pt-2 border-t">
                              <span>Sesiones: <strong>{session.session_count || 0}</strong></span>
                              <span>Última: <strong>{session.last_session_at ? new Date(session.last_session_at).toLocaleString('es-CL') : 'Nunca'}</strong></span>
                              <span>Actualizado: <strong>{new Date(session.updated_at).toLocaleString('es-CL')}</strong></span>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}

        </TabsContent>
      </Tabs>
    </div>
  );
}
