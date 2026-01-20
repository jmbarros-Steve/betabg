import { motion } from 'framer-motion';
import { Building2, TrendingUp } from 'lucide-react';
import logoKlaviyo from '@/assets/logo-klaviyo-clean.png';
import logoMeta from '@/assets/logo-meta-clean.png';
import logoShopify from '@/assets/logo-shopify-clean.png';

// Google Ads Logo
const GoogleAdsLogo = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
    <path d="M3.3 21.7c1.8 1.1 4.2.5 5.3-1.3L17.8 5.6c1.1-1.8.5-4.2-1.3-5.3-1.8-1.1-4.2-.5-5.3 1.3L2 16.4c-1.1 1.8-.5 4.2 1.3 5.3z" fill="#FBBC04"/>
    <path d="M20.7 21.7c-1.8 1.1-4.2.5-5.3-1.3L6.2 5.6c-1.1-1.8-.5-4.2 1.3-5.3 1.8-1.1 4.2-.5 5.3 1.3l9.2 14.8c1.1 1.8.5 4.2-1.3 5.3z" fill="#4285F4"/>
    <circle cx="6" cy="18" r="3.5" fill="#34A853"/>
  </svg>
);

const services = [
  {
    logo: logoMeta,
    title: 'Meta Performance',
    description: 'Campañas de alto rendimiento en Facebook e Instagram. Maximizamos tu ROAS con estrategias data-driven.',
  },
  {
    logo: 'googleAds',
    title: 'Google Performance',
    description: 'Domina los resultados de búsqueda con campañas SEM optimizadas y estrategias de conversión avanzadas.',
  },
  {
    logo: logoKlaviyo,
    title: 'Klaviyo Performance',
    description: 'Email marketing automatizado que convierte. Flujos personalizados y segmentación inteligente.',
  },
  {
    logo: logoShopify,
    title: 'Shopify Performance',
    description: 'Optimización completa de tu tienda Shopify. CRO, velocidad y experiencia de compra impecable.',
  },
  {
    icon: Building2,
    title: 'Escalamiento B2B',
    description: 'Estrategias de crecimiento para empresas B2B. Generación de leads y pipelines de ventas efectivos.',
  },
  {
    icon: TrendingUp,
    title: 'Estrategias de Escalamiento',
    description: 'Planes de crecimiento personalizados. Escalamos tu negocio de forma sostenible y rentable.',
  },
];

export function ServicesSection() {
  return (
    <section id="servicios" className="py-24 relative bg-card">
      <div className="container px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-xs uppercase tracking-super-wide text-primary mb-4">Lo que hacemos</p>
          <h2 className="text-3xl md:text-5xl font-light mb-4">
            Nuestros <span className="text-primary font-medium">Servicios</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-light">
            Soluciones de performance marketing para escalar tu negocio
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              whileHover={{ y: -5 }}
              className="group relative p-8 rounded-lg bg-background border border-border hover:border-primary/50 transition-all duration-300"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-lg border-2 border-primary/30 flex items-center justify-center mb-6 group-hover:border-primary/60 transition-colors bg-white overflow-hidden p-2">
                  {service.logo === 'googleAds' ? (
                    <GoogleAdsLogo />
                  ) : service.logo ? (
                    <img 
                      src={service.logo} 
                      alt={service.title} 
                      className="w-full h-full object-contain"
                    />
                  ) : service.icon ? (
                    <service.icon className="w-7 h-7 text-primary" />
                  ) : null}
                </div>
                
                <h3 className="text-lg font-medium mb-3 text-foreground tracking-wide">{service.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm font-light">{service.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
