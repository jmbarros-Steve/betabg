import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Video, FileText, Download } from 'lucide-react';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';

const resources = [
  {
    id: 1,
    title: 'Curso: Meta Ads desde cero',
    description: 'Aprende a crear y optimizar campañas en Facebook e Instagram desde el principio.',
    type: 'video',
    icon: Video,
    duration: '4 horas',
  },
  {
    id: 2,
    title: 'Guía: Estrategias de email marketing',
    description: 'Todo lo que necesitas saber sobre Klaviyo y automatización de emails.',
    type: 'guide',
    icon: BookOpen,
    duration: '45 min lectura',
  },
  {
    id: 3,
    title: 'Plantilla: Calendario de contenidos',
    description: 'Organiza tu estrategia de contenidos mensual con esta plantilla descargable.',
    type: 'template',
    icon: FileText,
    duration: 'Descarga',
  },
  {
    id: 4,
    title: 'Webinar: Escalamiento B2B',
    description: 'Estrategias avanzadas para generar leads y cerrar ventas en el sector B2B.',
    type: 'video',
    icon: Video,
    duration: '1.5 horas',
  },
  {
    id: 5,
    title: 'Checklist: Optimización Shopify',
    description: 'Los 50 puntos clave para optimizar tu tienda y mejorar conversiones.',
    type: 'template',
    icon: Download,
    duration: 'Descarga',
  },
  {
    id: 6,
    title: 'Curso: Google Ads avanzado',
    description: 'Domina las campañas de búsqueda, display y Performance Max.',
    type: 'video',
    icon: Video,
    duration: '6 horas',
  },
];

const typeColors = {
  video: 'bg-blue-500/10 text-blue-600',
  guide: 'bg-green-500/10 text-green-600',
  template: 'bg-purple-500/10 text-purple-600',
};

export default function CentroEstudios() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-32 pb-24">
        <div className="container px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Link to="/" className="inline-flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors mb-8">
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center mb-16"
          >
            <p className="text-xs uppercase tracking-super-wide text-primary mb-4">Aprende</p>
            <h1 className="text-4xl md:text-6xl font-light mb-4">
              Centro de <span className="text-primary font-medium">Estudios</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-light">
              Cursos, guías y recursos para dominar el performance marketing
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {resources.map((resource, index) => (
              <motion.div
                key={resource.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.1 }}
                className="group p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg ${typeColors[resource.type as keyof typeof typeColors]}`}>
                    <resource.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">
                    {resource.duration}
                  </span>
                </div>
                
                <h3 className="text-lg font-medium mb-2 text-foreground group-hover:text-primary transition-colors">
                  {resource.title}
                </h3>
                
                <p className="text-muted-foreground text-sm font-light mb-6 leading-relaxed">
                  {resource.description}
                </p>
                
                <Button variant="outline" size="sm" className="w-full uppercase tracking-wider text-xs">
                  {resource.type === 'template' ? 'Descargar' : 'Acceder'}
                </Button>
              </motion.div>
            ))}
          </div>

          {/* CTA Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-16 p-12 rounded-lg bg-card border border-border text-center"
          >
            <h2 className="text-2xl font-light mb-4">
              ¿Quieres acceso a <span className="text-primary font-medium">todos los recursos</span>?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto font-light">
              Conviértete en cliente de Consultoría BG y obtén acceso ilimitado a todos nuestros cursos, guías y plantillas.
            </p>
            <Link to="/auth">
              <Button variant="hero" size="lg" className="uppercase tracking-wider">
                Comenzar ahora
              </Button>
            </Link>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
