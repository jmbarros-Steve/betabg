import { motion } from 'framer-motion';
import { Dog, Briefcase, GraduationCap, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';

const NAVIGATION_OPTIONS = [
  {
    id: 'steve',
    title: 'Steve',
    subtitle: 'Tu Copiloto de Marketing',
    description: 'IA que aprende de tu marca y genera copies que venden. Metodología Sabri Suby + Russell Brunson.',
    icon: Dog,
    link: '/auth',
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10 hover:bg-amber-500/20',
    iconBg: 'bg-amber-500',
  },
  {
    id: 'servicios',
    title: 'Servicios Corporativos',
    subtitle: 'Performance Marketing',
    description: 'Meta Ads, Google Ads, Klaviyo, Shopify. Estrategias B2B y B2C para escalar tu negocio.',
    icon: Briefcase,
    link: '#servicios',
    color: 'from-blue-500 to-indigo-500',
    bgColor: 'bg-blue-500/10 hover:bg-blue-500/20',
    iconBg: 'bg-blue-500',
  },
  {
    id: 'estudios',
    title: 'Centro de Estudios',
    subtitle: 'Formación Especializada',
    description: 'Cursos, recursos y materiales de marketing digital para equipos y profesionales.',
    icon: GraduationCap,
    link: '/centro-estudios',
    color: 'from-emerald-500 to-teal-500',
    bgColor: 'bg-emerald-500/10 hover:bg-emerald-500/20',
    iconBg: 'bg-emerald-500',
  },
  {
    id: 'blog',
    title: 'Blog',
    subtitle: 'Insights & Tendencias',
    description: 'Artículos sobre marketing, copywriting, estrategias de conversión y casos de éxito.',
    icon: FileText,
    link: '/blog',
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10 hover:bg-purple-500/20',
    iconBg: 'bg-purple-500',
  },
];

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 pb-16">
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
          className="text-center max-w-4xl mx-auto mb-16"
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm uppercase tracking-super-wide text-primary mb-6"
          >
            Innovación — Marketing — Comercial
          </motion.p>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-light mb-6 leading-tight tracking-tight">
            <span className="text-foreground">Bienvenido a </span>
            <span className="text-primary font-medium">Consultoría BG</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed font-light">
            Elige cómo quieres trabajar con nosotros
          </p>
        </motion.div>

        {/* 4 Navigation Cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto"
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
              >
                <CardWrapper>
                  <Card className={`h-full cursor-pointer transition-all duration-300 border-2 hover:border-primary/30 hover:shadow-xl hover:-translate-y-1 ${option.bgColor}`}>
                    <CardContent className="p-6 flex flex-col h-full">
                      {/* Icon */}
                      <div className={`w-14 h-14 rounded-2xl ${option.iconBg} flex items-center justify-center mb-4`}>
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      
                      {/* Title & Subtitle */}
                      <h3 className="text-xl font-semibold mb-1">{option.title}</h3>
                      <p className="text-sm text-primary font-medium mb-3">{option.subtitle}</p>
                      
                      {/* Description */}
                      <p className="text-sm text-muted-foreground flex-grow mb-4">
                        {option.description}
                      </p>
                      
                      {/* CTA */}
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

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.8 }}
          className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto"
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
