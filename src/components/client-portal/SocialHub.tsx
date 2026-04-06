import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Share2, Send, CalendarDays, BarChart3, MessageSquare, Clock } from 'lucide-react';
import { SocialPublisher } from './social/SocialPublisher';
import { SocialCalendar } from './social/SocialCalendar';
import { SocialMetrics } from './social/SocialMetrics';
import MetaSocialInbox from './meta-ads/MetaSocialInbox';
import { BestTimesHeatmap } from './instagram/BestTimesHeatmap';
import { PlanGate } from './PlanGate';

interface SocialHubProps {
  clientId: string;
}

export function SocialHub({ clientId }: SocialHubProps) {
  const [activeTab, setActiveTab] = useState('publish');
  const [prefillDate, setPrefillDate] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleNewPost = (date: string) => {
    setPrefillDate(date);
    setActiveTab('publish');
  };

  const handlePublished = () => {
    setRefreshKey(k => k + 1);
    setActiveTab('calendar');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500">
          <Share2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Social</h2>
          <p className="text-sm text-muted-foreground">Instagram + Facebook — contenido organico</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="publish" className="gap-1.5">
            <Send className="w-4 h-4" />
            Publicar
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarDays className="w-4 h-4" />
            Calendario
          </TabsTrigger>
          <TabsTrigger value="metrics" className="gap-1.5">
            <BarChart3 className="w-4 h-4" />
            Metricas
          </TabsTrigger>
          <TabsTrigger value="inbox" className="gap-1.5">
            <MessageSquare className="w-4 h-4" />
            Bandeja
          </TabsTrigger>
          <TabsTrigger value="best-times" className="gap-1.5">
            <Clock className="w-4 h-4" />
            Mejor Hora
          </TabsTrigger>
        </TabsList>

        <TabsContent value="publish" className="mt-4">
          <PlanGate feature="instagram.publish">
            <SocialPublisher
              clientId={clientId}
              prefillDate={prefillDate}
              onPublished={handlePublished}
            />
          </PlanGate>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <SocialCalendar
            key={refreshKey}
            clientId={clientId}
            onNewPost={handleNewPost}
          />
        </TabsContent>

        <TabsContent value="metrics" className="mt-4">
          <PlanGate feature="instagram.analysis">
            <SocialMetrics clientId={clientId} />
          </PlanGate>
        </TabsContent>

        <TabsContent value="inbox" className="mt-4">
          <MetaSocialInbox clientId={clientId} />
        </TabsContent>

        <TabsContent value="best-times" className="mt-4">
          <BestTimesHeatmap clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
