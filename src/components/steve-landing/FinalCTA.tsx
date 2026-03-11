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
          Unete a los equipos de e-commerce que ya usan Steve para crecer mas rapido.
        </p>

        <button
          onClick={onOpenAuth}
          className="px-8 py-3.5 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors text-sm shadow-lg shadow-blue-600/25"
        >
          Comenzar PRO &rarr;
        </button>
      </div>
    </section>
  );
}
