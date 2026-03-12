import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-1 py-16">
        <div className="container max-w-3xl mx-auto px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
          
          <h1 className="text-3xl font-bold mb-8">Política de Privacidad</h1>
          
          <div className="prose prose-slate max-w-none space-y-6 text-muted-foreground">
            <p className="text-sm text-muted-foreground">
              Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">1. Información que Recopilamos</h2>
              <p>
                Recopilamos información que usted nos proporciona directamente cuando:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Crea una cuenta en nuestra plataforma</li>
                <li>Conecta sus cuentas de Meta, Google o Shopify</li>
                <li>Se comunica con nosotros</li>
                <li>Utiliza nuestros servicios de consultoría</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">2. Uso de la Información</h2>
              <p>
                Utilizamos la información recopilada para:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Proporcionar, mantener y mejorar nuestros servicios</li>
                <li>Generar reportes y análisis de sus campañas publicitarias</li>
                <li>Comunicarnos con usted sobre actualizaciones y servicios</li>
                <li>Proteger contra actividades fraudulentas o ilegales</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">3. Acceso a Plataformas de Terceros</h2>
              <p>
                Cuando conecta su cuenta de Meta, Google o Shopify, accedemos a:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li><strong>Meta:</strong> Métricas de campañas publicitarias, gastos en anuncios, rendimiento de anuncios</li>
                <li><strong>Google Ads:</strong> Datos de campañas, costos, conversiones y métricas de rendimiento</li>
                <li><strong>Shopify:</strong> Datos de ventas, pedidos y métricas de comercio electrónico</li>
              </ul>
              <p className="mt-4">
                Esta información se utiliza exclusivamente para generar análisis y reportes para su negocio. 
                No vendemos ni compartimos estos datos con terceros.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">4. Seguridad de los Datos</h2>
              <p>
                Implementamos medidas de seguridad técnicas y organizativas para proteger su información, incluyendo:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Encriptación de datos en tránsito y en reposo</li>
                <li>Acceso restringido a información personal</li>
                <li>Monitoreo regular de nuestros sistemas</li>
                <li>Tokens de acceso seguros para integraciones de terceros</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">5. Retención de Datos</h2>
              <p>
                Conservamos su información mientras su cuenta esté activa o según sea necesario para proporcionarle servicios. 
                Puede solicitar la eliminación de sus datos en cualquier momento.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">6. Sus Derechos</h2>
              <p>
                Usted tiene derecho a:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Acceder a sus datos personales</li>
                <li>Corregir datos inexactos</li>
                <li>Solicitar la eliminación de sus datos</li>
                <li>Revocar el acceso a plataformas conectadas</li>
                <li>Obtener una copia de sus datos</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">7. Cookies y Tecnologías Similares</h2>
              <p>
                Utilizamos cookies y tecnologías similares para mantener su sesión activa y mejorar su experiencia en la plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">8. Cambios a esta Política</h2>
              <p>
                Podemos actualizar esta política de privacidad periódicamente. Le notificaremos sobre cambios significativos 
                publicando la nueva política en esta página.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">9. Contacto</h2>
              <p>
                Si tiene preguntas sobre esta Política de Privacidad, puede contactarnos a través de nuestros canales oficiales.
              </p>
            </section>
          </div>
        </div>
      </main>
      <SteveFooter />
    </div>
  );
}
