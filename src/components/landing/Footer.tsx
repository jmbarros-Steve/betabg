import { Terminal } from 'lucide-react';

export function Footer() {
  return (
    <footer className="py-12 border-t border-border">
      <div className="container px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold">
              BG<span className="text-primary">Consult</span>
            </span>
          </div>
          
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} BG Consult. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
