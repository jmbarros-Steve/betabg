import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Database, Shield, Key, Webhook, Globe, FileText, Server, Cpu } from 'lucide-react';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';

const sections = [
  {
    icon: Cpu,
    title: 'Arquitectura de la Plataforma',
    color: 'bg-violet-50 text-violet-600',
    description: 'Steve es una plataforma SaaS de marketing AI construida con tecnologías modernas y escalables.',
    items: [
      { label: 'Frontend', value: 'React + TypeScript + Vite, desplegado en Vercel con CDN global.' },
      { label: 'Backend', value: 'API REST en Hono + Node.js sobre Google Cloud Run con auto-scaling.' },
      { label: 'Base de datos', value: 'Supabase (PostgreSQL) con Row Level Security y encriptación.' },
      { label: 'IA', value: 'Modelos de lenguaje (Anthropic Claude, OpenAI) para generación de copias y asesoría.' },
    ],
  },
  {
    icon: Database,
    title: 'Datos que Accedemos',
    color: 'bg-blue-50 text-blue-600',
    description: 'Solo accedemos a los datos estrictamente necesarios para brindarte el servicio.',
    items: [
      { label: 'Shopify', value: 'Métricas de ventas (ingresos, pedidos, AOV), catálogo de productos, inventario y carros abandonados.' },
      { label: 'Meta Ads', value: 'Métricas de campañas (impresiones, clics, conversiones, gastos), creatividades y audiencias.' },
      { label: 'Google Ads', value: 'Rendimiento de campañas (CPC, CPA, conversiones), keywords y grupos de anuncios.' },
      { label: 'Klaviyo', value: 'Listas de contactos, métricas de email marketing y rendimiento de flows.' },
    ],
  },
  {
    icon: Shield,
    title: 'Seguridad y Autenticación',
    color: 'bg-emerald-50 text-emerald-600',
    description: 'Implementamos múltiples capas de seguridad para proteger tus datos.',
    items: [
      { label: 'OAuth 2.0', value: 'Autenticación segura con validación HMAC (timing-safe) y protección CSRF con nonce.' },
      { label: 'Encriptación', value: 'Tokens de acceso encriptados en reposo (AES-256) mediante Supabase Vault.' },
      { label: 'RLS', value: 'Row Level Security en todas las tablas — cada usuario solo ve sus propios datos.' },
      { label: 'Monitoreo', value: 'Health checks automatizados cada 4 horas con alertas en tiempo real.' },
    ],
  },
  {
    icon: Key,
    title: 'Permisos (Scopes) Solicitados',
    color: 'bg-amber-50 text-amber-600',
    description: 'Solicitamos solo los permisos mínimos necesarios para el funcionamiento de la plataforma.',
    items: [
      { label: 'read_products', value: 'Para analizar tu catálogo, generar copias y sugerencias de precio.' },
      { label: 'read_orders', value: 'Para sincronizar métricas de ventas, AOV y tendencias.' },
      { label: 'read_analytics', value: 'Para obtener datos de rendimiento general de la tienda.' },
      { label: 'read_customers', value: 'Para sincronizar contactos con Klaviyo y segmentar audiencias.' },
      { label: 'write_discounts', value: 'Para crear códigos de descuento directamente desde Steve.' },
      { label: 'read_checkouts', value: 'Para detectar carros abandonados y activar recuperación via WhatsApp.' },
    ],
  },
  {
    icon: Webhook,
    title: 'Webhooks y Cumplimiento GDPR',
    color: 'bg-red-50 text-red-600',
    description: 'Cumplimos con todos los requerimientos de webhooks obligatorios de Shopify y GDPR.',
    items: [
      { label: 'app/uninstalled', value: 'Desactiva la conexión y elimina el token de acceso inmediatamente.' },
      { label: 'shop/redact', value: 'Elimina todos los datos de la tienda dentro de 48 horas post-desinstalación.' },
      { label: 'customers/redact', value: 'Elimina datos de clientes específicos cuando es solicitado.' },
      { label: 'customers/data_request', value: 'Responde solicitudes de exportación de datos de clientes.' },
      { label: 'orders/fulfilled', value: 'Actualiza métricas de fulfillment y tracking de envíos.' },
      { label: 'checkouts/create', value: 'Activa flows de email y recuperación de carros abandonados.' },
    ],
  },
  {
    icon: Globe,
    title: 'Integraciones Externas',
    color: 'bg-cyan-50 text-cyan-600',
    description: 'Steve se integra con las principales plataformas de marketing y e-commerce.',
    items: [
      { label: 'Shopify', value: 'Conexión OAuth completa con sync de métricas, productos, órdenes y descuentos.' },
      { label: 'Meta Ads', value: 'Métricas de campañas, generación de copias y análisis de rendimiento.' },
      { label: 'Google Ads', value: 'Métricas y generación de copias para Search, Display y Performance Max.' },
      { label: 'Klaviyo', value: 'Sincronización de contactos, métricas de email y gestión de flows.' },
      { label: 'WhatsApp', value: 'Mensajes de recuperación de carros abandonados y comunicación con clientes.' },
    ],
  },
  {
    icon: Server,
    title: 'Infraestructura y Disponibilidad',
    color: 'bg-slate-100 text-slate-600',
    description: 'Nuestra infraestructura está diseñada para alta disponibilidad y rendimiento.',
    items: [
      { label: 'Uptime', value: 'SLA objetivo de 99.9% con monitoreo continuo y alertas automáticas.' },
      { label: 'Región', value: 'Servidores en us-central1 (Google Cloud) con CDN global via Vercel.' },
      { label: 'Backups', value: 'Backups automáticos de base de datos con retención de 30 días.' },
      { label: 'Sync', value: 'Sincronización de métricas cada 6 horas + on-demand manual.' },
    ],
  },
  {
    icon: FileText,
    title: 'Políticas y Documentos Legales',
    color: 'bg-indigo-50 text-indigo-600',
    description: 'Consulta nuestros documentos legales y políticas de uso.',
    items: [
      { label: 'Privacidad', value: 'link:/privacidad:Política de Privacidad — cómo recopilamos y usamos tus datos.' },
      { label: 'Términos', value: 'link:/terminos:Términos de Servicio — condiciones de uso de la plataforma.' },
      { label: 'Eliminación', value: 'link:/eliminacion-datos:Eliminación de Datos — cómo solicitar el borrado de tus datos.' },
      { label: 'FAQ', value: 'link:/faq:Preguntas Frecuentes — respuestas a las dudas más comunes.' },
    ],
  },
];

