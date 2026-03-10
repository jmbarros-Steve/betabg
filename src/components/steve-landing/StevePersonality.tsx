import { useReveal } from '@/hooks/useReveal';
import avatarSteve from '@/assets/avatar-steve.png';

const sampleQuestions = [
  'Como puedo mejorar mi ROAS en Meta?',
  'Genera 5 headlines para mi nueva coleccion',
  'Analiza los anuncios de mi competidor',
];

export function StevePersonality() {
  const ref = useReveal();

  return (
    <section className="bg-slate-50 py-20 md:py-28">
      <div ref={ref} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-64 h-64 md:w-80 md:h-80 rounded-full bg-gradient-to-br from-blue-100 to-orange-50 flex items-center justify-center overflow-hidden shadow-xl">
                <img src={avatarSteve} alt="Steve" className="w-56 h-56 md:w-72 md:h-72 object-cover rounded-full" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-white rounded-full px-3 py-1.5 shadow-lg border border-slate-200">
                <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Online 24/7
                </span>
              </div>
            </div>
          </div>

          {/* Text */}
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Conoce a Steve
            </h2>
            <p className="text-slate-500 mb-4 leading-relaxed">
              Steve es un bulldog ingles AI especialista en marketing digital para e-commerce. No es un chatbot generico — esta entrenado con estrategias reales de Meta Ads, Google Ads, Shopify y Klaviyo.
            </p>
            <p className="text-slate-500 mb-6 leading-relaxed">
              Piensa en el como tu director de marketing personal que trabaja 24/7 y siempre tiene datos frescos de tus campanas.
            </p>

            <div className="space-y-2 mb-6">
              <p className="text-sm font-medium text-slate-700 mb-3">Prueba preguntarle:</p>
              <div className="flex flex-wrap gap-2">
                {sampleQuestions.map((q) => (
                  <span
                    key={q}
                    className="inline-block px-3 py-1.5 rounded-full bg-white border border-slate-200 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors cursor-default"
                  >
                    "{q}"
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {[
                { emoji: '🎯', label: 'Estrategia' },
                { emoji: '📊', label: 'Analytics' },
                { emoji: '✍️', label: 'Copywriting' },
                { emoji: '🔍', label: 'Competencia' },
              ].map((badge) => (
                <span key={badge.label} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                  {badge.emoji} {badge.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
