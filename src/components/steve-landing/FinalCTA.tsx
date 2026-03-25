import { useReveal } from '@/hooks/useReveal';
import avatarSteve from '@/assets/avatar-steve.png';

interface FinalCTAProps {
  onOpenAuth: () => void;
}

export function FinalCTA({ onOpenAuth }: FinalCTAProps) {
  const ref = useReveal();

  return (
    <section className="bg-[#0F172A] py-20 md:py-28">
      <div ref={ref} className="reveal max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-600 shadow-lg">
            <img src={avatarSteve} alt="Steve" className="w-full h-full object-cover" />
          </div>
        </div>

        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Tu marketing merece ser{' '}
          <span className="text-gradient">inteligente</span>
        </h2>
        <p className="text-slate-400 max-w-lg mx-auto mb-8">
          Únete a los equipos de e-commerce que ya usan Steve para crecer más rápido.
        </p>

        <div className="flex flex-col items-center gap-4">
          <a
            href="https://meetings.hubspot.com/jose-manuel15"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3.5 rounded-full bg-[#1E3A7B] text-white font-semibold hover:bg-[#162D5F] transition-colors text-sm shadow-lg shadow-[#1E3A7B]/25"
          >
            Agenda una reunión &rarr;
          </a>
          <a
            href="https://wa.me/15559061514?text=Hola%20Steve%20%F0%9F%90%95"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-400 hover:text-[#25D366] transition-colors flex items-center gap-1.5"
          >
            O escríbele directo por WhatsApp &rarr;
          </a>
        </div>
      </div>
    </section>
  );
}
