import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Video, FileText, Download, Lock } from 'lucide-react';
import { Navbar } from '@/components/landing/Navbar';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface StudyResource {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  resource_type: string;
  duration: string | null;
}

const typeIcons: Record<string, React.ElementType> = {
  video: Video,
  guide: BookOpen,
  article: FileText,
  template: Download,
  webinar: Video,
};

const typeColors: Record<string, string> = {
  video: 'bg-blue-500/10 text-blue-600',
  guide: 'bg-green-500/10 text-green-600',
  article: 'bg-purple-500/10 text-purple-600',
  template: 'bg-orange-500/10 text-orange-600',
  webinar: 'bg-pink-500/10 text-pink-600',
};

export default function CentroEstudios() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [resources, setResources] = useState<StudyResource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      // User not logged in, show login prompt
      setLoading(false);
      return;
    }
    
    if (user) {
      fetchResources();
    }
  }, [user, authLoading]);

  const fetchResources = async () => {
    const { data, error } = await supabase
      .from('study_resources')
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false });

    if (!error) {
      setResources(data || []);
    }
    setLoading(false);
  };

  // Show login required screen
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        
        <main className="pt-32 pb-24">
          <div className="container px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md mx-auto text-center"
            >
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-10 h-10 text-primary" />
              </div>
              
              <h1 className="text-3xl font-light mb-4">
                Centro de <span className="text-primary font-medium">Estudios</span>
              </h1>
              
              <p className="text-muted-foreground mb-8 font-light">
                Accede a cursos, guías y recursos exclusivos de performance marketing. 
                Inicia sesión o crea una cuenta para ver el contenido.
              </p>
              
              <div className="flex flex-col gap-4">
                <Link to="/auth">
                  <Button variant="hero" size="lg" className="w-full text-sm font-medium">
                    Iniciar Sesión / Registrarse
                  </Button>
                </Link>
                <p className="text-sm text-muted-foreground">
                  ¿No tienes cuenta? Podrás crear una gratis en la siguiente página
                </p>
                <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Volver al inicio
                </Link>
              </div>
            </motion.div>
          </div>
        </main>

        <SteveFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      
      <main className="pt-32 pb-24">
        <div className="container px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-8">
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
            <p className="text-sm font-medium text-primary mb-4">Aprende</p>
            <h1 className="text-4xl md:text-6xl font-light mb-4">
              Centro de <span className="text-primary font-medium">Estudios</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-light">
              Cursos, guías y recursos para dominar el performance marketing
            </p>
          </motion.div>

          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="animate-pulse p-6 bg-white border border-slate-200 rounded-xl h-48" />
              ))}
            </div>
          ) : resources.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
              <p className="text-muted-foreground">No hay recursos publicados aún</p>
              <p className="text-sm text-muted-foreground mt-1">Vuelve pronto para ver nuevo contenido</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {resources.map((resource, index) => {
                const Icon = typeIcons[resource.resource_type] || FileText;
                const colorClass = typeColors[resource.resource_type] || 'bg-gray-500/10 text-gray-600';
                
                return (
                  <motion.div
                    key={resource.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + index * 0.1 }}
                    className="group p-6 bg-white border border-slate-200 rounded-xl hover:border-primary/50 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-lg ${colorClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      {resource.duration && (
                        <span className="text-sm font-medium text-muted-foreground">
                          {resource.duration}
                        </span>
                      )}
                    </div>
                    
                    <h3 className="text-lg font-medium mb-2 text-foreground group-hover:text-primary transition-colors">
                      {resource.title}
                    </h3>
                    
                    {resource.description && (
                      <p className="text-muted-foreground text-sm font-light mb-6 leading-relaxed">
                        {resource.description}
                      </p>
                    )}
                    
                    <Button variant="outline" size="sm" className="w-full text-sm font-medium">
                      Acceder
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <SteveFooter />
    </div>
  );
}
