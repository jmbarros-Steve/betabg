import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, User, ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

const blogPosts = [
  {
    id: 1,
    title: 'Cómo optimizar tus campañas de Meta Ads en 2026',
    excerpt: 'Descubre las mejores estrategias para maximizar tu ROAS y escalar tus campañas de Facebook e Instagram.',
    author: 'Consultoría BG',
    date: '15 Ene 2026',
    category: 'Meta Ads',
  },
  {
    id: 2,
    title: 'Guía completa de Klaviyo para e-commerce',
    excerpt: 'Aprende a crear flujos de email marketing automatizados que conviertan y fidelicen a tus clientes.',
    author: 'Consultoría BG',
    date: '10 Ene 2026',
    category: 'Klaviyo',
  },
  {
    id: 3,
    title: 'Shopify Performance: CRO y velocidad',
    excerpt: 'Las claves para optimizar tu tienda Shopify y mejorar la experiencia de compra de tus usuarios.',
    author: 'Consultoría BG',
    date: '5 Ene 2026',
    category: 'Shopify',
  },
  {
    id: 4,
    title: 'Estrategias de escalamiento B2B efectivas',
    excerpt: 'Cómo generar leads cualificados y construir pipelines de ventas para empresas B2B.',
    author: 'Consultoría BG',
    date: '1 Ene 2026',
    category: 'B2B',
  },
];

export default function Blog() {
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
            <p className="text-xs uppercase tracking-super-wide text-primary mb-4">Recursos</p>
            <h1 className="text-4xl md:text-6xl font-light mb-4">
              <span className="text-primary font-medium">Blog</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-light">
              Artículos, guías y estrategias de performance marketing
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {blogPosts.map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.1 }}
                className="group p-8 rounded-lg bg-card border border-border hover:border-primary/50 transition-all duration-300"
              >
                <div className="flex items-center gap-4 mb-4">
                  <span className="px-3 py-1 text-xs uppercase tracking-widest bg-primary/10 text-primary rounded-full">
                    {post.category}
                  </span>
                </div>
                
                <h2 className="text-xl font-medium mb-3 text-foreground group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                
                <p className="text-muted-foreground text-sm font-light mb-6 leading-relaxed">
                  {post.excerpt}
                </p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {post.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {post.date}
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
        </div>
      </main>

      <Footer />
    </div>
  );
}
