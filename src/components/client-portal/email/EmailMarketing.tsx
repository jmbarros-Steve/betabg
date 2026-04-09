import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Send, GitBranch, BarChart3, FileText, Globe, Activity } from 'lucide-react';
import { SubscribersList } from './SubscribersList';
import { CampaignBuilder } from './CampaignBuilder';
import { FlowBuilder } from './FlowBuilder';
import { EmailAnalytics } from './EmailAnalytics';
import { DomainSetup } from './DomainSetup';
import { FormBuilder } from './FormBuilder';
import { QueueHealthDashboard } from './QueueHealthDashboard';
import { useUserRole } from '@/hooks/useUserRole';

interface EmailMarketingProps {
  clientId: string;
}

export function EmailMarketing({ clientId }: EmailMarketingProps) {
  const [activeTab, setActiveTab] = useState('campaigns');
  const { isSuperAdmin } = useUserRole();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Steve Mail</h2>
          <p className="text-muted-foreground">Email marketing para tu tienda</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Globe className="w-4 h-4 mr-1.5" />
              Configurar dominio
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Configuracion de dominio</DialogTitle>
            </DialogHeader>
            <DomainSetup clientId={clientId} />
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full">
          <TabsTrigger value="campaigns" className="flex items-center gap-1.5 text-xs flex-1">
            <Send className="w-3.5 h-3.5" />
            <div className="flex flex-col items-start">
              <span>Campanas</span>
              <span className="hidden lg:block text-[10px] text-muted-foreground font-normal">Envia emails a tu audiencia</span>
            </div>
          </TabsTrigger>
          <TabsTrigger value="subscribers" className="flex items-center gap-1.5 text-xs flex-1">
            <Users className="w-3.5 h-3.5" />
            <div className="flex flex-col items-start">
              <span>Contactos</span>
              <span className="hidden lg:block text-[10px] text-muted-foreground font-normal">Tu lista de suscriptores</span>
            </div>
          </TabsTrigger>
          <TabsTrigger value="flows" className="flex items-center gap-1.5 text-xs flex-1">
            <GitBranch className="w-3.5 h-3.5" />
            <div className="flex flex-col items-start">
              <span>Automatizaciones</span>
              <span className="hidden lg:block text-[10px] text-muted-foreground font-normal">Emails automaticos</span>
            </div>
          </TabsTrigger>
          <TabsTrigger value="forms" className="flex items-center gap-1.5 text-xs flex-1">
            <FileText className="w-3.5 h-3.5" />
            <div className="flex flex-col items-start">
              <span>Formularios</span>
              <span className="hidden lg:block text-[10px] text-muted-foreground font-normal">Captura nuevos contactos</span>
            </div>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1.5 text-xs flex-1">
            <BarChart3 className="w-3.5 h-3.5" />
            <div className="flex flex-col items-start">
              <span>Rendimiento</span>
              <span className="hidden lg:block text-[10px] text-muted-foreground font-normal">Metricas y resultados</span>
            </div>
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="queue" className="flex items-center gap-1.5 text-xs flex-1">
              <Activity className="w-3.5 h-3.5" />
              <div className="flex flex-col items-start">
                <span>Cola</span>
                <span className="hidden lg:block text-[10px] text-muted-foreground font-normal">Salud del envío (admin)</span>
              </div>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="campaigns">
          <CampaignBuilder clientId={clientId} />
        </TabsContent>

        <TabsContent value="subscribers">
          <SubscribersList clientId={clientId} />
        </TabsContent>

        <TabsContent value="flows">
          <FlowBuilder clientId={clientId} />
        </TabsContent>

        <TabsContent value="forms">
          <FormBuilder clientId={clientId} />
        </TabsContent>

        <TabsContent value="analytics">
          <EmailAnalytics clientId={clientId} />
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="queue">
            <QueueHealthDashboard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
