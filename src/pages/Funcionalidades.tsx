import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useReveal } from '@/hooks/useReveal';
import { SteveNavbar } from '@/components/steve-landing/SteveNavbar';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';
import { FloatingWhatsAppButton } from '@/components/steve-landing/FloatingWhatsAppButton';
import {
  BarChart3, Bot, Facebook, Search, ShoppingBag,
  Mail, PenTool, Microscope, FileText, Link2,
  ArrowRight, Sparkles, Zap, ChevronRight,
  TrendingUp, Globe, Palette, Shield, Clock, LayoutGrid,
  CheckCircle2,
} from 'lucide-react';

const features = [
  {
    id: 'metrics',
    icon: BarChart3,
    title: 'Dashboard de Metricas',
    subtitle: 'Todos tus KPIs en un solo lugar',
    description: 'Centraliza los datos de todas tus plataformas en un dashboard unificado. Visualiza ROAS, CPA, CTR, conversion rate, ventas y mas, todo actualizado automaticamente cada 6 horas. Compara periodos, detecta tendencias y toma decisiones basadas en datos reales.',
    bullets: [
      'ROAS, CPA, CTR y conversion rate sincronizados en tiempo real',
      'Datos cruzados de Meta Ads, Google Ads, Shopify y Klaviyo',
      'Graficos interactivos con comparacion de periodos',
      'Alertas automaticas cuando una metrica sale de rango',
    ],
    highlights: [
      { icon: TrendingUp, label: 'Tiempo real', desc: 'Sync cada 6h' },
      { icon: LayoutGrid, label: '4 fuentes', desc: 'Multi-canal' },
      { icon: Zap, label: 'Alertas', desc: 'Automaticas' },
    ],
    badge: 'Multi-plataforma',
    accent: '#38BDF8',
    accentBg: 'from-cyan-500/20 to-blue-600/20',
    iconBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-500',
    badgeBg: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
    bulletColor: 'bg-cyan-400',
    gradient: 'from-cyan-500 to-blue-600',
    lightBg: 'bg-cyan-50',
  },
  {
    id: 'steve-chat',
    icon: Bot,
    title: 'Steve AI Chat',
    subtitle: 'Tu consultor de marketing 24/7',
    description: 'Conversa con Steve como lo harias con un consultor de marketing senior. Pregunta sobre tus campanas, pide recomendaciones, genera copies y analiza estrategias. Steve tiene contexto de tu marca, tus metricas y tu historial de conversaciones.',
    bullets: [
      'Pregunta sobre tus campanas, metricas y estrategia en lenguaje natural',
      'Genera copies, analiza competencia y sugiere optimizaciones',
      'Contexto persistente: Steve recuerda tu marca y conversaciones anteriores',
      'Respuestas basadas en datos reales de tus integraciones conectadas',
    ],
    highlights: [
      { icon: Bot, label: 'IA Avanzada', desc: 'Claude + GPT' },
      { icon: Clock, label: '24/7', desc: 'Siempre activo' },
      { icon: FileText, label: 'Contexto', desc: 'Persistente' },
    ],
    badge: 'IA Avanzada',
    accent: '#F97316',
    accentBg: 'from-orange-500/20 to-amber-500/20',
    iconBg: 'bg-orange-500/10',
    iconColor: 'text-orange-500',
    badgeBg: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    bulletColor: 'bg-orange-400',
    gradient: 'from-orange-500 to-amber-500',
    lightBg: 'bg-orange-50',
  },
  {
    id: 'meta-ads',
    icon: Facebook,
    title: 'Meta Ads Manager',
    subtitle: 'Gestiona Facebook e Instagram desde Steve',
    description: 'Crea, edita y analiza campanas de Meta Ads directamente desde Steve. Visualiza metricas por campana, genera copies optimizados con IA, y analiza tu audiencia. Todo integrado con el ecosistema de Steve para maximizar resultados.',
    bullets: [
      'Crea y edita campanas, conjuntos de anuncios y anuncios',
      'Visualiza metricas por campana con graficos de rendimiento',
      'Generacion de copies con IA optimizados para cada objetivo',
      'Analisis de audiencias y recomendaciones de segmentacion',
    ],
    highlights: [
      { icon: Facebook, label: 'Meta API', desc: 'Oficial' },
      { icon: Palette, label: 'Copies AI', desc: 'Generados' },
      { icon: TrendingUp, label: 'Metricas', desc: 'Por campana' },
    ],
    badge: 'Meta Business',
    accent: '#3B82F6',
    accentBg: 'from-blue-500/20 to-indigo-500/20',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    badgeBg: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    bulletColor: 'bg-blue-400',
    gradient: 'from-blue-500 to-indigo-500',
    lightBg: 'bg-blue-50',
  },
  {
    id: 'google-ads',
    icon: Search,
    title: 'Google Ads',
    subtitle: 'Search, Display y Shopping en un panel',
    description: 'Sincroniza tus campanas de Google Ads y visualiza metricas de rendimiento. Genera headlines y descripciones optimizadas por IA, compara grupos de anuncios y recibe recomendaciones de palabras clave para tu industria.',
    bullets: [
      'Metricas de campanas Google sincronizadas automaticamente',
      'Generacion de headlines y descripciones optimizadas por IA',
      'Comparacion de rendimiento entre campanas y grupos de anuncios',
      'Recomendaciones de palabras clave basadas en tu industria',
    ],
    highlights: [
      { icon: Search, label: 'Search', desc: '+ Display' },
      { icon: Globe, label: 'Keywords', desc: 'AI sugeridas' },
      { icon: TrendingUp, label: 'Performance', desc: 'En vivo' },
    ],
    badge: 'Google Partner',
    accent: '#10B981',
    accentBg: 'from-emerald-500/20 to-teal-500/20',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    badgeBg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    bulletColor: 'bg-emerald-400',
    gradient: 'from-emerald-500 to-teal-500',
    lightBg: 'bg-emerald-50',
  },
  {
    id: 'shopify',
    icon: ShoppingBag,
    title: 'Shopify Analytics',
    subtitle: 'Ventas y productos en tiempo real',
    description: 'Conecta tu tienda Shopify y visualiza ventas, ordenes, productos top y tendencias en tiempo real. Cruza datos de ventas con gasto publicitario para calcular tu ROAS real y recibe alertas de stock bajo y productos trending.',
    bullets: [
      'Sincronizacion automatica de ventas, ordenes y productos',
      'Top productos, AOV, tasa de conversion y tendencias',
      'Cruza datos de ventas con gasto publicitario para ROAS real',
      'Alertas de stock bajo y productos trending',
    ],
    highlights: [
      { icon: ShoppingBag, label: 'Shopify', desc: 'App oficial' },
      { icon: TrendingUp, label: 'AOV', desc: 'Tracking' },
      { icon: Zap, label: 'Auto sync', desc: 'Cada 6h' },
    ],
    badge: 'Shopify App',
    accent: '#8B5CF6',
    accentBg: 'from-violet-500/20 to-purple-500/20',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-500',
    badgeBg: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
    bulletColor: 'bg-violet-400',
    gradient: 'from-violet-500 to-purple-500',
    lightBg: 'bg-violet-50',
  },
  {
    id: 'klaviyo',
    icon: Mail,
    title: 'Klaviyo Studio',
    subtitle: 'Email marketing con IA integrada',
    description: 'Visualiza metricas de tus campanas y flujos de Klaviyo: open rate, click rate, revenue generado. Importa templates, planifica envios con el calendario integrado y analiza flujos automatizados con recomendaciones de Steve.',
    bullets: [
      'Metricas de campanas y flujos: open rate, click rate, revenue',
      'Importa templates directamente desde tu cuenta Klaviyo',
      'Calendario de envios con fechas y horarios optimizados',
      'Analisis de flujos automatizados con recomendaciones',
    ],
    highlights: [
      { icon: Mail, label: 'Klaviyo', desc: 'Integrado' },
      { icon: LayoutGrid, label: 'Templates', desc: 'Importables' },
      { icon: Clock, label: 'Calendario', desc: 'De envios' },
    ],
    badge: 'Klaviyo Partner',
    accent: '#EC4899',
    accentBg: 'from-pink-500/20 to-rose-500/20',
    iconBg: 'bg-pink-500/10',
    iconColor: 'text-pink-500',
    badgeBg: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
    bulletColor: 'bg-pink-400',
    gradient: 'from-pink-500 to-rose-500',
    lightBg: 'bg-pink-50',
  },
  {
    id: 'steve-mail',
    icon: PenTool,
    title: 'Steve Mail',
    subtitle: 'Editor de emails drag & drop',
    description: 'Editor visual de emails integrado directamente en Steve. Arrastra y suelta componentes (texto, imagenes, botones, columnas), genera contenido con IA, personaliza con datos de tu marca y previsualiza en desktop y mobile.',
    bullets: [
      'Editor visual tipo Klaviyo integrado directamente en Steve',
      'Componentes drag & drop: texto, imagen, boton, columnas',
      'Genera contenido con IA y personaliza con datos de tu marca',
      'Preview en desktop y mobile antes de enviar',
    ],
    highlights: [
      { icon: PenTool, label: 'Drag & drop', desc: 'Visual' },
      { icon: Palette, label: 'Contenido AI', desc: 'Generado' },
      { icon: LayoutGrid, label: 'Responsive', desc: 'Mobile ready' },
    ],
    badge: 'Editor Nativo',
    accent: '#F59E0B',
    accentBg: 'from-amber-500/20 to-yellow-500/20',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    badgeBg: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    bulletColor: 'bg-amber-400',
    gradient: 'from-amber-500 to-yellow-500',
    lightBg: 'bg-amber-50',
  },
  {
    id: 'deep-dive',
    icon: Microscope,
    title: 'Deep Dive',
    subtitle: 'Analisis de competencia con IA',
    description: 'Escanea anuncios activos de tus competidores en Meta Ads usando web scraping con IA. Analiza copies, creativos y estrategias de la competencia. Recibe recomendaciones para diferenciarte y descubre tendencias del mercado.',
    bullets: [
      'Escanea anuncios activos de tus competidores en Meta',
      'Analisis de copies, creativos y estrategias de la competencia',
      'Recomendaciones para diferenciarte basadas en datos reales',
      'Historial de cambios y tendencias del mercado',
    ],
    highlights: [
      { icon: Microscope, label: 'Scraping AI', desc: 'Automatico' },
      { icon: Globe, label: 'Competencia', desc: 'En vivo' },
      { icon: TrendingUp, label: 'Tendencias', desc: 'Del mercado' },
    ],
    badge: 'Web Scraping AI',
    accent: '#EF4444',
    accentBg: 'from-red-500/20 to-rose-600/20',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    badgeBg: 'bg-red-500/10 text-red-600 border-red-500/20',
    bulletColor: 'bg-red-400',
    gradient: 'from-red-500 to-rose-600',
    lightBg: 'bg-red-50',
  },
  {
    id: 'brand-brief',
    icon: FileText,
    title: 'Brand Brief',
    subtitle: 'Tu marca documentada para mejores resultados',
    description: 'Documenta tono, valores, audiencia objetivo y propuesta de valor de tu marca. Steve usa este brief para personalizar todos los copies, recomendaciones y estrategias que genera. Mantenlo actualizado y comparte con tu equipo.',
    bullets: [
      'Documenta tono, valores, audiencia y propuesta de valor',
      'Steve usa tu brief para personalizar copies y recomendaciones',
      'Actualiza facilmente cuando evoluciona tu estrategia',
      'Comparte el brief con tu equipo para consistencia de marca',
    ],
    highlights: [
      { icon: FileText, label: 'Brief', desc: 'Documentado' },
      { icon: Bot, label: 'IA usa brief', desc: 'Auto-contexto' },
      { icon: Shield, label: 'Consistencia', desc: 'De marca' },
    ],
    badge: 'Personalizacion',
    accent: '#6366F1',
    accentBg: 'from-indigo-500/20 to-violet-500/20',
    iconBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-500',
    badgeBg: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
    bulletColor: 'bg-indigo-400',
    gradient: 'from-indigo-500 to-violet-500',
    lightBg: 'bg-indigo-50',
  },
  {
    id: 'connections',
    icon: Link2,
    title: 'Hub de Conexiones',
    subtitle: 'Todas tus plataformas en un click',
    description: 'Conecta Shopify, Meta Ads, Google Ads y Klaviyo con autenticacion OAuth segura. Visualiza el estado de cada conexion en tiempo real, reconecta automaticamente si expira un token y sincroniza datos cada 6 horas.',
    bullets: [
      'Conecta Shopify, Meta Ads, Google Ads y Klaviyo con OAuth seguro',
      'Estado de conexion en tiempo real con indicadores visuales',
      'Reconexion automatica si expira un token',
      'Datos sincronizados cada 6 horas automaticamente',
    ],
    highlights: [
      { icon: Shield, label: 'OAuth', desc: 'Seguro' },
      { icon: Link2, label: '4 apps', desc: 'Conectadas' },
      { icon: Zap, label: 'Auto-sync', desc: 'Cada 6h' },
    ],
    badge: '4 Integraciones',
    accent: '#14B8A6',
    accentBg: 'from-teal-500/20 to-cyan-500/20',
    iconBg: 'bg-teal-500/10',
    iconColor: 'text-teal-500',
    badgeBg: 'bg-teal-500/10 text-teal-600 border-teal-500/20',
    bulletColor: 'bg-teal-400',
    gradient: 'from-teal-500 to-cyan-500',
    lightBg: 'bg-teal-50',
  },
];

