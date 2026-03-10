import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Send, GitBranch, BarChart3, Globe, Filter, Bell, FileText } from 'lucide-react';
import { SubscribersList } from './SubscribersList';
import { CampaignBuilder } from './CampaignBuilder';
import { FlowBuilder } from './FlowBuilder';
import { EmailAnalytics } from './EmailAnalytics';
import { DomainSetup } from './DomainSetup';
import { SegmentBuilder } from './SegmentBuilder';
import { ProductAlerts } from './ProductAlerts';
import { FormBuilder } from './FormBuilder';

interface EmailMarketingProps {
  clientId: string;
}

export function EmailMarketing({ clientId }: EmailMarketingProps) {
  const [activeTab, setActiveTab] = useState('subscribers');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Steve Mail</h2>
        <p className="text-muted-foreground">Email marketing nativo — sin depender de Klaviyo</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="subscribers" className="flex items-center gap-1.5 text-xs flex-1">
            <Users className="w-3.5 h-3.5" />
            Contactos
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="flex items-center gap-1.5 text-xs flex-1">
            <Send className="w-3.5 h-3.5" />
            Campañas
          </TabsTrigger>
          <TabsTrigger value="flows" className="flex items-center gap-1.5 text-xs flex-1">
            <GitBranch className="w-3.5 h-3.5" />
            Flujos
          </TabsTrigger>
          <TabsTrigger value="forms" className="flex items-center gap-1.5 text-xs flex-1">
            <FileText className="w-3.5 h-3.5" />
            Formularios
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-1.5 text-xs flex-1">
            <Bell className="w-3.5 h-3.5" />
            Alertas
          </TabsTrigger>
          <TabsTrigger value="segments" className="flex items-center gap-1.5 text-xs flex-1">
            <Filter className="w-3.5 h-3.5" />
            Segmentos
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1.5 text-xs flex-1">
            <BarChart3 className="w-3.5 h-3.5" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="domains" className="flex items-center gap-1.5 text-xs flex-1">
            <Globe className="w-3.5 h-3.5" />
            Dominio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscribers">
          <SubscribersList clientId={clientId} />
        </TabsContent>

        <TabsContent value="campaigns">
          <CampaignBuilder clientId={clientId} />
        </TabsContent>

        <TabsContent value="flows">
          <FlowBuilder clientId={clientId} />
        </TabsContent>

        <TabsContent value="forms">
          <FormBuilder clientId={clientId} />
        </TabsContent>

        <TabsContent value="alerts">
          <ProductAlerts clientId={clientId} />
        </TabsContent>

        <TabsContent value="segments">
          <SegmentBuilder clientId={clientId} />
        </TabsContent>

        <TabsContent value="analytics">
          <EmailAnalytics clientId={clientId} />
        </TabsContent>

        <TabsContent value="domains">
          <DomainSetup clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
