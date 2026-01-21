import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink, CheckCircle } from 'lucide-react';
import logoSteve from '@/assets/logo-steve.png';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function ShopifyEmbedded() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [isShopifyEmbed, setIsShopifyEmbed] = useState(false);

  const shop = searchParams.get('shop');

  useEffect(() => {
    // Detect if we're inside Shopify admin iframe
    const inIframe = window.self !== window.top;
    setIsShopifyEmbed(inIframe);

    // If user is logged in, redirect to portal
    if (!loading && user) {
      if (inIframe) {
        // Open portal in new tab when in iframe
        window.open('https://betabg.lovable.app/portal', '_blank');
      } else {
        navigate('/portal');
      }
    }
  }, [user, loading, navigate]);

  const handleGoToPortal = () => {
    window.open('https://betabg.lovable.app/portal', '_blank');
  };

  const handleLogin = () => {
    window.open('https://betabg.lovable.app/auth', '_blank');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          <img src={logoSteve} alt="Steve" className="h-20 mx-auto" />
          
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              ¡Steve está listo!
            </h1>
            <p className="text-muted-foreground">
              Tu asistente de marketing con IA
            </p>
          </div>

          {shop && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded-lg">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span>Conectado a: <strong>{shop}</strong></span>
            </div>
          )}

          <div className="space-y-3">
            <Button 
              onClick={handleGoToPortal} 
              className="w-full gap-2" 
              size="lg"
            >
              Ir al Portal de Steve
              <ExternalLink className="h-4 w-4" />
            </Button>
            
            <p className="text-xs text-muted-foreground">
              Se abrirá en una nueva pestaña
            </p>
          </div>

          {!user && (
            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-3">
                ¿Primera vez? Revisa tu email para tus credenciales de acceso.
              </p>
              <Button 
                variant="outline" 
                onClick={handleLogin}
                className="w-full"
              >
                Iniciar Sesión
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
