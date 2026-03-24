import { motion } from 'framer-motion';
import { Dog, Briefcase, GraduationCap, FileText, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

const NAVIGATION_OPTIONS = [
  {
    id: 'steve',
    title: 'Steve',
    subtitle: 'Tu Copiloto de Marketing',
    description: 'IA que aprende de tu marca y genera copies que venden. Metodología Sabri Suby + Russell Brunson.',
    icon: Dog,
    link: '/steve',
  },
  {
    id: 'servicios',
    title: 'Servicios Corporativos',
    subtitle: 'Consultoría de Escalamiento',
    description: 'Pricing, costos, contabilidad, gestión de leads, campañas de marketing y más.',
    icon: Briefcase,
    link: '/servicios-corporativos',
  },
  {
    id: 'estudios',
    title: 'Centro de Estudios',
    subtitle: 'Formación Especializada',
    description: 'Cursos, recursos y materiales de marketing digital para equipos y profesionales.',
    icon: GraduationCap,
    link: '/centro-estudios',
  },
  {
    id: 'blog',
    title: 'Blog',
    subtitle: 'Insights & Tendencias',
    description: 'Artículos sobre marketing, copywriting, estrategias de conversión y casos de éxito.',
    icon: FileText,
    link: '/blog',
  },
];

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16">
      <div className="container relative z-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <p className="text-sm font-medium text-muted-foreground mb-6">
            Innovación — Marketing — Comercial
          </p>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium mb-6 leading-tight tracking-tight text-foreground">
            Bienvenido a{' '}
            <span className="text-primary">Steve</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Elige cómo quieres trabajar con nosotros
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto"
        >
          {NAVIGATION_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            const isInternalLink = option.link.startsWith('/');

            const CardWrapper = ({ children }: { children: React.ReactNode }) =>
              isInternalLink ? (
                <Link to={option.link} className="block h-full">
                  {children}
                </Link>
              ) : (
                <a href={option.link} className="block h-full">
                  {children}
                </a>
              );

            return (
              <motion.div
                key={option.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.08 }}
              >
                <CardWrapper>
                  <Card className="h-full cursor-pointer transition-all duration-200 border hover:border-primary/40 hover:shadow-md">
                    <CardContent className="p-6 flex flex-col h-full">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>

                      <h3 className="text-lg font-semibold mb-1 text-foreground">{option.title}</h3>
                      <p className="text-sm text-primary/70 font-medium mb-3">{option.subtitle}</p>

                      <p className="text-sm text-muted-foreground flex-grow mb-4">
                        {option.description}
                      </p>

                      <div className="flex items-center text-sm font-medium text-primary">
                        <span>Explorar</span>
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </div>
                    </CardContent>
                  </Card>
                </CardWrapper>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
