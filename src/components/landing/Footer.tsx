import { Link } from 'react-router-dom';
import logo from '@/assets/logo.jpg';

export function Footer() {
  return (
    <footer className="py-12 border-t border-border bg-card">
      <div className="container px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <img src={logo} alt="Steve" className="h-10 w-auto" />
          
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            <Link to="/privacidad" className="text-muted-foreground hover:text-foreground transition-colors">
              Política de Privacidad
            </Link>
            <span className="text-muted-foreground/50">|</span>
            <Link to="/terminos" className="text-muted-foreground hover:text-foreground transition-colors">
              Condiciones del Servicio
            </Link>
            <span className="text-muted-foreground/50">|</span>
            <Link to="/eliminacion-datos" className="text-muted-foreground hover:text-foreground transition-colors">
              Eliminación de Datos
            </Link>
          </div>
          
          <p className="text-sm font-medium text-muted-foreground">
            © {new Date().getFullYear()} Steve
          </p>
        </div>
      </div>
    </footer>
  );
}