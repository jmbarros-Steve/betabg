import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
      
      {/* Decorative elements */}
      <div className="absolute top-1/3 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      
      <div className="container relative z-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-4xl mx-auto"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm uppercase tracking-super-wide text-primary mb-6"
          >
            Innovación — Marketing — Comercial
          </motion.p>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-light mb-6 leading-tight tracking-tight">
            <span className="text-foreground">Impulsamos tu </span>
            <span className="text-primary font-medium">crecimiento digital</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed font-light">
            Consultoría BG ofrece soluciones de performance marketing para escalar tu negocio. 
            Meta, Google, Klaviyo, Shopify y estrategias B2B.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth">
              <Button variant="hero" size="xl" className="uppercase tracking-wider">
                Panel de Control
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <a href="#servicios">
              <Button variant="heroOutline" size="xl" className="uppercase tracking-wider">
                Ver Servicios
              </Button>
            </a>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto"
        >
          {[
            { value: '5+', label: 'Años de experiencia' },
            { value: '50+', label: 'Proyectos completados' },
            { value: '100%', label: 'Clientes satisfechos' },
            { value: '24/7', label: 'Soporte disponible' },
          ].map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl md:text-4xl font-light text-primary mb-1">{stat.value}</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
