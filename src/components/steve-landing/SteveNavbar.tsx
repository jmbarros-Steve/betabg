import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import logoSteve from '@/assets/logo-steve.png';

interface SteveNavbarProps {
  user: User | null;
  isAdmin: boolean;
  isClient: boolean;
  onOpenAuth: () => void;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}

export function SteveNavbar({ user, isAdmin, isClient, onOpenAuth, onNavigate, onSignOut }: SteveNavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-200'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2">
            <img
              src={logoSteve}
              alt="Steve"
              className={`h-8 w-8 rounded-lg transition-all ${scrolled ? '' : 'brightness-0 invert'}`}
            />
            <span className={`font-bold text-lg transition-colors ${scrolled ? 'text-slate-900' : 'text-white'}`}>
              Steve
            </span>
          </button>

          <div className="hidden md:flex items-center gap-8">
            <Link
              to="/funcionalidades"
              className={`text-sm font-medium transition-colors hover:text-[#1E3A7B] ${
                scrolled ? 'text-slate-600' : 'text-slate-300 hover:text-white'
              }`}
            >
              Funcionalidades
            </Link>
            <Link
              to="/social"
              className={`text-sm font-medium transition-colors hover:text-[#1E3A7B] ${
                scrolled ? 'text-slate-600' : 'text-slate-300 hover:text-white'
              }`}
            >
              Social
            </Link>
            {[
              { label: 'Integraciones', href: '#integraciones' },
              { label: 'Plataforma', href: '#planes' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-[#1E3A7B] ${
                  scrolled ? 'text-slate-600' : 'text-slate-300 hover:text-white'
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <button
                  onClick={() => onNavigate(isAdmin ? '/dashboard' : '/portal')}
                  className="text-sm font-medium px-4 py-2 rounded-full bg-[#1E3A7B] text-white hover:bg-[#162D5F] transition-colors"
                >
                  Ir al Panel
                </button>
                <button
                  onClick={onSignOut}
                  className={`text-sm font-medium transition-colors ${scrolled ? 'text-slate-500 hover:text-slate-700' : 'text-slate-400 hover:text-white'}`}
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onOpenAuth}
                  className={`text-sm font-medium transition-colors ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-slate-300 hover:text-white'}`}
                >
                  Iniciar Sesion
                </button>
                <a
                  href="https://meetings.hubspot.com/jose-manuel15"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium px-4 py-2 rounded-full bg-[#1E3A7B] text-white hover:bg-[#162D5F] transition-colors"
                >
                  Agenda una reunión
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