export default function AppDocumentation() {
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
              <BookOpen className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Documentación</h1>
              <p className="text-slate-400 text-sm mt-1">Documentación técnica y operativa</p>
            </div>
          </div>
          <p className="text-slate-300 mt-4 max-w-2xl">
            Toda la información técnica sobre cómo funciona Steve, qué datos accedemos, cómo los protegemos y nuestras integraciones.
          </p>
        </div>
      </div>

      <main className="flex-1 py-16">
        <div className="container max-w-4xl mx-auto px-6 space-y-8">
          {sections.map((section, idx) => {
            const Icon = section.icon;
            return (
              <section key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 sm:p-8">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${section.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
                  </div>
                  <p className="text-sm text-slate-500 mb-6 ml-[52px]">{section.description}</p>

                  <div className="space-y-3 ml-[52px]">
                    {section.items.map((item, i) => {
                      const isLink = item.value.startsWith('link:');
                      let content: React.ReactNode = item.value;
                      if (isLink) {
                        const parts = item.value.replace('link:', '').split(':');
                        const href = parts[0];
                        const text = parts.slice(1).join(':');
                        content = <Link to={href} className="text-primary hover:underline">{text}</Link>;
                      }
                      return (
                        <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
                          <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded shrink-0 mt-0.5">
                            {item.label}
                          </code>
                          <p className="text-sm text-slate-600">{content}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}

          {/* Contact */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-8 text-center">
            <h3 className="text-white font-bold text-lg mb-2">¿Necesitas más información?</h3>
            <p className="text-slate-400 text-sm mb-4">Contáctanos para consultas técnicas o comerciales.</p>
            <a
              href="mailto:jmbarros@bgconsult.cl"
              className="inline-flex items-center gap-2 bg-white text-slate-900 font-medium text-sm px-6 py-2.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              jmbarros@bgconsult.cl
            </a>
          </div>
        </div>
      </main>
      <SteveFooter />
    </div>
  );
}
