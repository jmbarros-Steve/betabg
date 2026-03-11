import { motion } from 'framer-motion';
import avatarSteve from '@/assets/avatar-steve.png';

interface SteveHeroProps {
  onOpenAuth: () => void;
}

export function SteveHero({ onOpenAuth }: SteveHeroProps) {
  return (
    <section className="relative bg-[#0F172A] overflow-hidden pt-24 pb-20 md:pt-32 md:pb-28">
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 mb-6">
              <span className="text-orange-400 text-sm font-medium">Plataforma de Marketing AI para E-commerce</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
              Marketing{' '}
              <span className="text-gradient">inteligente</span>{' '}
              para tu e-commerce
            </h1>

            <p className="text-slate-400 text-lg max-w-lg mb-8">
              Steve es tu consultor AI de marketing. Gestiona campanas, genera copies, analiza competidores y optimiza tu e-commerce desde un solo lugar.
            </p>

            <div className="flex flex-wrap gap-4 mb-8">
              <button
                onClick={onOpenAuth}
                className="px-6 py-3 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors text-sm"
              >
                Comenzar PRO &rarr;
              </button>
              <a
                href="#features"
                className="px-6 py-3 rounded-full border border-slate-500 text-white font-semibold hover:bg-white/5 transition-colors text-sm"
              >
                Ver Funcionalidades
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
              {['Todo incluido', 'Precio beta disponible', 'Setup en 5 min'].map((text) => (
                <span key={text} className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  {text}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            <div className="relative rotate-1">
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm ml-auto">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
                  <img src={avatarSteve} alt="Steve" className="w-10 h-10 rounded-full" />
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">Steve</p>
                    <p className="text-xs text-emerald-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      Online
                    </p>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="bg-slate-50 rounded-xl rounded-tl-sm px-4 py-2.5 text-slate-700 max-w-[85%]">
                    Hola! Soy Steve. Analice tus campanas y tengo 3 recomendaciones para mejorar tu ROAS.
                  </div>
                  <div className="bg-blue-600 rounded-xl rounded-tr-sm px-4 py-2.5 text-white max-w-[85%] ml-auto">
                    Que recomiendas?
                  </div>
                  <div className="bg-slate-50 rounded-xl rounded-tl-sm px-4 py-2.5 text-slate-700 max-w-[85%]">
                    <span className="flex items-center gap-1.5 text-emerald-600 font-medium mb-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" /></svg>
                      +32% ROAS estimado
                    </span>
                    Reasigna $200 del Ad Set 3 al Ad Set 1 que tiene mejor CTR...
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
