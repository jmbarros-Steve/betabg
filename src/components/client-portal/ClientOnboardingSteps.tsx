import { CheckCircle, Circle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import logoShopify from '@/assets/logo-shopify-clean.png';
import logoMeta from '@/assets/logo-meta-clean.png';
import logoGoogle from '@/assets/logo-google-ads.png';

interface Connection {
  platform: 'shopify' | 'meta' | 'google';
  is_active: boolean;
}

interface ClientOnboardingStepsProps {
  connections: Connection[];
  onConnectMeta: () => void;
  onConnectShopify: () => void;
  onConnectGoogle: () => void;
  isConnectingMeta: boolean;
  isConnectingShopify: boolean;
  isConnectingGoogle: boolean;
  isAdmin?: boolean;
}

const steps = [
  {
    id: 'meta',
    platform: 'meta' as const,
    title: 'Conectar Meta Ads',
    description: 'Facebook e Instagram Ads para métricas de campañas',
    logo: logoMeta,
  },
  {
    id: 'shopify',
    platform: 'shopify' as const,
    title: 'Conectar Shopify',
    description: 'Métricas de ventas, pedidos e ingresos',
    logo: logoShopify,
  },
  {
    id: 'google',
    platform: 'google' as const,
    title: 'Conectar Google Ads',
    description: 'Campañas de búsqueda y display',
    logo: logoGoogle,
  },
];

export function ClientOnboardingSteps({
  connections,
  onConnectMeta,
  onConnectShopify,
  onConnectGoogle,
  isConnectingMeta,
  isConnectingShopify,
  isConnectingGoogle,
  isAdmin = false,
}: ClientOnboardingStepsProps) {
  const getConnectionStatus = (platform: string) => {
    const connection = connections.find((c) => c.platform === platform);
    return connection?.is_active ?? false;
  };

  const completedSteps = steps.filter((step) => getConnectionStatus(step.platform)).length;
  const progress = (completedSteps / steps.length) * 100;

  const getConnectHandler = (platform: string) => {
    switch (platform) {
      case 'meta':
        return onConnectMeta;
      case 'shopify':
        return onConnectShopify;
      case 'google':
        return onConnectGoogle;
      default:
        return () => {};
    }
  };

  const getIsConnecting = (platform: string) => {
    switch (platform) {
      case 'meta':
        return isConnectingMeta;
      case 'shopify':
        return isConnectingShopify;
      case 'google':
        return isConnectingGoogle;
      default:
        return false;
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">Configura tus conexiones</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Conecta tus plataformas para ver métricas integradas
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-primary">{completedSteps}/{steps.length}</span>
            <p className="text-xs text-muted-foreground">completados</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step, index) => {
          const isCompleted = getConnectionStatus(step.platform);
          const isPending = !isCompleted;
          const isConnecting = getIsConnecting(step.platform);
          const handleConnect = getConnectHandler(step.platform);

          return (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-4 p-4 rounded-lg border transition-all',
                isCompleted
                  ? 'bg-primary/5 border-primary/30'
                  : 'bg-muted/30 border-border'
              )}
            >
              {/* Step number/check */}
              <div
                className={cn(
                  'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <span className="font-semibold">{index + 1}</span>
                )}
              </div>

              {/* Platform logo */}
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-background border flex items-center justify-center">
                <img src={step.logo} alt={step.title} className="w-8 h-8 object-contain" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className={cn('font-medium', isCompleted && 'text-primary')}>
                  {step.title}
                </h4>
                <p className="text-sm text-muted-foreground truncate">{step.description}</p>
              </div>

              {/* Action */}
              <div className="flex-shrink-0">
                {isCompleted ? (
                  <span className="text-sm font-medium text-primary">Conectado</span>
                ) : isPending ? (
                  <Button
                    size="sm"
                    onClick={handleConnect}
                    disabled={isConnecting}
                  >
                    {isConnecting ? 'Conectando...' : 'Conectar'}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {isAdmin ? 'Configurar' : 'Pendiente'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
