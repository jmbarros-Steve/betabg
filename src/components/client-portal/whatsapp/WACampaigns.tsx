import { useEffect, useState } from 'react';
import { Send, Plus, Users, Eye, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

interface Campaign {
  id: string;
  name: string;
  template_name: string;
  template_body: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  credits_used: number;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
}

interface Props {
  clientId: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-[#D6E0F0] text-[#162D5F]',
  sending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const SEGMENTS = [
  { value: 'all', label: 'Todos los contactos' },
  { value: 'buyers', label: 'Compradores (han comprado)' },
  { value: 'abandoned', label: 'Carrito abandonado' },
  { value: 'inactive', label: 'Inactivos (30+ dias)' },
  { value: 'vip', label: 'VIP (3+ compras)' },
];

export function WACampaigns({ clientId }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('all');
  const [templateBody, setTemplateBody] = useState('');

  useEffect(() => {
    fetchCampaigns();
  }, [clientId]);

  async function fetchCampaigns() {
    setLoading(true);
    const { data } = await supabase
      .from('wa_campaigns' as any)
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(20);

    setCampaigns((data as any[]) || []);
    setLoading(false);
  }

  async function createCampaign() {
    if (!name || !templateBody) {
      toast.error('Completa todos los campos');
      return;
    }

    if (templateBody.length > 1024) {
      toast.error('El mensaje no puede superar los 1024 caracteres');
      return;
    }

    setCreating(true);
    try {
      const { error } = await callApi('whatsapp/campaigns', {
        body: {
          action: 'create',
          client_id: clientId,
          name,
          template_name: name.toLowerCase().replace(/\s+/g, '_'),
          template_body: templateBody,
          segment_query: { segment },
        },
      });

      if (error) throw new Error(error);

      toast.success('Campana creada como borrador');
      setShowCreate(false);
      setName('');
      setSegment('all');
      setTemplateBody('');
      fetchCampaigns();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear campana');
    } finally {
      setCreating(false);
    }
  }

  async function sendCampaign(campaign: Campaign) {
    if (campaign.status !== 'draft') return;

    try {
      const { error } = await callApi('whatsapp/send-campaign', {
        body: { campaign_id: campaign.id, client_id: clientId },
      });

      if (error) throw new Error(error);

      toast.success('Campana en envio');
      fetchCampaigns();
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar campana');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Campanas WhatsApp
          </CardTitle>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-1" /> Nueva campana
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Crear campana de WhatsApp</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nombre de la campana</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Promo fin de semana"
                  />
                </div>
                <div>
                  <Label>Segmento</Label>
                  <Select value={segment} onValueChange={setSegment}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEGMENTS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mensaje</Label>
                  <Textarea
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    placeholder="Hola {{nombre}}! Tenemos una promo especial para ti..."
                    rows={5}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Usa {'{{nombre}}'} para personalizar. Maximo 1024 caracteres.
                  </p>
                </div>
                <Button
                  onClick={createCampaign}
                  disabled={creating || !name || !templateBody}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {creating ? 'Creando...' : 'Crear borrador'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Send className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay campanas</p>
            <p className="text-sm text-gray-400 mt-1">
              Crea tu primera campana de WhatsApp para comunicarte con tus clientes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(campaign => (
              <div key={campaign.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium">{campaign.name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(campaign.created_at).toLocaleDateString('es-CL')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_COLORS[campaign.status] || ''}>
                      {campaign.status === 'draft' ? 'Borrador' :
                       campaign.status === 'scheduled' ? 'Programada' :
                       campaign.status === 'sending' ? 'Enviando' :
                       campaign.status === 'sent' ? 'Enviada' : campaign.status}
                    </Badge>
                    {campaign.status === 'draft' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendCampaign(campaign)}
                        className="text-green-600 border-green-300 hover:bg-green-50"
                      >
                        <Send className="h-3 w-3 mr-1" /> Enviar
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{campaign.template_body}</p>

                {campaign.status === 'sent' && (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-lg font-bold">{campaign.sent_count}</p>
                      <p className="text-xs text-gray-500">Enviados</p>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-lg font-bold">{campaign.delivered_count}</p>
                      <p className="text-xs text-gray-500">Entregados</p>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-lg font-bold">{campaign.read_count}</p>
                      <p className="text-xs text-gray-500">Leidos</p>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-lg font-bold">{campaign.replied_count}</p>
                      <p className="text-xs text-gray-500">Respondidos</p>
                    </div>
                  </div>
                )}

                {campaign.credits_used > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    Creditos usados: {campaign.credits_used}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
