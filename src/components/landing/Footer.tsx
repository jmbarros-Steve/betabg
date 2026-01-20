import logo from '@/assets/logo.jpg';

export function Footer() {
  return (
    <footer className="py-12 border-t border-border bg-card">
      <div className="container px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={logo} alt="Consultoría BG" className="h-10 w-auto" />
          
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            © {new Date().getFullYear()} Consultoría BG. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
