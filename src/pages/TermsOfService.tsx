export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background py-16">
      <div className="container max-w-3xl px-6">
        <h1 className="text-3xl font-bold mb-8">Términos de Servicio</h1>
        
        <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
          <p className="text-sm text-muted-foreground">
            Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">1. Aceptación de los Términos</h2>
            <p>
              Al acceder y utilizar los servicios de Consultoría BG, usted acepta estar sujeto a estos Términos de Servicio. 
              Si no está de acuerdo con alguna parte de estos términos, no podrá acceder al servicio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">2. Descripción del Servicio</h2>
            <p>
              Consultoría BG proporciona servicios de consultoría en marketing digital, incluyendo pero no limitado a:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Gestión y análisis de campañas publicitarias en Meta (Facebook/Instagram)</li>
              <li>Gestión y análisis de campañas en Google Ads</li>
              <li>Análisis de métricas de Shopify</li>
              <li>Estrategias de marketing B2B</li>
              <li>Reportes y dashboards de rendimiento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">3. Uso del Servicio</h2>
            <p>
              Usted se compromete a utilizar el servicio únicamente para fines legales y de acuerdo con estos términos. 
              Queda prohibido:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Usar el servicio de manera que viole cualquier ley aplicable</li>
              <li>Intentar acceder a datos de otros usuarios sin autorización</li>
              <li>Interferir con el funcionamiento normal del servicio</li>
              <li>Compartir credenciales de acceso con terceros no autorizados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">4. Cuentas de Usuario</h2>
            <p>
              Para acceder a ciertas funciones del servicio, deberá crear una cuenta. Usted es responsable de:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Mantener la confidencialidad de su contraseña</li>
              <li>Todas las actividades que ocurran bajo su cuenta</li>
              <li>Notificarnos inmediatamente sobre cualquier uso no autorizado</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">5. Propiedad Intelectual</h2>
            <p>
              El servicio y su contenido original, características y funcionalidad son propiedad de Consultoría BG 
              y están protegidos por leyes de propiedad intelectual.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">6. Limitación de Responsabilidad</h2>
            <p>
              Consultoría BG no será responsable por daños indirectos, incidentales, especiales, consecuentes o punitivos, 
              incluyendo pérdida de beneficios, datos u otras pérdidas intangibles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">7. Modificaciones</h2>
            <p>
              Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor 
              inmediatamente después de su publicación en esta página.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">8. Contacto</h2>
            <p>
              Para cualquier pregunta sobre estos Términos de Servicio, contáctenos a través de nuestros canales oficiales.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
