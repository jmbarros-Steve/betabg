import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, User, ArrowRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Navbar } from '@/components/landing/Navbar';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';
import { supabase } from '@/integrations/supabase/client';

interface BlogPost {
  id: string;
  slug: string | null;
  title: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  created_at: string;
}

const WORDS_PER_MINUTE = 200;

function calcReadTime(content: string | null): number {
  if (!content) return 1;
  const trimmed = content.trim();
  if (!trimmed) return 1;
  const words = trimmed.split(/\s+/).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    const fetchPost = async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, slug, title, excerpt, content, category, created_at')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('[BlogPost] fetch error:', error);
        setNotFound(true);
      } else if (!data) {
        setNotFound(true);
      } else {
        setPost(data);
      }
      setLoading(false);
    };

    fetchPost();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="pt-32 pb-24">
          <div className="container px-6 max-w-3xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-slate-200 rounded w-32" />
              <div className="h-12 bg-slate-200 rounded w-full" />
              <div className="h-12 bg-slate-200 rounded w-2/3" />
              <div className="h-6 bg-slate-200 rounded w-1/2 mt-8" />
              <div className="space-y-3 mt-12">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-4 bg-slate-200 rounded" />
                ))}
              </div>
            </div>
          </div>
        </main>
        <SteveFooter />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="pt-32 pb-24">
          <div className="container px-6 max-w-3xl mx-auto text-center">
            <h1 className="text-3xl font-bold text-slate-900 mb-4">Artículo no encontrado</h1>
            <p className="text-muted-foreground mb-8">
              El artículo que buscas no existe o fue removido.
            </p>
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 text-[#1E3A7B] hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al blog
            </Link>
          </div>
        </main>
        <SteveFooter />
      </div>
    );
  }

  const readTime = calcReadTime(post.content);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="pt-32 pb-24">
        <div className="container px-6 max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#1E3A7B] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al blog
            </Link>
          </motion.div>

          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-12"
          >
            {post.category && (
              <span className="inline-block px-3 py-1 text-xs font-medium bg-[#F0F4FA] text-[#162D5F] rounded-full mb-6">
                {post.category}
              </span>
            )}
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight tracking-tight mb-6">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="text-xl text-slate-600 leading-relaxed font-light mb-8">
                {post.excerpt}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-6 border-t border-slate-200 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Steve
              </span>
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {format(new Date(post.created_at), "d 'de' MMMM yyyy", { locale: es })}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {readTime} min de lectura
              </span>
            </div>
          </motion.header>

          <motion.article
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="prose prose-slate prose-lg max-w-none
              prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-slate-900
              prose-h2:text-3xl prose-h2:mt-16 prose-h2:mb-6 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-200
              prose-h3:text-xl prose-h3:mt-10 prose-h3:mb-4
              prose-p:text-slate-700 prose-p:leading-relaxed
              prose-strong:text-slate-900 prose-strong:font-semibold
              prose-a:text-[#1E3A7B] prose-a:no-underline hover:prose-a:underline
              prose-blockquote:border-l-4 prose-blockquote:border-[#1E3A7B] prose-blockquote:bg-[#F0F4FA] prose-blockquote:py-1 prose-blockquote:px-6 prose-blockquote:not-italic prose-blockquote:font-medium prose-blockquote:text-slate-800 prose-blockquote:rounded-r-lg
              prose-table:border prose-table:border-slate-200 prose-table:rounded-lg prose-table:overflow-hidden
              prose-th:bg-[#F0F4FA] prose-th:text-[#162D5F] prose-th:font-semibold prose-th:text-sm prose-th:uppercase prose-th:tracking-wide prose-th:px-5 prose-th:py-3
              prose-td:px-5 prose-td:py-3 prose-td:border-t prose-td:border-slate-200 prose-td:text-slate-700
              prose-li:text-slate-700 prose-li:marker:text-[#1E3A7B]
              prose-hr:border-slate-200"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {post.content || ''}
            </ReactMarkdown>
          </motion.article>

          <motion.aside
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-20"
          >
            <div className="rounded-2xl bg-gradient-to-br from-[#1E3A7B] to-[#162D5F] p-10 text-center text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-32 translate-x-32" />
              <div className="relative z-10">
                <p className="text-xs font-semibold tracking-widest text-blue-200 uppercase mb-3">
                  Por qué construimos Steve
                </p>
                <h3 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
                  Performance Marketing para tu PYME, no para clientes Fortune 1000.
                </h3>
                <p className="text-blue-100 mb-8 max-w-xl mx-auto leading-relaxed">
                  Steve conecta Meta Ads, Google Ads, Email, WhatsApp y Shopify en una sola
                  plataforma. Cobra según uso. La data se queda contigo.
                </p>
                <Link
                  to="/agendar/steve"
                  className="inline-flex items-center gap-2 bg-white text-[#1E3A7B] px-7 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
                >
                  Agenda 20 minutos
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </motion.aside>
        </div>
      </main>

      <SteveFooter />
    </div>
  );
}
