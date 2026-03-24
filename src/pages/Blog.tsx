import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, User, ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/landing/Navbar';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface BlogPost {
  id: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  created_at: string;
}

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    // Use RPC or raw query to access the public view that excludes user_id
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, title, excerpt, content, category, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPosts(data);
    }
    setLoading(false);
  };

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
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition-colors mb-8">
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
            <p className="text-sm font-medium text-blue-600 mb-4">Recursos</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              Blog
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-light">
              Artículos, guías y estrategias de performance marketing
            </p>
          </motion.div>

          {loading ? (
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse p-8 rounded-lg bg-card border border-border h-64" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-lg border border-border">
              <p className="text-muted-foreground">No hay artículos publicados aún</p>
              <p className="text-sm text-muted-foreground mt-1">Vuelve pronto para ver nuevo contenido</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {posts.map((post, index) => (
                <motion.article
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.1 }}
                  className="group p-8 rounded-xl bg-white border border-slate-200 card-hover transition-all duration-300"
                >
                  <div className="flex items-center gap-4 mb-4">
                    {post.category && (
                      <span className="px-3 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                        {post.category}
                      </span>
                    )}
                  </div>
                  
                  <h2 className="text-xl font-medium mb-3 text-foreground group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                  
                  {post.excerpt && (
                    <p className="text-muted-foreground text-sm font-light mb-6 leading-relaxed">
                      {post.excerpt}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Steve
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(post.created_at), 'd MMM yyyy', { locale: es })}
                      </span>
                    </div>
                    
                    <button className="flex items-center gap-1 text-sm text-primary hover:gap-2 transition-all">
                      Leer más
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </div>
      </main>

      <SteveFooter />
    </div>
  );
}
