import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Terminal } from 'lucide-react';

export function Navbar() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border"
    >
      <div className="container px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xl font-bold">
            BG<span className="text-primary">Consult</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a href="#servicios" className="text-muted-foreground hover:text-foreground transition-colors">
            Servicios
          </a>
          <a href="#contacto" className="text-muted-foreground hover:text-foreground transition-colors">
            Contacto
          </a>
        </div>

        <Link to="/auth">
          <Button variant="outline" size="sm">
            Acceder
          </Button>
        </Link>
      </div>
    </motion.nav>
  );
}
