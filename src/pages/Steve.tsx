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
import { TestimonialsSection } from '@/components/steve-landing/TestimonialsSection';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';
import { FloatingWhatsAppButton } from '@/components/steve-landing/FloatingWhatsAppButton';

const loginSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const signupSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255),
  password: passwordSchema,
});

export default function Steve() {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const { signIn, signUp, signOut, user, loading: authLoading } = useAuth();
  const { isAdmin, isClient, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  if (authLoading || roleLoading) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const schema = isLogin ? loginSchema : signupSchema;
    const validation = schema.safeParse({ email, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast.error(error.message.includes('Invalid login credentials') ? 'Credenciales incorrectas' : error.message);
        } else {
          toast.success('¡Bienvenido de nuevo!');
          navigate('/portal');
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          toast.error(error.message.includes('already registered') ? 'Este email ya está registrado' : error.message);
        } else {
          toast.success('¡Cuenta creada! Bienvenido al equipo');
          navigate('/portal');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const openAuth = () => setShowAuth(true);

  return (
    <div className="min-h-screen bg-background">
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
      <TestimonialsSection />
      <PricingSection onOpenAuth={openAuth} />
      <FinalCTA onOpenAuth={openAuth} />
      <SteveFooter />
      <FloatingWhatsAppButton />

      {/* Auth Modal */}
      {showAuth && (
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
              {isLogin ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {isLogin ? 'Ingresa para continuar' : 'Accede a toda la plataforma'}
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
                {!isLogin && <PasswordStrengthMeter password={password} />}
                {!isLogin && (
                  <p className="text-xs text-muted-foreground">
                    Mínimo 8 caracteres, mayúsculas, minúsculas, números y símbolos
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Cargando...' : isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">O continúa con</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: `${window.location.origin}/auth`,
                    queryParams: { prompt: 'select_account' },
                  },
                });
                if (error) toast.error('Error al iniciar sesión con Google');
              }}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuar con Google
            </Button>

            <div className="mt-6 text-center space-y-2">
              {isLogin && (
                <button
                  type="button"
                  onClick={() => { setShowAuth(false); navigate('/auth?mode=forgot'); }}
                  className="block w-full text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
