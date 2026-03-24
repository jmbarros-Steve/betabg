import { Link } from 'react-router-dom';
import logoSteve from '@/assets/logo-steve.png';

const columns = [
  {
    title: 'Producto',
    links: [
      { label: 'Chat AI', href: '#features' },
      { label: 'Copies Ads', href: '#features' },
      { label: 'Analytics', href: '#features' },
      { label: 'Precios', href: '#planes' },
    ],
  },
  {
    title: 'Integraciones',
    links: [
      { label: 'Shopify', href: '#integraciones' },
      { label: 'Meta Ads', href: '#integraciones' },
      { label: 'Google Ads', href: '#integraciones' },
      { label: 'Klaviyo', href: '#integraciones' },
    ],
  },
  {
    title: 'Recursos',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Preguntas Frecuentes', href: '/faq' },
      { label: 'Soporte', href: 'mailto:jmbarros@bgconsult.cl' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Política de Privacidad', href: '/privacidad' },
      { label: 'Términos de Servicio', href: '/terminos' },
      { label: 'Eliminación de Datos', href: '/eliminacion-datos' },
    ],
  },
];

export function SteveFooter() {
  return (
    <footer className="bg-[#0F172A] border-t border-slate-800 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Logo col */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <img src={logoSteve} alt="Steve" className="h-8 w-8 rounded-lg brightness-0 invert" />
              <span className="font-bold text-white">Steve</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              Marketing AI para e-commerce. Tu consultor digital 24/7.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-semibold text-slate-300 text-sm mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link
                        to={link.href}
                        className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-600">
            &copy; {new Date().getFullYear()} Steve Ads. Todos los derechos reservados.
          </p>
          <p className="text-xs text-slate-600">
            Hecho con AI por Steve
          </p>
        </div>
      </div>
    </footer>
  );
}
