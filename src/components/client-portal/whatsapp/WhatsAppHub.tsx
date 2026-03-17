import { useState, useEffect } from 'react';
import { MessageCircle, Send, Zap, CreditCard, BarChart3, Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { WASetup } from './WASetup';
import { WAInbox } from './WAInbox';
import { WACampaigns } from './WACampaigns';
import { WAAutomations } from './WAAutomations';
import { WACredits } from './WACredits';

interface Props {
  clientId: string;
}

export function WhatsAppHub({ clientId }: Props) {
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(0);

  useEffect(() => {
    checkSetup();
  }, [clientId]);

  async function checkSetup() {
    const { data: account } = await supabase
      .from('wa_twilio_accounts' as any)
      .select('phone_number, status')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (account) {
      setHasAccount(true);
      setPhoneNumber((account as any).phone_number);
    } else {
      setHasAccount(false);
    }

    const { data: creditData } = await supabase
      .from('wa_credits' as any)
      .select('balance')
      .eq('client_id', clientId)
      .single();

    if (creditData) {
      setCredits((creditData as any).balance || 0);
    }
  }

  if (hasAccount === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!hasAccount) {
    return <WASetup clientId={clientId} onSetupComplete={checkSetup} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <MessageCircle className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">WhatsApp Business</h2>
            <p className="text-sm text-gray-500">{phoneNumber} &middot; {credits} creditos disponibles</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="inbox" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="inbox" className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Inbox</span>
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="flex items-center gap-1.5">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Campanas</span>
          </TabsTrigger>
          <TabsTrigger value="automations" className="flex items-center gap-1.5">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Automaciones</span>
          </TabsTrigger>
          <TabsTrigger value="credits" className="flex items-center gap-1.5">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Creditos</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
          <WAInbox clientId={clientId} />
        </TabsContent>
        <TabsContent value="campaigns">
          <WACampaigns clientId={clientId} />
        </TabsContent>
        <TabsContent value="automations">
          <WAAutomations clientId={clientId} />
        </TabsContent>
        <TabsContent value="credits">
          <WACredits clientId={clientId} credits={credits} onRefresh={checkSetup} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
