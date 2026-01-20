import { motion } from 'framer-motion';
import { 
  Building2, TrendingUp, DollarSign, Calculator, 
  BarChart3, Users, Megaphone, Target, Rocket, PieChart
} from 'lucide-react';
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

const marketingServices = [
  {
    logo: logoMeta,
    title: 'Meta Ads',
    description: 'Campañas de alto rendimiento en Facebook e Instagram. Maximizamos tu ROAS con estrategias data-driven.',
  },
  {
    logo: 'googleAds',
    title: 'Google Ads',
    description: 'Domina los resultados de búsqueda con campañas SEM optimizadas y estrategias de conversión avanzadas.',
  },
  {
    logo: logoKlaviyo,
    title: 'Klaviyo',
    description: 'Email marketing automatizado que convierte. Flujos personalizados y segmentación inteligente.',
  },
  {
    logo: logoShopify,
    title: 'Shopify',
    description: 'Optimización completa de tu tienda Shopify. CRO, velocidad y experiencia de compra impecable.',
  },
];

const consultingServices = [
  {
    icon: DollarSign,
    title: 'Pricing Estratégico',
    description: 'Definimos precios que maximizan márgenes sin sacrificar conversión. Análisis de elasticidad y posicionamiento.',
  },
  {
    icon: Calculator,
    title: 'Análisis de Costos',
    description: 'Identificamos ineficiencias y optimizamos estructura de costos para mejorar rentabilidad operativa.',
  },
  {
    icon: PieChart,
    title: 'Contabilidad de Gestión',
    description: 'Reportes financieros accionables. Dashboards de KPIs y análisis de punto de equilibrio.',
  },
  {
    icon: Rocket,
    title: 'Escalamiento',
    description: 'Planes de crecimiento sostenible. Automatización de procesos y expansión a nuevos mercados.',
  },
  {
    icon: Users,
    title: 'Gestión de Leads',
    description: 'CRM optimizado, scoring de leads y pipelines de ventas que convierten prospectos en clientes.',
  },
  {
    icon: Megaphone,
    title: 'Campañas de Marketing',
    description: 'Estrategias 360° que integran todos los canales. Branding, contenido y performance unidos.',
  },
];

const stats = [
  { value: '5+', label: 'Años de experiencia' },
  { value: '50+', label: 'Proyectos completados' },
  { value: '100%', label: 'Clientes satisfechos' },
  { value: '24/7', label: 'Soporte disponible' },
];

export function ServicesSection() {
  return (
    <section id="servicios" className="py-24 relative bg-card">
      <div className="container px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-xs uppercase tracking-super-wide text-primary mb-4">Lo que hacemos</p>
          <h2 className="text-3xl md:text-5xl font-light mb-4">
            Consultoría de <span className="text-primary font-medium">Escalamiento</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-light">
            Soluciones integrales para hacer crecer tu negocio de forma sostenible y rentable
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto mb-20"
        >
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl md:text-4xl font-light text-primary mb-1">{stat.value}</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Consulting Services */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <h3 className="text-xl font-medium text-center mb-8 flex items-center justify-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Consultoría Empresarial
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {consultingServices.map((service, index) => (
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
                  <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                    <service.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h4 className="text-lg font-medium mb-3 text-foreground tracking-wide">{service.title}</h4>
                  <p className="text-muted-foreground leading-relaxed text-sm font-light">{service.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Marketing Services */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h3 className="text-xl font-medium text-center mb-8 flex items-center justify-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Marketing Digital
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {marketingServices.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                whileHover={{ y: -5 }}
                className="group relative p-6 rounded-lg bg-background border border-border hover:border-primary/50 transition-all duration-300"
              >
                <div className="relative">
                  <div className="w-14 h-14 rounded-lg border-2 border-primary/30 flex items-center justify-center mb-4 group-hover:border-primary/60 transition-colors bg-white overflow-hidden p-2">
                    {service.logo === 'googleAds' ? (
                      <GoogleAdsLogo />
                    ) : (
                      <img 
                        src={service.logo} 
                        alt={service.title} 
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                  <h4 className="text-base font-medium mb-2 text-foreground tracking-wide">{service.title}</h4>
                  <p className="text-muted-foreground leading-relaxed text-sm font-light">{service.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
