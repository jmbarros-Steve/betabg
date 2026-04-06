import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { passwordSchema } from '@/lib/password-validation';
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter';
import avatarSteve from '@/assets/avatar-steve.png';

// Landing sections
import { SteveNavbar } from '@/components/steve-landing/SteveNavbar';
import { SteveHero } from '@/components/steve-landing/SteveHero';
import { LogoBar } from '@/components/steve-landing/LogoBar';
import { ProductShowcase } from '@/components/steve-landing/ProductShowcase';
import { FeatureBento } from '@/components/steve-landing/FeatureBento';
import { HowItWorks } from '@/components/steve-landing/HowItWorks';
import { StatsSection } from '@/components/steve-landing/StatsSection';
import { StevePersonality } from '@/components/steve-landing/StevePersonality';
import { PricingSection } from '@/components/steve-landing/PricingSection';
import { FinalCTA } from '@/components/steve-landing/FinalCTA';
import { ClientLogosSection } from '@/components/steve-landing/ClientLogosSection';
import { TestimonialsSection } from '@/components/steve-landing/TestimonialsSection';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';
import { FloatingWhatsAppButton } from '@/components/steve-landing/FloatingWhatsAppButton';
import { WaitlistModal } from '@/components/steve-landing/WaitlistModal';

const loginSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const signupSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255),
  password: passwordSchema,
});

export default function Steve() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const { signIn, signUp, signOut, user, loading: authLoading } = useAuth();
  const { isAdmin, isClient, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  if (authLoading || roleLoading) return null;

  // Waitlist gate: bloquea la landing pública mientras Steve Ads está pre-launch.
  // Bypass:
  //   - usuario logueado (cualquier rol)
  //   - flag localStorage seteado vía /entrada-secreta-jm
  const hasLocalBypass =
    typeof window !== 'undefined' &&
    localStorage.getItem('steve_admin_bypass') === 'true';
  const showWaitlist = !user && !hasLocalBypass;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message.includes('Invalid login credentials') ? 'Credenciales incorrectas' : error.message);
      } else {
        toast.success('¡Bienvenido de nuevo!');
        navigate('/portal');
      }
    } finally {
      setLoading(false);
    }
  };

  const openAuth = () => setShowAuth(true);

  return (
    <div className="min-h-screen bg-background">
      <div
        className={
          showWaitlist
            ? 'blur-sm pointer-events-none select-none transition-all'
            : 'transition-all'
        }
        aria-hidden={showWaitlist || undefined}
      >
        <SteveNavbar
          user={user}
          isAdmin={isAdmin}
          isClient={isClient}
          onOpenAuth={openAuth}
          onNavigate={(path) => navigate(path)}
          onSignOut={async () => { await signOut(); toast.success('Sesión cerrada'); }}
        />

        <SteveHero onOpenAuth={openAuth} />
        <LogoBar />
        <ProductShowcase />
        <FeatureBento />
        <HowItWorks />
        <StatsSection />
        <StevePersonality />
        <ClientLogosSection />
        <TestimonialsSection />
        <PricingSection onOpenAuth={openAuth} />
        <FinalCTA onOpenAuth={openAuth} />
        <SteveFooter />
        <FloatingWhatsAppButton />
      </div>

      {showWaitlist && <WaitlistModal />}

      {/* Auth Modal */}
      {!showWaitlist && showAuth && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowAuth(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-card border rounded-2xl p-8 w-full max-w-md shadow-xl relative"
          >
            <button
              onClick={() => setShowAuth(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-lg"
            >
              ✕
            </button>

            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 overflow-hidden">
                <img src={avatarSteve} alt="Steve" className="w-full h-full object-cover" />
              </div>
            </div>

            <h2 className="text-xl font-semibold text-center mb-2">
              Bienvenido de vuelta
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Ingresa para continuar
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auth-password">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="auth-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Cargando...' : 'Iniciar Sesión'}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setShowAuth(false); navigate('/auth?mode=forgot'); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
