import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, ArrowLeft, Loader2 } from 'lucide-react';
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
import logo from '@/assets/logo.jpg';

// Always use production URL for auth redirects so emails never contain localhost
const PROD_URL = 'https://betabgnuevosupa.vercel.app';
const getAuthRedirectUrl = (path: string) => {
  const base = window.location.hostname === 'localhost' ? PROD_URL : window.location.origin;
  return `${base}${path}`;
};

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
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { signIn, signUp, signOut, user, loading: authLoading } = useAuth();
  const { isAdmin, isClient, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  // Capture OAuth tokens from URL and force session + navigation
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const urlParams = new URLSearchParams(search);
    const isResetMode = urlParams.get('mode') === 'reset';

    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        }).then(({ data, error }) => {
          if (error) {
            setOauthError(`Error setSession: ${error.message}`);
          } else if (data.user) {
            // If this is a password reset flow, show the reset form
            if (type === 'recovery' || isResetMode) {
              setMode('reset');
            } else {
              window.location.assign('/auth');
            }
          }
        });
        return;
      }
    }

    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) {
          setOauthError(`Error exchange: ${error.message}`);
        } else if (data.user) {
          // If this is a password reset flow, show the reset form
          if (isResetMode) {
            setMode('reset');
          } else {
            window.location.assign('/auth');
          }
        }
      });
      return;
    }

    // If already logged in and mode=reset, show reset form
    if (isResetMode && user) {
      setMode('reset');
    }

    if (error) {
      setOauthError(`OAuth Error: ${error} - ${errorDescription}`);
    }
  }, []);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    // Don't redirect if user is resetting password
    if (mode === 'reset') return;

    if (user) {
      if (isClient) {
        navigate('/portal', { replace: true });
        return;
      }
      if (isAdmin) {
        navigate('/dashboard', { replace: true });
        return;
      }
    }
  }, [user, authLoading, roleLoading, isClient, isAdmin, navigate, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const schema = mode === 'login' ? loginSchema : signupSchema;
    const validation = schema.safeParse({ email, password });
    
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    setLoginError(null);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          const msg = error.message.includes('Invalid login credentials')
            ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
            : error.message;
          setLoginError(msg);
          toast.error(msg);
        } else {
          toast.success('Sesión iniciada. Redirigiendo...');
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            toast.error('Este email ya está registrado. Intenta iniciar sesión.');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('¡Cuenta creada exitosamente!');
          // signUp auto-signs in, useEffect will redirect
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
        redirectTo: getAuthRedirectUrl('/auth?mode=reset'),
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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { toast.error('Ingresa tu nueva contraseña'); return; }
    const validation = passwordSchema.safeParse(password);
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
      } else {
        setResetDone(true);
        toast.success('Contraseña actualizada');
        setTimeout(() => {
          setMode('login');
          setPassword('');
          setResetDone(false);
          navigate('/auth', { replace: true });
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>

        <div className="p-8 rounded-2xl bg-white border border-slate-200 shadow-xl">
          <div className="flex justify-center mb-8">
            <img src={logo} alt="Steve Ads" className="h-16 w-auto" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 text-center mb-2">
            {mode === 'login' ? 'Acceder al Panel' : mode === 'signup' ? 'Crear Cuenta' : mode === 'reset' ? 'Nueva Contraseña' : 'Recuperar Contraseña'}
          </h1>
          <p className="text-sm text-slate-500 text-center mb-8">
            {mode === 'login' ? 'Ingresa tus credenciales' : mode === 'signup' ? 'Regístrate para continuar' : mode === 'reset' ? 'Ingresa tu nueva contraseña' : 'Te enviaremos un link de recuperación'}
          </p>

          {!authLoading && !roleLoading && user && !isAdmin && !isClient && (
            <div className="mb-6 rounded-md border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">
                Sesión iniciada, pero tu usuario no tiene acceso asignado.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pide que te asignen un rol (client o admin) en el backend. Tu ID de usuario es:
              </p>
              <p className="mt-2 text-xs font-mono text-foreground break-all">{user.id}</p>

              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try { await signOut(); } catch { /* ignore signOut errors */ }
                    navigate('/auth', { replace: true });
                  }}
                >
                  Cerrar sesión
                </Button>
              </div>
            </div>
          )}

          {mode === 'reset' ? (
            resetDone ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                  <Lock className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Contraseña actualizada correctamente. Redirigiendo...
                </p>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-sm font-medium text-slate-700">Nueva contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11"
                      required
                      autoFocus
                    />
                  </div>
                  <PasswordStrengthMeter password={password} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Mínimo 8 caracteres, mayúsculas, minúsculas, números y símbolos
                  </p>
                </div>

                <Button type="submit" size="lg" className="w-full bg-primary text-white rounded-lg py-3 font-semibold hover:bg-primary/90" disabled={loading}>
                  {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
                </Button>
              </form>
            )
          ) : mode === 'forgot' ? (
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
                  <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email</Label>
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

                <Button type="submit" size="lg" className="w-full bg-primary text-white rounded-lg py-3 font-semibold hover:bg-primary/90" disabled={loading}>
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
                  <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setLoginError(null); }}
                      className="pl-11"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
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

                {loginError && mode === 'login' && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {loginError}
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full bg-primary text-white rounded-lg py-3 font-semibold hover:bg-primary/90" disabled={loading}>
                  {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-slate-400">O continúa con</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                onClick={async () => {
                  setOauthError(null);
                  try {
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        redirectTo: getAuthRedirectUrl('/auth'),
                        queryParams: { prompt: 'select_account' },
                      },
                    });
                    if (error) {
                      setOauthError(`OAuth Error: ${error.message}`);
                      toast.error('Error al iniciar sesión con Google');
                    }
                  } catch (err: unknown) {
                    try {
                      const message = err instanceof Error ? err.message : String(err);
                      setOauthError(`Exception: ${message}`);
                    } catch {
                      setOauthError('Error desconocido al iniciar sesión con Google');
                    }
                  }
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

              {oauthError && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-md">
                  <p className="text-sm text-destructive font-mono break-all">{oauthError}</p>
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
