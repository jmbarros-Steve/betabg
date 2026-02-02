import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useShopifyContext } from '@/hooks/useShopifyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { passwordSchema } from '@/lib/password-validation';
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter';
import logo from '@/assets/logo.jpg';

const loginSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const signupSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255),
  password: passwordSchema,
});

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [tokenDebug, setTokenDebug] = useState<string | null>(null);
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { isAdmin, isClient, loading: roleLoading } = useUserRole();
  const { isShopifyContext, shop, host } = useShopifyContext();
  const navigate = useNavigate();

  // DEBUG: Capture OAuth tokens from URL hash or search params
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    
    console.log('[Auth Debug] URL hash:', hash);
    console.log('[Auth Debug] URL search:', search);
    
    // Check for access_token in hash (implicit flow)
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      
      console.log('[Auth Debug] Found access_token in hash!');
      setTokenDebug(`Token recibido en hash! access_token: ${accessToken?.substring(0, 20)}...`);
      alert('Token recibido en hash!');
      
      // Force session exchange
      if (accessToken && refreshToken) {
        console.log('[Auth Debug] Forcing setSession...');
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        }).then(({ data, error }) => {
          if (error) {
            console.error('[Auth Debug] setSession error:', error);
            setOauthError(`Error setSession: ${error.message}`);
          } else {
            console.log('[Auth Debug] setSession success:', data.user?.email);
            setTokenDebug(`Sesión establecida para: ${data.user?.email}`);
          }
        });
      }
    }
    
    // Check for code in search params (authorization code flow)
    const urlParams = new URLSearchParams(search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    
    if (code) {
      console.log('[Auth Debug] Found code in search params!');
      setTokenDebug(`Code recibido: ${code.substring(0, 20)}...`);
      alert('Code recibido! Supabase debería intercambiarlo automáticamente.');
      
      // Force exchange code for session
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) {
          console.error('[Auth Debug] exchangeCodeForSession error:', error);
          setOauthError(`Error exchange: ${error.message}`);
        } else {
          console.log('[Auth Debug] exchangeCodeForSession success:', data.user?.email);
          setTokenDebug(`Sesión establecida para: ${data.user?.email}`);
        }
      });
    }
    
    if (error) {
      console.error('[Auth Debug] OAuth error:', error, errorDescription);
      setOauthError(`OAuth Error: ${error} - ${errorDescription}`);
    }
  }, []);

  // CRITICAL: If we're in Shopify context, redirect to /shopify for auto-login
  // This prevents showing the manual login screen to embedded app users
  useEffect(() => {
    if (isShopifyContext && shop && host) {
      console.log('[Auth] Shopify context detected, redirecting to auto-login...');
      // Preserve all Shopify params when redirecting
      const shopifyParams = new URLSearchParams(searchParams);
      navigate(`/shopify?${shopifyParams.toString()}`, { replace: true });
    }
  }, [isShopifyContext, shop, host, searchParams, navigate]);

  useEffect(() => {
    console.log('[Auth Page] State:', { authLoading, roleLoading, user: user?.email, isClient, isAdmin });
    
    if (authLoading || roleLoading) return;
    
    // If user is logged in, redirect based on role
    if (user) {
      if (isClient) {
        console.log('[Auth Page] Redirecting client to /portal');
        navigate('/portal', { replace: true });
        return;
      }
      if (isAdmin) {
        console.log('[Auth Page] Redirecting admin to /dashboard');
        navigate('/dashboard', { replace: true });
        return;
      }
      // User has no role - show message or keep on auth
      console.log('[Auth Page] User has no assigned role');
    }
  }, [user, authLoading, roleLoading, isClient, isAdmin, navigate]);

  // Show loading while checking Shopify context redirect
  if (isShopifyContext) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Redirigiendo a Shopify...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Use different schemas for login vs signup
    const schema = mode === 'login' ? loginSchema : signupSchema;
    const validation = schema.safeParse({ email, password });
    
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Credenciales incorrectas');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('¡Bienvenido de nuevo!');
          // Navigation handled by useEffect based on role
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Este email ya está registrado');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('¡Cuenta creada exitosamente!');
          navigate('/dashboard');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Ingresa tu email');
      return;
    }

    setLoading(true);
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      });
      
      if (error) {
        toast.error(error.message);
      } else {
        setResetSent(true);
        toast.success('¡Email enviado! Revisa tu bandeja de entrada');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>

        <div className="p-8 rounded-lg bg-card border border-border">
          <div className="flex justify-center mb-8">
            <img src={logo} alt="Consultoría BG" className="h-16 w-auto" />
          </div>

          <h1 className="text-xl font-medium text-center mb-2 tracking-wide">
            {mode === 'login' ? 'Acceder al Panel' : mode === 'signup' ? 'Crear Cuenta' : 'Recuperar Contraseña'}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-8">
            {mode === 'login' ? 'Ingresa tus credenciales' : mode === 'signup' ? 'Regístrate para continuar' : 'Te enviaremos un link de recuperación'}
          </p>

          {mode === 'forgot' ? (
            resetSent ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Hemos enviado un link de recuperación a <strong>{email}</strong>. Revisa tu bandeja de entrada.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMode('login');
                    setResetSent(false);
                  }}
                  className="mt-4"
                >
                  Volver al login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs uppercase tracking-widest">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-11"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" variant="hero" size="lg" className="w-full uppercase tracking-wider" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar Link de Recuperación'}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Volver al login
                  </button>
                </div>
              </form>
            )
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs uppercase tracking-widest">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-11"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs uppercase tracking-widest">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11"
                      required
                    />
                  </div>
                  {mode === 'signup' && <PasswordStrengthMeter password={password} />}
                  {mode === 'signup' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Mínimo 8 caracteres, mayúsculas, minúsculas, números y símbolos
                    </p>
                  )}
                </div>

                {mode === 'login' && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}

                <Button type="submit" variant="hero" size="lg" className="w-full uppercase tracking-wider" disabled={loading}>
                  {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground tracking-widest">O continúa con</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={async () => {
                  setOauthError(null);
                  setTokenDebug(null);
                  try {
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        // Redirect to /auth after OAuth, then role-based routing kicks in
                        redirectTo: `${window.location.origin}/auth`
                      }
                    });
                    if (error) {
                      console.error('[Auth] signInWithOAuth error:', error);
                      setOauthError(`OAuth Error: ${error.message}`);
                      toast.error('Error al iniciar sesión con Google');
                    }
                  } catch (err: any) {
                    console.error('[Auth] signInWithOAuth exception:', err);
                    setOauthError(`Exception: ${err.message}`);
                  }
                }}
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continuar con Google
              </Button>

              {/* Debug: Show OAuth errors */}
              {oauthError && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-md">
                  <p className="text-sm text-destructive font-mono break-all">{oauthError}</p>
                </div>
              )}

              {/* Debug: Show token info */}
              {tokenDebug && (
                <div className="mt-4 p-3 bg-primary/10 border border-primary rounded-md">
                  <p className="text-sm text-primary font-mono break-all">{tokenDebug}</p>
                </div>
              )}

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
