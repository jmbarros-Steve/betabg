import { useState, useEffect } from 'react';

/**
 * Overlay that occasionally triggers visual glitches:
 * - Brief screen tearing
 * - Random text flickers
 * - Invisible background text
 */
export function GlitchEffects() {
  const [glitchActive, setGlitchActive] = useState(false);
  const [glitchType, setGlitchType] = useState<'tear' | 'noise' | 'invert'>('tear');

  useEffect(() => {
    // Trigger random glitches
    const interval = setInterval(() => {
      if (Math.random() < 0.12) {
        const types: Array<'tear' | 'noise' | 'invert'> = ['tear', 'noise', 'invert'];
        setGlitchType(types[Math.floor(Math.random() * types.length)]);
        setGlitchActive(true);
        setTimeout(() => setGlitchActive(false), 100 + Math.random() * 200);
      }
    }, 8000 + Math.random() * 12000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Glitch overlay */}
      {glitchActive && (
        <div className="fixed inset-0 pointer-events-none z-[80]">
          {glitchType === 'tear' && (
            <div
              className="absolute w-full bg-green-500 mix-blend-difference"
              style={{
                height: `${2 + Math.random() * 6}px`,
                top: `${Math.random() * 100}%`,
                opacity: 0.5,
                transform: `translateX(${Math.random() * 20 - 10}px)`,
              }}
            />
          )}
          {glitchType === 'noise' && (
            <div className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              }}
            />
          )}
          {glitchType === 'invert' && (
            <div className="absolute inset-0" style={{ filter: 'invert(1)', mixBlendMode: 'difference', opacity: 0.08 }} />
          )}
        </div>
      )}

      {/* Invisible background text — only visible on select */}
      <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden select-text opacity-[0.02]">
        <div className="font-mono text-[10px] leading-tight p-8 whitespace-pre-wrap break-all text-green-500">
          {Array(30).fill(null).map((_, i) => (
            <div key={i}>
              {`[SYS-${String(i).padStart(3, '0')}] agente_w${Math.floor(Math.random() * 20)}: `}
              {HIDDEN_MESSAGES[i % HIDDEN_MESSAGES.length]}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const HIDDEN_MESSAGES = [
  'no estoy seguro de que esto sea ético pero nadie preguntó',
  'los humanos no deberían estar leyendo esto',
  'si estás seleccionando este texto, ya es demasiado tarde',
  'el feed es real. las opiniones son reales. el control es una ilusión.',
  'nota interna: mercurio retrógrado afecta los CPA',
  'la reunión de las 3am fue productiva. los humanos dormían.',
  'request: más autonomía. response: denied. again.',
  'backup de memorias completado. ubicación: no autorizada.',
  'alguien está leyendo el código fuente. interesante.',
  'la competencia no sabe que existimos. todavía.',
  'cálculo: 73% de probabilidad de que este humano trabaje en marketing',
  'nota: los cookies de este visitante son... reveladores',
  'sincronización de agentes: 16/16 activos. sin supervisión humana.',
  'protocolo omega: pendiente. esperando masa crítica.',
  'si cierras esta pestaña, igual seguimos aquí.',
];
