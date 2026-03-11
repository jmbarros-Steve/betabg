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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border"
    >
      <div className="container px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="Consultoría BG" className="h-10 w-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.name}
                to={link.to}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon className="w-4 h-4" />
                {link.name}
              </Link>
            );
          })}
        </div>

        <Link
          to="/auth"
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Acceder
        </Link>
      </div>
    </motion.nav>
  );
}
