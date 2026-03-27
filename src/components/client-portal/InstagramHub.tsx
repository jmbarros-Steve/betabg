import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Instagram, Send, CalendarDays, BarChart3 } from 'lucide-react';
import { InstagramPublisher } from './InstagramPublisher';
import { ContentCalendar } from './ContentCalendar';
import { IGMetricsDashboard } from './instagram/IGMetricsDashboard';

interface InstagramHubProps {
  clientId: string;
}

export function InstagramHub({ clientId }: InstagramHubProps) {
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
        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
          <Instagram className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Instagram</h2>
          <p className="text-sm text-muted-foreground">Publica y programa contenido</p>
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
            Métricas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="publish" className="mt-4">
          <InstagramPublisher
            clientId={clientId}
            prefillDate={prefillDate}
            onPublished={handlePublished}
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <ContentCalendar
            key={refreshKey}
            clientId={clientId}
            onNewPost={handleNewPost}
          />
        </TabsContent>

        <TabsContent value="metrics" className="mt-4">
          <IGMetricsDashboard clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
