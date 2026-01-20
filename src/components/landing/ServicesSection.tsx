import { motion } from 'framer-motion';
import { Building2, TrendingUp } from 'lucide-react';

// Meta (Facebook) Logo - Blue "f"
const MetaLogo = () => (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

// Google Ads Logo
const GoogleAdsLogo = () => (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
    <path d="M3.3 21.7c1.8 1.1 4.2.5 5.3-1.3L17.8 5.6c1.1-1.8.5-4.2-1.3-5.3-1.8-1.1-4.2-.5-5.3 1.3L2 16.4c-1.1 1.8-.5 4.2 1.3 5.3z" fill="#FBBC04"/>
    <path d="M20.7 21.7c-1.8 1.1-4.2.5-5.3-1.3L6.2 5.6c-1.1-1.8-.5-4.2 1.3-5.3 1.8-1.1 4.2-.5 5.3 1.3l9.2 14.8c1.1 1.8.5 4.2-1.3 5.3z" fill="#4285F4"/>
    <circle cx="6" cy="18" r="3.5" fill="#34A853"/>
  </svg>
);

// Klaviyo Logo - Green K
const KlaviyoLogo = () => (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
    <rect width="24" height="24" rx="4" fill="#2B2B2B"/>
    <path d="M6 18V6h2.5v5l4.5-5h3L11.5 11l5 7h-3l-3.5-5-2 2.2V18H6z" fill="#3DDB84"/>
  </svg>
);

// Shopify Logo - Green bag with S
const ShopifyLogo = () => (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
    <path d="M20.5 6.5c-.03-.17-.18-.28-.35-.29-.17-.01-3.65-.07-3.65-.07s-2.42-2.35-2.68-2.61c-.26-.26-.77-.18-.97-.12-.02 0-.54.17-1.38.43-.82-2.37-2.27-4.55-4.83-4.55-.07 0-.14 0-.21.01-.72-.95-1.61-1.37-2.38-1.37-5.89 0-8.69 7.37-9.57 11.11-.97.3-1.65.51-1.74.54-.54.17-.56.19-.63.7C2.04 10.72 0 26.95 0 26.95l16.34 2.83 8.83-2.21S20.54 6.67 20.5 6.5zM14.17 5.08l-2.18.67c0-.07 0-.14 0-.21 0-1.08-.15-1.95-.4-2.64 1 .19 1.67 1.26 2.08 2.18h.5zm-3.62 1.11l-3.29 1.02c.32-1.22 1.18-2.42 2.12-3.04.35-.24.85-.5 1.43-.64-.37.78-.59 1.87-.59 2.66h.33v.01-.01zm-1.99-3.85c.47 0 .87.16 1.23.48-1.35.64-2.8 2.26-3.42 5.49l-2.59.8c.72-2.45 2.44-6.77 4.78-6.77z" fill="#95BF47"/>
    <path d="M20.15 6.21c-.17-.01-3.65-.07-3.65-.07s-2.42-2.35-2.68-2.61c-.1-.1-.23-.15-.37-.17l-1.22 25.05 8.83-2.21S20.54 6.67 20.5 6.5c-.03-.17-.18-.28-.35-.29z" fill="#5E8E3E"/>
    <path d="M12.79 9.45l-1.24 3.69s-1.09-.58-2.42-.58c-1.96 0-2.05 1.23-2.05 1.54 0 1.69 4.4 2.34 4.4 6.3 0 3.12-1.98 5.12-4.64 5.12-3.2 0-4.84-1.99-4.84-1.99l.86-2.83s1.68 1.45 3.1 1.45c.93 0 1.31-.73 1.31-1.27 0-2.21-3.61-2.31-3.61-5.93 0-3.05 2.19-6 6.6-6 1.7 0 2.53.49 2.53.49z" fill="#fff"/>
  </svg>
);

const services = [
  {
    icon: MetaLogo,
    title: 'Meta Performance',
    description: 'Campañas de alto rendimiento en Facebook e Instagram. Maximizamos tu ROAS con estrategias data-driven.',
  },
  {
    icon: GoogleAdsLogo,
    title: 'Google Performance',
    description: 'Domina los resultados de búsqueda con campañas SEM optimizadas y estrategias de conversión avanzadas.',
  },
  {
    icon: KlaviyoLogo,
    title: 'Klaviyo Performance',
    description: 'Email marketing automatizado que convierte. Flujos personalizados y segmentación inteligente.',
  },
  {
    icon: ShopifyLogo,
    title: 'Shopify Performance',
    description: 'Optimización completa de tu tienda Shopify. CRO, velocidad y experiencia de compra impecable.',
  },
  {
    icon: Building2,
    title: 'Escalamiento B2B',
    description: 'Estrategias de crecimiento para empresas B2B. Generación de leads y pipelines de ventas efectivos.',
    isLucide: true,
  },
  {
    icon: TrendingUp,
    title: 'Estrategias de Escalamiento',
    description: 'Planes de crecimiento personalizados. Escalamos tu negocio de forma sostenible y rentable.',
    isLucide: true,
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
                <div className={`w-14 h-14 rounded-lg border-2 border-primary/30 flex items-center justify-center mb-6 group-hover:border-primary/60 transition-colors ${service.isLucide ? '' : 'bg-white'}`}>
                  {service.isLucide ? (
                    <service.icon className="w-6 h-6 text-primary" />
                  ) : (
                    <service.icon />
                  )}
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
