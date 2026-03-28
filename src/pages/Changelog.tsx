import { Link } from 'react-router-dom';
import { ArrowLeft, GitCommit, Sparkles, Bug, Zap, Shield } from 'lucide-react';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';

type ChangeType = 'feature' | 'fix' | 'improvement' | 'security';

interface Change {
  type: ChangeType;
  text: string;
}

interface Release {
  version: string;
  date: string;
  title: string;
  changes: Change[];
}

const typeConfig: Record<ChangeType, { label: string; color: string; icon: typeof Sparkles }> = {
  feature:     { label: 'Nuevo',    color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Sparkles },
  fix:         { label: 'Fix',      color: 'bg-red-50 text-red-700 border-red-200',             icon: Bug },
  improvement: { label: 'Mejora',   color: 'bg-blue-50 text-blue-700 border-blue-200',          icon: Zap },
  security:    { label: 'Seguridad', color: 'bg-amber-50 text-amber-700 border-amber-200',      icon: Shield },
};

const releases: Release[] = [
  {
    version: '2.4.0',
    date: '2026-03-27',
    title: 'Instagram Hub y Prospecting AI',
    changes: [
      { type: 'feature', text: 'Tab de Métricas integrado en Instagram Hub con IGMetricsDashboard.' },
      { type: 'feature', text: 'Prospecting como categoría entrenable en Steve IA.' },
      { type: 'improvement', text: 'Panel de métricas simplificado con datos reales de Shopify + Meta por cliente.' },
      { type: 'fix', text: 'Eliminación de clientes via edge function + eliminación masiva con checkboxes.' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-03-20',
    title: 'WhatsApp Brain y Nurturing de Prospectos',
    changes: [
      { type: 'feature', text: 'WhatsApp Brain: sistema inteligente de respuestas automáticas.' },
      { type: 'feature', text: 'Nurturing de prospectos con secuencias automatizadas.' },
      { type: 'improvement', text: 'Refactorización completa del módulo de métricas.' },
      { type: 'feature', text: 'Tests end-to-end para flujos críticos.' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-03-15',
    title: 'Gestión de Clientes y Tokens',
    changes: [
      { type: 'feature', text: 'Admin puede crear clientes con Plan PRO (500 tokens).' },
      { type: 'feature', text: 'Eliminación de clientes con cleanup de datos relacionados.' },
      { type: 'feature', text: 'RUT, razón social y gestión de tokens por cliente.' },
      { type: 'fix', text: 'Modal de auth en modo login-only.' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-03-10',
    title: 'Meta Pixel y Creativos AI',
    changes: [
      { type: 'feature', text: 'Meta Pixel tracking integrado (noscript + script).' },
      { type: 'feature', text: 'Detector de fatiga creativa para campañas de Meta Ads.' },
      { type: 'feature', text: 'Generador de previews de creatividades publicitarias.' },
      { type: 'improvement', text: 'CRITERIO: 493 reglas de evaluación de calidad de campañas y emails.' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-03-01',
    title: 'Migración a nuevo Supabase y Cloud Run',
    changes: [
      { type: 'improvement', text: 'Migración completa de Lovable a Claude Code.' },
      { type: 'improvement', text: 'Nuevo proyecto Supabase con 37 tablas y 120 RLS policies.' },
      { type: 'feature', text: 'Backend migrado a Hono + Cloud Run (47 edge functions).' },
      { type: 'security', text: 'Tokens OAuth encriptados con AES-256 en reposo.' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-02-20',
    title: 'Editor Klaviyo y Steve Mail',
    changes: [
      { type: 'feature', text: 'Editor de emails drag & drop estilo Klaviyo.' },
      { type: 'feature', text: 'Importar templates desde Klaviyo directamente.' },
      { type: 'feature', text: 'Métricas por campaña y flujo de Klaviyo.' },
      { type: 'feature', text: 'Chat Steve persistente entre tabs.' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-02-15',
    title: 'Webhook y seguridad OAuth',
    changes: [
      { type: 'security', text: 'Registro automático del webhook app/uninstalled al completar OAuth.' },
      { type: 'security', text: 'Validación de state/nonce con CSRF protection y TTL de 10 minutos.' },
      { type: 'security', text: 'HMAC verification con timingSafeEqual para prevenir timing attacks.' },
      { type: 'improvement', text: 'Limpieza automática de tokens al desinstalar la app.' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-02-01',
    title: 'Generador de copias para Google Ads',
    changes: [
      { type: 'feature', text: 'Generador de copias para campañas de Google Ads (Search, Display, Performance Max).' },
      { type: 'feature', text: 'Generación de headlines, descripciones y sitelinks optimizados.' },
      { type: 'improvement', text: 'Integración con Brand Brief para copias alineadas con la marca.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-01-15',
    title: 'Lanzamiento inicial',
    changes: [
      { type: 'feature', text: 'Conexión con Shopify para sincronizar métricas de ventas.' },
      { type: 'feature', text: 'Conexión con Meta Ads para métricas de campañas.' },
      { type: 'feature', text: 'Steve: asistente de marketing con IA basado en datos reales.' },
      { type: 'feature', text: 'Generador de copias para Meta Ads (imagen, video, carrusel).' },
      { type: 'feature', text: 'Brand Brief estratégico por cliente.' },
      { type: 'security', text: 'Cumplimiento GDPR con webhooks de datos y eliminación.' },
    ],
  },
];

export default function Changelog() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container max-w-4xl mx-auto px-6 py-20">
          <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
              <GitCommit className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Changelog</h1>
              <p className="text-slate-400 text-sm mt-1">Historial de actualizaciones</p>
            </div>
          </div>
          <p className="text-slate-300 mt-4 max-w-2xl">
            Todas las mejoras, nuevas funcionalidades y correcciones que hemos implementado en Steve.
          </p>
        </div>
      </div>

      <main className="flex-1 py-16">
        <div className="container max-w-4xl mx-auto px-6">
          {/* Timeline */}
          <div className="relative">
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-slate-200" />

            <div className="space-y-8">
              {releases.map((release) => (
                <div key={release.version} className="relative pl-12">
                  {/* Timeline dot */}
                  <div className="absolute left-0 top-6 h-10 w-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center z-10">
                    <span className="text-xs font-bold text-slate-500">{release.version.split('.')[0]}.{release.version.split('.')[1]}</span>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="text-sm font-mono bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-medium">
                        v{release.version}
                      </span>
                      <span className="text-sm text-slate-400">
                        {new Date(release.date).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mb-4">{release.title}</h2>
                    <div className="space-y-2.5">
                      {release.changes.map((change, i) => {
                        const config = typeConfig[change.type];
                        return (
                          <div key={i} className="flex items-start gap-3">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${config.color}`}>
                              {config.label}
                            </span>
                            <p className="text-sm text-slate-600">{change.text}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <SteveFooter />
    </div>
  );
}
