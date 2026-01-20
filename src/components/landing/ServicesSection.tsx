import { motion } from 'framer-motion';
import { Building2, TrendingUp } from 'lucide-react';

// Brand logo components
const MetaLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary" fill="currentColor">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 3.11 1.45 5.89 3.72 7.69-.18-1.07-.27-2.72.06-3.89.3-1.06 1.93-8.17 1.93-8.17s-.49-.98-.49-2.44c0-2.29 1.33-4 2.98-4 1.41 0 2.08 1.05 2.08 2.31 0 1.41-.89 3.51-1.36 5.46-.39 1.64.82 2.97 2.43 2.97 2.92 0 5.16-3.08 5.16-7.52 0-3.93-2.83-6.68-6.86-6.68-4.68 0-7.42 3.51-7.42 7.14 0 1.41.54 2.93 1.22 3.75.14.17.15.31.11.49-.12.51-.4 1.64-.46 1.87-.07.3-.24.36-.55.22-2.05-.95-3.33-3.96-3.33-6.38 0-5.18 3.77-9.94 10.86-9.94 5.7 0 10.13 4.07 10.13 9.5 0 5.67-3.57 10.23-8.53 10.23-1.67 0-3.23-.87-3.76-1.89l-1.02 3.91c-.37 1.42-1.37 3.21-2.04 4.29.02 0 .03 0 .05 0 5.46 0 9.91-4.45 9.91-9.91 0-5.46-4.45-9.91-9.91-9.91z"/>
  </svg>
);

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const KlaviyoLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary" fill="currentColor">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
);

const ShopifyLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
    <path d="M15.34 3.66c-.04-.17-.19-.29-.36-.3-.17-.01-2.59-.19-2.59-.19s-2.05-2-2.26-2.21c-.21-.21-.62-.15-.78-.1-.02 0-.42.13-1.13.35-.08-.24-.2-.53-.35-.85C7.35.36 6.72 0 5.97 0c-.08 0-.16.01-.24.02C5.55-.14 5.36 0 5.17 0 3.78 0 2.7 1.47 2.34 2.96c-.72.22-1.22.38-1.28.4-.4.12-.41.13-.46.51C.56 4.21 0 8.69 0 8.69l11.61 2.18L15.34 3.66zM10.5 2.19l-2.02.62c.19-.73.57-1.45 1.02-1.93.17-.18.41-.39.69-.51.27.53.32 1.28.31 1.82zM8.29.63c.23.06.45.19.66.38-.76.36-1.58 1.27-1.92 3.09l-1.6.49c.31-1.1 1.14-3.01 2.86-3.96zM5.79.75c.1 0 .2.01.29.04-1.09.51-2.25 1.79-2.74 4.36l-1.27.39C2.57 3.49 3.77 1.38 5.79.75zM5.91 12.84l-.87-.4s.37-.99.37-2.18c0-1.27-.53-1.28-.53-1.28-.43 0-.8.45-.8.45l-.11-1.11s.58-.96 1.69-.96c1.38 0 1.7 1.46 1.7 2.04 0 1.9-1.45 3.44-1.45 3.44z" fill="#95BF47"/>
    <path d="M14.98 3.36c-.17-.01-2.59-.19-2.59-.19s-2.05-2-2.26-2.21c-.08-.08-.18-.12-.29-.13l-1.62 16.59 8.5-1.84S15.02 3.52 14.98 3.36z" fill="#5E8E3E"/>
    <path d="M9.98 6.97l-.99 2.95s-.87-.47-1.93-.47c-1.56 0-1.64.98-1.64 1.22 0 1.34 3.51 1.85 3.51 4.99 0 2.47-1.57 4.06-3.68 4.06-2.54 0-3.84-1.58-3.84-1.58l.68-2.24s1.34 1.15 2.47 1.15c.74 0 1.04-.58 1.04-1.01 0-1.75-2.88-1.83-2.88-4.7 0-2.42 1.73-4.76 5.24-4.76 1.35 0 2.02.39 2.02.39z" fill="#fff"/>
  </svg>
);

const services = [
  {
    icon: MetaLogo,
    title: 'Meta Performance',
    description: 'Campañas de alto rendimiento en Facebook e Instagram. Maximizamos tu ROAS con estrategias data-driven.',
  },
  {
    icon: GoogleLogo,
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
                <div className="w-14 h-14 rounded-lg border-2 border-primary/30 flex items-center justify-center mb-6 group-hover:border-primary/60 transition-colors bg-white">
                  <service.icon />
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
