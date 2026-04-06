import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import avatarSteve from '@/assets/avatar-steve.png';

// Frases editables del header
const HEADER_LINES = [
  'El futuro del marketing e-commerce ya está aquí.',
  'Estamos abriendo cupos limitados.',
  'Sumate al waitlist y sé de los primeros en recibir acceso.',
];

const waitlistSchema = z.object({
  firstName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  lastName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  email: z.string().trim().email('Email inválido').max(255),
  ecommerceUrl: z
    .string()
    .trim()
    .min(3, 'URL requerida')
    .transform((val) => (/^https?:\/\//i.test(val) ? val : `https://${val}`))
    .pipe(z.string().url('URL inválida')),
});

type WaitlistFormData = z.infer<typeof waitlistSchema>;

export function WaitlistModal() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WaitlistFormData>({
    resolver: zodResolver(waitlistSchema),
  });

  const onSubmit = async (data: WaitlistFormData) => {
    setServerError(null);
    try {
      const { error } = await (supabase as any).from('waitlist_leads').insert({
        email: data.email.toLowerCase(),
        first_name: data.firstName,
        last_name: data.lastName,
        ecommerce_url: data.ecommerceUrl,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      });

      if (error) {
        if (error.code === '23505') {
          setServerError('Ya estás en la lista. Te avisaremos pronto.');
          setSubmitted(true);
          return;
        }
        setServerError('Algo falló. Intenta de nuevo en unos segundos.');
        return;
      }
      setSubmitted(true);
    } catch (err) {
      console.error('[WaitlistModal] insert failed:', err);
      setServerError('Algo falló. Intenta de nuevo en unos segundos.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.95) 100%)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl"
        style={{
          background:
            'linear-gradient(145deg, #0F172A 0%, #1E3A7B 100%)',
        }}
      >
        {/* Glow accent */}
        <div
          className="pointer-events-none absolute -inset-px rounded-3xl opacity-50"
          style={{
            background:
              'radial-gradient(circle at top, rgba(56,189,248,0.25) 0%, transparent 60%)',
          }}
        />

        <div className="relative p-8 md:p-10">
          {!submitted ? (
            <>
              {/* Header */}
              <div className="flex flex-col items-center text-center mb-6">
                <div className="relative mb-4">
                  <div className="absolute inset-0 rounded-full blur-xl bg-cyan-400/40" />
                  <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-cyan-300/60 bg-slate-900">
                    <img
                      src={avatarSteve}
                      alt="Steve"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/10 border border-cyan-400/30 text-cyan-300 text-xs font-medium mb-3">
                  <Sparkles className="w-3 h-3" />
                  Acceso anticipado
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-2">
                  {HEADER_LINES[0]}
                </h2>
                <p className="text-sm md:text-base text-cyan-100/80">
                  {HEADER_LINES[1]}{' '}
                  <span className="text-white">{HEADER_LINES[2]}</span>
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-firstName" className="text-xs text-cyan-100/80">
                      Nombre
                    </Label>
                    <Input
                      id="wl-firstName"
                      placeholder="María"
                      autoComplete="given-name"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-cyan-400"
                      {...register('firstName')}
                    />
                    {errors.firstName && (
                      <p className="text-xs text-red-300">{errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-lastName" className="text-xs text-cyan-100/80">
                      Apellido
                    </Label>
                    <Input
                      id="wl-lastName"
                      placeholder="González"
                      autoComplete="family-name"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-cyan-400"
                      {...register('lastName')}
                    />
                    {errors.lastName && (
                      <p className="text-xs text-red-300">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wl-email" className="text-xs text-cyan-100/80">
                    Email
                  </Label>
                  <Input
                    id="wl-email"
                    type="email"
                    placeholder="tu@empresa.com"
                    autoComplete="email"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-cyan-400"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-300">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wl-url" className="text-xs text-cyan-100/80">
                    URL de tu e-commerce
                  </Label>
                  <Input
                    id="wl-url"
                    placeholder="mitienda.cl"
                    autoComplete="url"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-cyan-400"
                    {...register('ecommerceUrl')}
                  />
                  {errors.ecommerceUrl && (
                    <p className="text-xs text-red-300">{errors.ecommerceUrl.message}</p>
                  )}
                </div>

                {serverError && (
                  <p className="text-sm text-red-300 text-center">{serverError}</p>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 text-base font-semibold text-slate-900 bg-cyan-300 hover:bg-cyan-200 transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sumándote...
                    </>
                  ) : (
                    'Quiero acceso anticipado'
                  )}
                </Button>

                <p className="text-[11px] text-center text-cyan-100/50">
                  Solo evaluamos tiendas reales. Cero spam.
                </p>
              </form>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center text-center py-6"
            >
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full blur-xl bg-emerald-400/40" />
                <div className="relative w-20 h-20 rounded-full bg-emerald-400/10 border-2 border-emerald-300/60 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-300" />
                </div>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                ¡Listo!
              </h2>
              <p className="text-cyan-100/80 max-w-sm">
                {serverError ??
                  'Quedaste en la lista. Te avisaremos por email apenas haya cupo.'}
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
