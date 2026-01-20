import { motion } from 'framer-motion';
import { Facebook, Search, Mail, ShoppingBag, Building2, TrendingUp } from 'lucide-react';

const services = [
  {
    icon: Facebook,
    title: 'Meta Performance',
    description: 'Campañas de alto rendimiento en Facebook e Instagram. Maximizamos tu ROAS con estrategias data-driven.',
  },
  {
    icon: Search,
    title: 'Google Performance',
    description: 'Domina los resultados de búsqueda con campañas SEM optimizadas y estrategias de conversión avanzadas.',
  },
  {
    icon: Mail,
    title: 'Klaviyo Performance',
    description: 'Email marketing automatizado que convierte. Flujos personalizados y segmentación inteligente.',
  },
  {
    icon: ShoppingBag,
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
    <section id="servicios" className="py-24 relative">
      <div className="container px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Nuestros <span className="text-primary">Servicios</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
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
              whileHover={{ y: -5, scale: 1.02 }}
              className="group relative p-8 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all duration-300"
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="relative">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                  <service.icon className="w-7 h-7 text-primary" />
                </div>
                
                <h3 className="text-xl font-semibold mb-3 text-foreground">{service.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{service.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
