import { useState, useEffect, useRef } from 'react';
function useCountUp(end: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  const ref = useRef<number>();

  useEffect(() => {
    if (!start) return;
    let startTime: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        ref.current = requestAnimationFrame(step);
      }
    };
    ref.current = requestAnimationFrame(step);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [end, duration, start]);

  return count;
}

const stats = [
  { value: 500, suffix: '+', label: 'Copies Generados', description: 'Headlines, textos y descripciones' },
  { value: 24, suffix: '/7', label: 'Disponibilidad', description: 'Steve nunca duerme' },
  { value: 4, suffix: '', label: 'Plataformas', description: 'Shopify, Meta, Google, Klaviyo' },
  { value: 5, suffix: ' min', prefix: '<', label: 'Setup', description: 'De registro a primera consulta' },
];

export function StatsSection() {
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible');
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Individual hook calls to follow Rules of Hooks (stats array is static)
  const count0 = useCountUp(stats[0].value, 1500, inView);
  const count1 = useCountUp(stats[1].value, 1500, inView);
  const count2 = useCountUp(stats[2].value, 1500, inView);
  const count3 = useCountUp(stats[3].value, 1500, inView);
  const counts = [count0, count1, count2, count3];

  return (
    <section className="bg-[#0F172A] py-20 md:py-24">
      <div ref={sectionRef} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {stats.map((stat, i) => (
            <div key={stat.label} className="text-center">
              <p className="text-4xl md:text-5xl font-bold text-white mb-2">
                {stat.prefix || ''}{counts[i]}{stat.suffix}
              </p>
              <p className="text-sm font-medium text-slate-300 mb-1">{stat.label}</p>
              <p className="text-xs text-slate-500">{stat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
