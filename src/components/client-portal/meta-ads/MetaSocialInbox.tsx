import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Lock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MetaScopeAlert from './MetaScopeAlert';

interface MetaSocialInboxProps {
  clientId: string;
}

export default function MetaSocialInbox({ clientId }: MetaSocialInboxProps) {
  return (
    <div className="space-y-4">
      {/* Scope alert */}
      <MetaScopeAlert clientId={clientId} requiredFeature="pages" compact />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Social Inbox</h2>
          <p className="text-muted-foreground text-sm">
            Gestiona comentarios, mensajes y menciones de Facebook e Instagram
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          <Lock className="w-3 h-3 mr-1.5" />
          Proximamente
        </Badge>
      </div>

      {/* Coming Soon Card */}
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>

          <h3 className="text-lg font-semibold mb-2">
            Social Inbox estara disponible pronto
          </h3>

          <p className="text-muted-foreground text-sm max-w-lg mx-auto mb-6">
            Esta funcionalidad requiere permisos de <strong>Meta Pages API</strong> y{' '}
            <strong>Instagram Graph API</strong> para acceder a comentarios, mensajes directos
            y menciones de tus paginas conectadas. Estamos trabajando en la integracion.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto mb-8">
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-sm font-medium mb-1">Comentarios</p>
              <p className="text-xs text-muted-foreground">
                Responde comentarios de tus anuncios y publicaciones
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-sm font-medium mb-1">Mensajes</p>
              <p className="text-xs text-muted-foreground">
                Gestiona DMs de Facebook Messenger e Instagram
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-sm font-medium mb-1">Menciones</p>
              <p className="text-xs text-muted-foreground">
                Monitorea menciones de tu marca en redes sociales
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                'https://developers.facebook.com/docs/pages-api/overview',
                '_blank',
              )
            }
          >
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            Ver documentacion de Meta Pages API
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
