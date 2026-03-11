import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, Copy, Check, Eye, EyeOff, PartyPopper, ArrowRight, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.jpg';

interface ShopifyWelcomeScreenProps {
  storeName: string;
  credentials: {
    email: string;
    password: string;
  };
  onLogin: () => void;
}

export function ShopifyWelcomeScreen({ storeName, credentials, onLogin }: ShopifyWelcomeScreenProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleCopyCredentials = () => {
    const text = `Email: ${credentials.email}\nContraseña: ${credentials.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({
      title: 'Credenciales copiadas',
      description: 'Guárdalas en un lugar seguro',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogin = () => {
    setIsLoggingIn(true);
    onLogin();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg rounded-2xl shadow-xl border border-slate-200">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <img src={logo} alt="Steve" className="h-16" />
              <div className="absolute -top-2 -right-2 bg-primary rounded-full p-1">
                <PartyPopper className="h-4 w-4 text-primary-foreground" />
              </div>
            </div>
          </div>
          <CardTitle className="text-2xl">¡Bienvenido a Steve!</CardTitle>
          <p className="text-muted-foreground mt-2">
            Tu tienda <strong className="text-foreground">{storeName}</strong> ha sido conectada exitosamente
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Success indicator */}
          <div className="flex items-center justify-center gap-2 text-sm bg-primary/10 text-primary rounded-lg py-3 px-4">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Cuenta creada automáticamente</span>
          </div>

          {/* Credentials */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Tus credenciales de acceso</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyCredentials}
                className="h-8 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar todo
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Input 
                    value={credentials.email} 
                    readOnly 
                    className="bg-background font-mono text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Contraseña temporal</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    type={showPassword ? 'text' : 'password'}
                    value={credentials.password} 
                    readOnly 
                    className="bg-background font-mono text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword(!showPassword)}
                    className="h-9 w-9 flex-shrink-0"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <span className="text-lg">⚠️</span>
              <div className="text-sm">
                <p className="font-medium text-destructive">
                  Guarda estas credenciales
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Podrás cambiar tu contraseña una vez dentro del portal.
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <Button
            onClick={handleLogin}
            className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700 rounded-lg"
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <span className="animate-pulse">Iniciando sesión...</span>
            ) : (
              <>
                Entrar al Portal
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            ¿Problemas para acceder?{' '}
            <a href="mailto:soporte@bgconsult.cl" className="underline hover:text-foreground">
              Contáctanos
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
