import { motion } from 'framer-motion';
import { Code2, Database, Cloud, Cog, Shield, LineChart } from 'lucide-react';

const services = [
  {
    icon: Code2,
    title: 'Desarrollo de Software',
    description: 'Arquitectura y desarrollo de aplicaciones modernas, escalables y mantenibles.',
  },
  {
    icon: Database,
    title: 'Gestión de Datos',
    description: 'Diseño de bases de datos, ETL, y estrategias de gestión de información.',
  },
  {
    icon: Cloud,
    title: 'Cloud & DevOps',
    description: 'Migración a la nube, infraestructura como código y pipelines CI/CD.',
  },
  {
    icon: Cog,
    title: 'Automatización',
    description: 'Automatización de procesos empresariales para maximizar eficiencia.',
  },
  {
    icon: Shield,
    title: 'Seguridad IT',
    description: 'Auditorías de seguridad, implementación de mejores prácticas y compliance.',
  },
  {
    icon: LineChart,
    title: 'Consultoría Estratégica',
    description: 'Asesoramiento técnico para toma de decisiones y roadmaps tecnológicos.',
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
            Soluciones integrales para cada etapa de tu transformación digital
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
