import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Database, Key, Webhook, Globe, FileText } from 'lucide-react';
import { Footer } from '@/components/landing/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const sections = [
  {
    icon: Database,
    title: 'Datos que accedemos',
    items: [
      'Métricas de ventas: ingresos, pedidos, AOV, productos vendidos.',
      'Datos de productos: títulos, descripciones, precios, inventario.',
      'Meta Ads (si conectas): métricas de campañas, gastos, rendimiento.',
      'No accedemos a datos de clientes finales (PII) de tu tienda.',
    ],
  },
  {
    icon: Shield,
    title: 'Seguridad y autenticación',
    items: [
      'OAuth 2.0 con validación HMAC (timing-safe) en cada paso.',
      'Protección CSRF con nonce único y TTL de 10 minutos.',
      'Tokens de acceso encriptados en reposo (AES-256).',
      'Row Level Security (RLS) en todas las tablas de la base de datos.',
    ],
  },
  {
    icon: Key,
    title: 'Permisos (scopes) solicitados',
    items: [
      'read_products — para analizar tu catálogo y generar copias.',
      'read_orders — para sincronizar métricas de ventas.',
      'read_analytics — para obtener datos de rendimiento de la tienda.',
    ],
  },
  {
    icon: Webhook,
    title: 'Webhooks y cumplimiento',
    items: [
      'app/uninstalled — desactiva la conexión y elimina el token de acceso.',
      'shop/redact — elimina todos los datos de la tienda (48h post-desinstalación).',
      'customers/redact — elimina datos de clientes si aplica.',
      'customers/data_request — responde solicitudes de datos de clientes.',
    ],
  },
  {
    icon: Globe,
    title: 'Integraciones externas',
    items: [
      'Meta Ads API — conexión OAuth opcional para métricas de campañas.',
      'Google Ads — generación de copias (integración de métricas en desarrollo).',
      'IA generativa — modelos de lenguaje para copias y asesoría estratégica.',
    ],
  },
  {
    icon: FileText,
    title: 'Políticas y cumplimiento legal',
    items: [
      <span key="privacy"><Link to="/privacidad" className="text-primary hover:underline">Política de Privacidad</Link> — cómo recopilamos y usamos datos.</span>,
      <span key="terms"><Link to="/terminos" className="text-primary hover:underline">Términos de Servicio</Link> — condiciones de uso de la plataforma.</span>,
      <span key="deletion"><Link to="/eliminacion-datos" className="text-primary hover:underline">Eliminación de Datos</Link> — cómo solicitar el borrado de tus datos.</span>,
      <span key="faq"><Link to="/faq" className="text-primary hover:underline">Preguntas Frecuentes</Link> — respuestas a dudas comunes.</span>,
    ],
  },
];

export default function AppDocumentation() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 py-16">
        <div className="container max-w-3xl px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>

          <h1 className="text-3xl font-bold mb-2">Documentación de la App</h1>
          <p className="text-muted-foreground mb-8">Documentación técnica y operativa de Steve – AI Marketing Copilot para Shopify.</p>

          <div className="space-y-6">
            {sections.map((section, i) => {
              const Icon = section.icon;
              return (
                <Card key={i} className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-3 text-lg">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      {section.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc pl-5 ml-[52px] space-y-1.5 text-muted-foreground text-sm">
                      {section.items.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
