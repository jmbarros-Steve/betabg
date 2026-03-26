import { useReveal } from '@/hooks/useReveal';

import amabile from '@/assets/clients/amabile.png';
import mundolimpio from '@/assets/clients/mundolimpio.png';
import vallesecreto from '@/assets/clients/vallesecreto.png';
import timejobs from '@/assets/clients/timejobs.png';
import razaspet from '@/assets/clients/razaspet.png';
import piged from '@/assets/clients/piged.png';
import puntiferrer from '@/assets/clients/puntiferrer.png';
import lasoluzione from '@/assets/clients/lasoluzione.png';
import telapijamas from '@/assets/clients/telapijamas.png';
import moretta from '@/assets/clients/moretta.png';
import arueda from '@/assets/clients/arueda.png';
import jardindeeva from '@/assets/clients/jardindeeva.png';
import badim from '@/assets/clients/badim.png';
import crazydiamond from '@/assets/clients/crazydiamond.png';
import ateliertelas from '@/assets/clients/ateliertelas.png';

const logos = [
  amabile, mundolimpio, vallesecreto, timejobs, razaspet,
  piged, puntiferrer, lasoluzione, telapijamas, moretta,
  arueda, jardindeeva, badim, crazydiamond, ateliertelas,
];

export function ClientLogosSection() {
  const ref = useReveal();

  return (
    <section className="bg-white py-20 md:py-24 overflow-hidden">
      <div ref={ref} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#1E3A7B] mb-3">
            Social Proof
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            +100 clientes han confiado en Steve
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Marcas que ya usan Steve para potenciar su marketing digital.
          </p>
        </div>

        {/* Marquee row 1 — left to right */}
        <div className="relative mb-6">
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
          <div className="flex animate-marquee-left gap-12 items-center">
            {[...logos, ...logos].map((logo, i) => (
              <div
                key={i}
                className="flex-shrink-0 h-16 w-36 flex items-center justify-center grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
              >
                <img
                  src={logo}
                  alt=""
                  className="max-h-14 max-w-full object-contain"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Marquee row 2 — right to left */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
          <div className="flex animate-marquee-right gap-12 items-center">
            {[...logos.slice().reverse(), ...logos.slice().reverse()].map((logo, i) => (
              <div
                key={i}
                className="flex-shrink-0 h-16 w-36 flex items-center justify-center grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
              >
                <img
                  src={logo}
                  alt=""
                  className="max-h-14 max-w-full object-contain"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
