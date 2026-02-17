import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/landing/Footer';

const releases = [
  {
    version: '1.2.0',
    date: '2026-02-15',
    title: 'Webhook app/uninstalled y mejoras de seguridad',
    changes: [
      'Registro automático del webhook app/uninstalled al completar OAuth.',
      'Validación de state/nonce con CSRF protection y TTL de 10 minutos.',
      'HMAC verification con timingSafeEqual para prevenir timing attacks.',
      'Limpieza automática de tokens al desinstalar la app.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-02-01',
    title: 'Generador de copias para Google Ads',
    changes: [
      'Nuevo generador de copias para campañas de Google Ads (Search, Display, Performance Max).',
      'Generación de headlines, descripciones y sitelinks optimizados.',
      'Integración con Brand Brief para copias alineadas con la marca.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-01-15',
    title: 'Lanzamiento inicial',
    changes: [
      'Conexión con Shopify para sincronizar métricas de ventas.',
      'Conexión con Meta Ads para métricas de campañas.',
      'Steve: asistente de marketing con IA basado en datos reales.',
      'Generador de copias para Meta Ads (imagen, video, carrusel).',
      'Brand Brief estratégico por cliente.',
      'Cumplimiento GDPR con webhooks de datos y eliminación.',
    ],
  },
];

export default function Changelog() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 py-16">
        <div className="container max-w-3xl px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>

          <h1 className="text-3xl font-bold mb-2">Changelog</h1>
          <p className="text-muted-foreground mb-8">Historial de actualizaciones y mejoras de Steve.</p>

          <div className="space-y-10">
            {releases.map((release) => (
              <div key={release.version} className="border-l-2 border-primary/30 pl-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">v{release.version}</span>
                  <span className="text-sm text-muted-foreground">{new Date(release.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                <h2 className="text-lg font-semibold mb-3">{release.title}</h2>
                <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground text-sm">
                  {release.changes.map((change, i) => (
                    <li key={i}>{change}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
