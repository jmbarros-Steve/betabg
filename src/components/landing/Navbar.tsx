import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Dog, Briefcase, GraduationCap, FileText } from 'lucide-react';
import logo from '@/assets/logo.jpg';

const navLinks = [
  { name: 'Steve', to: '/steve', icon: Dog },
  { name: 'Corporativo', to: '/servicios-corporativos', icon: Briefcase },
  { name: 'Estudios', to: '/centro-estudios', icon: GraduationCap },
  { name: 'Blog', to: '/blog', icon: FileText },
];

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
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link 
                key={link.name}
                to={link.to} 
                className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
              >
                <Icon className="w-4 h-4" />
                {link.name}
              </Link>
            );
          })}
        </div>

        <Link to="/auth">
          <button className="text-sm uppercase tracking-wider text-xs text-muted-foreground hover:text-primary transition-colors">
            Acceder
          </button>
        </Link>
      </div>
    </motion.nav>
  );
}