/* ─── Tabbed Explorer ─────────────────────────────────────────────── */
function FeatureExplorer() {
  const [activeId, setActiveId] = useState(features[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = features.find((f) => f.id === activeId)!;
  const Icon = active.icon;

  return (
    <section className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Explora cada modulo en detalle
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Haz click en cada pestana para ver que hace, como funciona y que incluye.
          </p>
        </div>

        {/* Tab bar — horizontal scroll on mobile */}
        <div className="relative mb-10">
          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {features.map((f) => {
              const FIcon = f.icon;
              const isActive = f.id === activeId;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveId(f.id)}
                  className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap snap-start transition-all duration-200 shrink-0 ${
                    isActive
                      ? 'text-white shadow-lg'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
                  style={isActive ? { background: `linear-gradient(135deg, ${f.accent}, ${f.accent}dd)`, boxShadow: `0 4px 20px ${f.accent}40` } : undefined}
                >
                  <FIcon className="w-4 h-4" />
                  {f.title}
                </button>
              );
            })}
          </div>
          {/* Fade edges */}
          <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-slate-50 to-transparent pointer-events-none md:hidden" />
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
              {/* Left — Screenshot */}
              <div className="relative group">
                {/* Colored glow */}
                <div
                  className="absolute -inset-3 rounded-3xl blur-2xl opacity-50 group-hover:opacity-80 transition-opacity duration-500"
                  style={{ background: `linear-gradient(135deg, ${active.accent}30, ${active.accent}10)` }}
                />
                {/* Browser chrome */}
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200/80 bg-white ring-1 ring-black/5">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <div className="flex gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-red-400" />
                      <span className="w-3 h-3 rounded-full bg-yellow-400" />
                      <span className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 mx-3">
                      <div className="bg-white rounded-md px-3 py-1 text-xs text-slate-400 border border-slate-200 max-w-xs">
                        steve.cl/portal — {active.title}
                      </div>
                    </div>
                  </div>
                  <img
                    src={`/screenshots/${active.id}.png`}
                    alt={active.title}
                    className="w-full h-auto"
                  />
                </div>
              </div>

              {/* Right — Details */}
              <div className="flex flex-col">
                {/* Badge + number */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${active.accent}20, ${active.accent}10)` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: active.accent }} />
                  </div>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${active.badgeBg}`}>
                    {active.badge}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
                  {active.title}
                </h3>
                <p className="text-lg font-medium mb-4" style={{ color: active.accent }}>
                  {active.subtitle}
                </p>

                {/* Description */}
                <p className="text-slate-600 leading-relaxed mb-6">
                  {active.description}
                </p>

                {/* Highlights row */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {active.highlights.map((h) => {
                    const HIcon = h.icon;
                    return (
                      <div
                        key={h.label}
                        className="rounded-xl border border-slate-200 bg-white p-3 text-center hover:shadow-md transition-shadow"
                      >
                        <HIcon className="w-5 h-5 mx-auto mb-1.5" style={{ color: active.accent }} />
                        <div className="text-xs font-bold text-slate-800">{h.label}</div>
                        <div className="text-[11px] text-slate-400">{h.desc}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Bullet points */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Incluye</div>
                  <ul className="space-y-2.5">
                    {active.bullets.map((bullet, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: active.accent }} />
                        <span className="text-sm text-slate-700 leading-relaxed">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ─── Alternating Feature Sections ───────────────────────────────── */
function FeatureSection({ feature, index }: { feature: typeof features[0]; index: number }) {
  const ref = useReveal();
  const Icon = feature.icon;
  const imageLeft = index % 2 === 0;
  const isEven = index % 2 === 0;

  const imageBlock = (
    <motion.div
      className="flex-1 min-w-0"
      initial={{ opacity: 0, x: imageLeft ? -40 : 40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className="relative group">
        <div
          className={`absolute -inset-4 rounded-3xl bg-gradient-to-br ${feature.accentBg} blur-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-500`}
        />
        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/80 bg-white ring-1 ring-black/5">
          <img
            src={`/screenshots/${feature.id}.png`}
            alt={feature.title}
            className="w-full h-auto"
            loading="lazy"
          />
        </div>
      </div>
    </motion.div>
  );

  const textBlock = (
    <motion.div
      className="flex-1 min-w-0 flex flex-col justify-center"
      initial={{ opacity: 0, x: imageLeft ? 40 : -40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
    >
      <div className="flex items-center gap-3 mb-5">
        <span
          className="text-5xl font-black tracking-tighter"
          style={{ color: feature.accent, opacity: 0.15 }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${feature.badgeBg}`}>
          {feature.badge}
        </span>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-11 h-11 rounded-xl ${feature.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${feature.iconColor}`} />
        </div>
        <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
          {feature.title}
        </h3>
      </div>
      <p className="text-lg text-slate-500 mb-6 leading-relaxed">
        {feature.subtitle}
      </p>
      <ul className="space-y-3">
        {feature.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-3 group/item">
            <span className={`mt-1.5 w-2 h-2 rounded-full ${feature.bulletColor} shrink-0 group-hover/item:scale-150 transition-transform`} />
            <span className="text-slate-600 text-sm leading-relaxed">{bullet}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );

  return (
    <div
      ref={ref}
      className={`reveal relative overflow-hidden ${isEven ? 'bg-white' : 'bg-slate-50/70'}`}
    >
      <div
        className="absolute pointer-events-none w-[500px] h-[500px] rounded-full blur-3xl opacity-[0.07]"
        style={{
          background: `radial-gradient(circle, ${feature.accent}, transparent 70%)`,
          top: '50%',
          transform: 'translateY(-50%)',
          ...(imageLeft ? { right: '-200px' } : { left: '-200px' }),
        }}
      />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className={`flex flex-col ${imageLeft ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 lg:gap-20 items-center`}>
          {imageBlock}
          {textBlock}
        </div>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function Funcionalidades() {
  const navigate = useNavigate();
  const { signOut, user, loading: authLoading } = useAuth();
  const { isAdmin, isClient, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) return null;

  return (
    <div className="min-h-screen bg-white">
      <SteveNavbar
        user={user}
        isAdmin={isAdmin}
        isClient={isClient}
        onOpenAuth={() => navigate('/steve')}
        onNavigate={(path) => navigate(path)}
        onSignOut={async () => { await signOut(); }}
      />

      {/* ── Hero ── */}
      <section className="relative bg-[#0F172A] overflow-hidden pt-28 pb-24 md:pt-36 md:pb-32">
        <div className="absolute right-[-100px] top-[-100px] w-[500px] h-[500px] bg-[#1E3A7B]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-[-150px] bottom-[-150px] w-[400px] h-[400px] bg-[#38BDF8]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-1/3 bottom-0 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#38BDF8]/10 border border-[#38BDF8]/20 mb-6">
              <Sparkles className="w-4 h-4 text-[#38BDF8]" />
              <span className="text-[#38BDF8] text-sm font-medium">10 modulos integrados</span>
            </div>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white mb-6 tracking-tight leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Conoce todo lo que{' '}
            <span className="bg-gradient-to-r from-[#38BDF8] via-[#818CF8] to-[#C084FC] bg-clip-text text-transparent">
              Steve hace
            </span>{' '}
            por tu marketing
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Gestiona campanas, analiza metricas, crea contenido y conecta todas tus plataformas desde un solo lugar.
          </motion.p>

          <motion.div
            className="flex flex-wrap justify-center gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
          >
            {features.map((f) => {
              const FIcon = f.icon;
              return (
                <a
                  key={f.id}
                  href={`#${f.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400 hover:text-white hover:border-white/25 hover:bg-white/10 transition-all"
                >
                  <FIcon className="w-3 h-3" style={{ color: f.accent }} />
                  {f.title}
                </a>
              );
            })}
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent" />
      </section>

      {/* ── Tabbed Explorer ── */}
      <FeatureExplorer />

      {/* ── Divider ── */}
      <div className="relative py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 border border-slate-200 mb-4">
            <ChevronRight className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 text-sm font-medium">Scroll para ver cada modulo en detalle</span>
          </div>
        </div>
      </div>

      {/* ── Feature Sections (scroll) ── */}
      {features.map((feature, index) => (
        <div key={feature.id} id={feature.id}>
          <FeatureSection feature={feature} index={index} />
        </div>
      ))}

      {/* ── Stats bar ── */}
      <section className="bg-[#0F172A] py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#1E3A7B]/20 via-transparent to-[#38BDF8]/20" />
        <div className="relative max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '10', label: 'Modulos', icon: Zap },
            { value: '4', label: 'Integraciones', icon: Link2 },
            { value: '24/7', label: 'Disponible', icon: Bot },
            { value: '5 min', label: 'Setup', icon: Sparkles },
          ].map((stat) => {
            const SIcon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <SIcon className="w-5 h-5 text-[#38BDF8] mx-auto mb-2" />
                <div className="text-3xl md:text-4xl font-extrabold text-white mb-1">{stat.value}</div>
                <div className="text-sm text-slate-400">{stat.label}</div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative bg-gradient-to-br from-[#0F172A] via-[#1e1b4b] to-[#0F172A] py-24 overflow-hidden">
        <div className="absolute left-1/4 top-0 w-[400px] h-[400px] bg-[#1E3A7B]/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-1/4 bottom-0 w-[300px] h-[300px] bg-[#38BDF8]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-5 tracking-tight">
              Listo para transformar tu{' '}
              <span className="bg-gradient-to-r from-[#38BDF8] to-[#C084FC] bg-clip-text text-transparent">
                marketing
              </span>
            </h2>
            <p className="text-slate-400 mb-10 max-w-xl mx-auto text-lg">
              Agenda una reunion sin compromiso y descubre como Steve puede ayudar a tu negocio.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://meetings.hubspot.com/jose-manuel15"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#1E3A7B] to-[#2563EB] text-white font-bold rounded-full hover:shadow-lg hover:shadow-[#1E3A7B]/40 transition-all text-lg"
              >
                Agenda una reunion
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="https://wa.me/15559061514?text=Hola%20Steve%20%F0%9F%90%95"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-4 rounded-full border border-white/20 text-white font-semibold hover:bg-white/5 transition-all"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-[#25D366]">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Preguntale a Steve
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <SteveFooter />
      <FloatingWhatsAppButton />
    </div>
  );
}
