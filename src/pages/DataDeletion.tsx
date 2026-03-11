import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Mail, Clock, Trash2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';

export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-1 py-16">
        <div className="container max-w-3xl px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>

          {/* Header con branding */}
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Solicitud de Eliminacion de Datos</h1>
          </div>
          <p className="text-muted-foreground mb-8">
            Steve Ads — Plataforma de Marketing AI por Consultoria BG
          </p>

          <div className="space-y-6 text-muted-foreground">
            <p className="text-sm text-muted-foreground">
              Ultima actualizacion: 28 de febrero de 2026
            </p>

            {/* Card de solicitud destacada */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-6">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-full bg-primary/10 shrink-0">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground mb-2">Como solicitar la eliminacion de tus datos</h2>
                    <p className="mb-3">
                      Envia un correo electronico a{' '}
                      <a href="mailto:jmbarros@bgconsult.cl" className="text-primary font-medium hover:underline">
                        jmbarros@bgconsult.cl
                      </a>{' '}
                      con el asunto <strong className="text-foreground">"Solicitud de Eliminacion de Datos"</strong>.
                    </p>
                    <p className="text-sm">
                      Incluye en tu correo: tu nombre completo, el email asociado a tu cuenta en Steve Ads,
                      y si deseas eliminacion total o parcial de tus datos.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Plazo */}
            <Card>
              <CardContent className="py-5">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-full bg-yellow-500/10 shrink-0">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground mb-1">Plazo de respuesta: 30 dias</h3>
                    <p className="text-sm">
                      Procesaremos tu solicitud dentro de un maximo de 30 dias habiles desde la recepcion.
                      Recibiras una confirmacion por email cuando la eliminacion se haya completado.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Datos que se eliminan */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Datos que se eliminaran
              </h2>
              <p className="mb-4">
                Al solicitar la eliminacion, se borran permanentemente todos los datos asociados a tu cuenta:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Informacion de tu cuenta (nombre, email, contrasena)</li>
                <li>Datos de clientes y campanas publicitarias</li>
                <li>Conexiones a plataformas (Meta Ads, Google Ads, Shopify, Klaviyo)</li>
                <li>Tokens de acceso y credenciales encriptadas</li>
                <li>Metricas, reportes e historiales de rendimiento</li>
                <li>Creativos publicitarios, borradores y assets generados</li>
                <li>Conversaciones con el asistente Steve AI</li>
                <li>Analisis de competencia y audiencias guardadas</li>
                <li>Cualquier otro dato personal vinculado a tu cuenta</li>
              </ul>
            </section>

            {/* Datos de Meta/Facebook */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Eliminacion de datos de Facebook / Meta</h2>
              <p className="mb-4">
                Si conectaste tu cuenta de Facebook o Meta Ads a Steve Ads, al solicitar la eliminacion:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Eliminaremos todos los tokens de acceso de Meta almacenados (encriptados con AES-256)</li>
                <li>Borraremos las metricas publicitarias obtenidas de tu cuenta de Meta Ads</li>
                <li>Eliminaremos audiencias, creativos y configuraciones de campanas</li>
                <li>Revocaremos los permisos de nuestra aplicacion en tu cuenta de Meta</li>
              </ul>
              <p className="mt-4">
                Tambien puedes revocar el acceso directamente desde la{' '}
                <a
                  href="https://www.facebook.com/settings?tab=applications"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  configuracion de aplicaciones de Facebook
                </a>.
              </p>
            </section>

            {/* Datos retenidos */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Datos que podemos retener
              </h2>
              <p className="mb-4">
                Por obligaciones legales o regulatorias, algunos datos pueden ser retenidos temporalmente:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Registros de facturacion (requeridos por ley fiscal chilena — SII)</li>
                <li>Logs de seguridad para prevencion de fraude (maximo 90 dias)</li>
                <li>Datos anonimizados para analisis estadistico agregado</li>
              </ul>
              <p className="mt-4">
                Estos datos seran eliminados automaticamente una vez expire el periodo de retencion legal aplicable.
              </p>
            </section>

            {/* Proceso */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Proceso de eliminacion</h2>
              <ol className="list-decimal pl-6 space-y-2">
                <li>Envias tu solicitud por email a <a href="mailto:jmbarros@bgconsult.cl" className="text-primary hover:underline">jmbarros@bgconsult.cl</a></li>
                <li>Verificamos tu identidad para proteger tus datos</li>
                <li>Procesamos la eliminacion dentro de 30 dias habiles</li>
                <li>Revocamos automaticamente los accesos a plataformas de terceros</li>
                <li>Te enviamos confirmacion por email cuando este completo</li>
              </ol>
            </section>

            {/* Contacto */}
            <section className="pb-8">
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">Contacto</h2>
              <p>
                Si tienes preguntas sobre la eliminacion de tus datos o sobre nuestra politica de privacidad:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>
                  Email:{' '}
                  <a href="mailto:jmbarros@bgconsult.cl" className="text-primary hover:underline">
                    jmbarros@bgconsult.cl
                  </a>
                </li>
                <li>
                  Politica de Privacidad:{' '}
                  <Link to="/privacidad" className="text-primary hover:underline">
                    Ver politica completa
                  </Link>
                </li>
                <li>
                  Terminos de Servicio:{' '}
                  <Link to="/terminos" className="text-primary hover:underline">
                    Ver terminos
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <SteveFooter />
    </div>
  );
}
