import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, Trash2, Cookie, Mail } from 'lucide-react';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';

export default function PrivacyPolicy() {
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
              <Shield className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Política de Privacidad</h1>
              <p className="text-slate-400 text-sm mt-1">Steve Ads — BG Consult SpA</p>
            </div>
          </div>
          <p className="text-slate-300 mt-4 max-w-2xl">
            Tu privacidad es nuestra prioridad. Esta política describe cómo recopilamos, utilizamos y protegemos tu información personal.
          </p>
          <p className="text-slate-500 text-sm mt-4">
            Última actualización: 27 de marzo de 2026
          </p>
        </div>
      </div>

      <main className="flex-1 py-16">
        <div className="container max-w-4xl mx-auto px-6">
          <div className="space-y-12">

            {/* Section 1 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">1. Información que Recopilamos</h2>
              </div>
              <p className="text-slate-600 mb-4">Recopilamos información que nos proporcionas directamente al utilizar nuestros servicios:</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-800 text-sm mb-2">Datos de cuenta</h3>
                  <ul className="text-sm text-slate-600 space-y-1.5">
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">-</span>Nombre y correo electrónico</li>
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">-</span>Nombre de tu empresa o tienda</li>
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">-</span>Contraseña (encriptada)</li>
                  </ul>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-800 text-sm mb-2">Datos de integraciones</h3>
                  <ul className="text-sm text-slate-600 space-y-1.5">
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">-</span>Tokens OAuth de Shopify, Meta y Google</li>
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">-</span>Métricas de ventas y campañas</li>
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">-</span>Datos de productos e inventario</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">2. Cómo Utilizamos tu Información</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  'Proporcionar y mantener nuestros servicios de marketing AI',
                  'Generar reportes y análisis de tus campañas publicitarias',
                  'Crear copias publicitarias personalizadas con IA',
                  'Sincronizar métricas de Shopify, Meta Ads y Google Ads',
                  'Comunicarnos contigo sobre actualizaciones del servicio',
                  'Proteger contra actividades fraudulentas o uso indebido',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
                    <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-emerald-600 text-xs font-bold">{i + 1}</span>
                    </div>
                    <p className="text-sm text-slate-600">{item}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 3 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-violet-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">3. Acceso a Plataformas de Terceros</h2>
              </div>
              <p className="text-slate-600 mb-6">Cuando conectas tus cuentas, accedemos exclusivamente a los datos necesarios para brindarte el servicio:</p>
              <div className="space-y-4">
                {[
                  { name: 'Shopify', color: 'bg-green-50 text-green-700 border-green-200', desc: 'Métricas de ventas, pedidos, productos, inventario, carros abandonados y datos de fulfillment.' },
                  { name: 'Meta Ads', color: 'bg-blue-50 text-blue-700 border-blue-200', desc: 'Métricas de campañas publicitarias, gastos en anuncios, rendimiento de creatividades e insights de audiencia.' },
                  { name: 'Google Ads', color: 'bg-amber-50 text-amber-700 border-amber-200', desc: 'Datos de campañas, costos, conversiones, keywords y métricas de rendimiento.' },
                  { name: 'Klaviyo', color: 'bg-purple-50 text-purple-700 border-purple-200', desc: 'Listas de contactos, métricas de email marketing, flows y rendimiento de campañas de correo.' },
                ].map((platform) => (
                  <div key={platform.name} className="flex items-start gap-4 p-4 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${platform.color}`}>{platform.name}</span>
                    <p className="text-sm text-slate-600">{platform.desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium">No vendemos ni compartimos tus datos con terceros. Tu información se utiliza exclusivamente para generar análisis y recomendaciones para tu negocio.</p>
              </div>
            </section>

            {/* Section 4 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">4. Seguridad de los Datos</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { title: 'Encriptación AES-256', desc: 'Tokens de acceso y credenciales encriptados en reposo y en tránsito.' },
                  { title: 'Row Level Security', desc: 'Cada usuario solo puede acceder a sus propios datos mediante RLS en base de datos.' },
                  { title: 'OAuth 2.0 seguro', desc: 'Validación HMAC con comparación timing-safe y protección CSRF con nonce.' },
                  { title: 'Monitoreo continuo', desc: 'Health checks automatizados cada 4 horas y alertas en tiempo real.' },
                ].map((item) => (
                  <div key={item.title} className="bg-slate-50 rounded-lg p-4">
                    <h3 className="font-semibold text-slate-800 text-sm mb-1">{item.title}</h3>
                    <p className="text-sm text-slate-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 5 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">5. Retención y Eliminación de Datos</h2>
              </div>
              <p className="text-slate-600 mb-4">
                Conservamos tu información mientras tu cuenta esté activa. Al desinstalar la app o cerrar tu cuenta:
              </p>
              <ul className="space-y-3">
                {[
                  'Tu token de acceso se revoca y elimina inmediatamente.',
                  'Los datos de tu tienda se eliminan dentro de las 48 horas siguientes.',
                  'Cumplimos con los webhooks GDPR de Shopify (shop/redact, customers/redact, customers/data_request).',
                  'Puedes solicitar la eliminación manual de tus datos en cualquier momento.',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                    <div className="h-5 w-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-amber-700 text-xs font-bold">{i + 1}</span>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            {/* Section 6 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-cyan-50 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-cyan-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">6. Tus Derechos</h2>
              </div>
              <p className="text-slate-600 mb-4">Tienes derecho a:</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  'Acceder a todos tus datos personales almacenados',
                  'Corregir información inexacta o desactualizada',
                  'Solicitar la eliminación completa de tus datos',
                  'Revocar el acceso a cualquier plataforma conectada',
                  'Exportar una copia de tus datos en formato estándar',
                  'Oponerte al procesamiento de tus datos',
                ].map((right, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 shrink-0" />
                    {right}
                  </div>
                ))}
              </div>
            </section>

            {/* Section 7 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center">
                  <Cookie className="h-5 w-5 text-orange-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">7. Cookies y Tecnologías Similares</h2>
              </div>
              <p className="text-slate-600 text-sm">
                Utilizamos cookies esenciales para mantener tu sesión activa y garantizar el funcionamiento de la plataforma.
                No utilizamos cookies de seguimiento de terceros ni publicidad dirigida. Las cookies de sesión se eliminan
                automáticamente al cerrar el navegador o cuando tu sesión expira.
              </p>
            </section>

            {/* Section 8 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-indigo-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">8. Contacto</h2>
              </div>
              <p className="text-slate-600 text-sm mb-4">
                Si tienes preguntas sobre esta Política de Privacidad o deseas ejercer alguno de tus derechos, contáctanos:
              </p>
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <p className="text-slate-700"><span className="font-medium">Empresa:</span> BG Consult SpA</p>
                <p className="text-slate-700"><span className="font-medium">Email:</span> jmbarros@bgconsult.cl</p>
                <p className="text-slate-700"><span className="font-medium">Sitio web:</span> www.steve.cl</p>
              </div>
            </section>

          </div>
        </div>
      </main>
      <SteveFooter />
    </div>
  );
}
