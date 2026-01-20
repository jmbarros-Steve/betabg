import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/landing/Footer';

export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 py-16">
        <div className="container max-w-3xl px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
          
          <h1 className="text-3xl font-bold mb-8">Eliminación de Datos</h1>
          
          <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
            <p className="text-sm text-muted-foreground">
              Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">1. Su Derecho a la Eliminación de Datos</h2>
              <p>
                De acuerdo con las regulaciones de protección de datos aplicables (incluyendo GDPR y normativas locales), 
                usted tiene derecho a solicitar la eliminación de sus datos personales de nuestra plataforma en cualquier momento.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">2. Datos que se Eliminarán</h2>
              <p>
                Cuando solicite la eliminación de sus datos, eliminaremos:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Su información de cuenta (nombre, correo electrónico, contraseña)</li>
                <li>Datos de clientes asociados a su cuenta</li>
                <li>Conexiones de plataformas (Meta, Google, Shopify)</li>
                <li>Tokens de acceso y credenciales almacenadas</li>
                <li>Métricas y reportes históricos</li>
                <li>Entradas de tiempo y facturas</li>
                <li>Cualquier otro dato personal asociado a su cuenta</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">3. Cómo Solicitar la Eliminación</h2>
              <p>
                Puede solicitar la eliminación de sus datos de las siguientes maneras:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>
                  <strong>Por correo electrónico:</strong> Envíe un correo a{' '}
                  <a href="mailto:privacidad@consultoriabg.com" className="text-primary hover:underline">
                    privacidad@consultoriabg.com
                  </a>{' '}
                  con el asunto "Solicitud de Eliminación de Datos"
                </li>
                <li>
                  <strong>Desde su cuenta:</strong> Acceda a la configuración de su cuenta y seleccione "Eliminar mi cuenta"
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">4. Proceso de Eliminación</h2>
              <p>
                Una vez recibida su solicitud:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Verificaremos su identidad para proteger sus datos</li>
                <li>Procesaremos su solicitud dentro de 30 días hábiles</li>
                <li>Le enviaremos una confirmación cuando la eliminación esté completa</li>
                <li>Revocaremos automáticamente los accesos a plataformas de terceros conectadas</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">5. Datos que Podemos Retener</h2>
              <p>
                Algunos datos pueden ser retenidos por obligaciones legales o regulatorias, incluyendo:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Registros de facturación (requeridos por ley fiscal)</li>
                <li>Logs de seguridad (para prevención de fraude)</li>
                <li>Datos anonimizados para análisis estadístico</li>
              </ul>
              <p className="mt-4">
                Estos datos retenidos serán eliminados una vez expire el período de retención legal aplicable.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">6. Eliminación de Datos de Facebook/Meta</h2>
              <p>
                Si ha conectado su cuenta de Facebook o Meta a nuestra plataforma, al solicitar la eliminación de datos:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Eliminaremos todos los tokens de acceso de Meta almacenados</li>
                <li>Borraremos las métricas publicitarias obtenidas de Meta</li>
                <li>Revocaremos los permisos de nuestra aplicación en su cuenta de Meta</li>
              </ul>
              <p className="mt-4">
                También puede revocar el acceso directamente desde la{' '}
                <a 
                  href="https://www.facebook.com/settings?tab=applications" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  configuración de aplicaciones de Facebook
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">7. Contacto</h2>
              <p>
                Si tiene preguntas sobre la eliminación de sus datos, puede contactarnos:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>
                  Email:{' '}
                  <a href="mailto:privacidad@consultoriabg.com" className="text-primary hover:underline">
                    privacidad@consultoriabg.com
                  </a>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}