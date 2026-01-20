import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.jpg';

export function Navbar() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border"
    >
      <div className="container px-6 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="Consultoría BG" className="h-12 w-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a href="#servicios" className="text-sm uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
            Servicios
          </a>
          <a href="#contacto" className="text-sm uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
            Contacto
          </a>
        </div>

        <Link to="/auth">
          <Button variant="outline" size="sm" className="uppercase tracking-wider text-xs">
            Acceder
          </Button>
        </Link>
      </div>
    </motion.nav>
  );
}
