import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Check, ExternalLink, Rocket, Mail } from 'lucide-react';
import type { BrandIdentity } from '../templates/BrandHtmlGenerator';
import type { CampaignData } from './CampaignCreationWizard';

interface SchedulePublishProps {
  clientId: string;
  brand: BrandIdentity;
  campaignData: CampaignData;
  htmlContent: string;
  onPublish: (result: any) => void;
}

interface KlaviyoList {
  id: string;
  name: string;
  profile_count: number;
}

export function SchedulePublish({
  clientId,
  brand,
  campaignData,
  htmlContent,
  onPublish,
}: SchedulePublishProps) {
  const [lists, setLists] = useState<KlaviyoList[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [selectedList, setSelectedList] = useState('');
  const [sendStrategy, setSendStrategy] = useState<'draft' | 'scheduled' | 'smart_send' | 'immediate'>('draft');
  const [scheduledAt, setScheduledAt] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<any>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  useEffect(() => {
    loadKlaviyoLists();
  }, [clientId]);

  const loadKlaviyoLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      // Get Klaviyo connection
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!conn) {
        toast.error('No hay conexión activa de Klaviyo. Conecta Klaviyo primero.');
        setLoadingLists(false);
        return;
      }

      setConnectionId(conn.id);

      const { data, error } = await callApi('klaviyo-push-emails', {
        body: { action: 'fetch_lists', connection_id: conn.id },
      });

      if (error) throw error;
      const fetchedLists = data?.lists || [];
      setLists(fetchedLists);
      if (fetchedLists.length > 0) {
        setSelectedList(fetchedLists[0].id);
      }
    } catch (err: any) {
      // Error handled by toast below
      toast.error('Error al cargar listas de Klaviyo');
    } finally {
      setLoadingLists(false);
    }
  }, [clientId]);

  const handlePublish = useCallback(async () => {
    if (!connectionId || !selectedList) {
      toast.error('Selecciona una lista de destinatarios');
      return;
    }

    setPushing(true);
    try {
      // Step 1: Save campaign to email_campaigns table
      const campaignName = `${campaignData.subject || 'Campaña sin asunto'}`;
      const { data: savedCampaign, error: saveError } = await supabase
        .from('email_campaigns')
        .insert({
          client_id: clientId,
          name: campaignName,
          subject: campaignData.subject,
          preview_text: campaignData.previewText || null,
          final_html: htmlContent,
          status: sendStrategy === 'draft' ? 'draft' : 'scheduled',
          scheduled_at: sendStrategy === 'scheduled' ? scheduledAt || null : null,
          klaviyo_list_id: selectedList,
          content_blocks: {
            campaign_type: campaignData.type,
            products: campaignData.products,
            title: campaignData.title,
            intro_text: campaignData.introText,
            cta_text: campaignData.ctaText,
            cta_url: campaignData.ctaUrl,
            coupon_code: campaignData.couponCode,
            hero_image_url: campaignData.heroImageUrl,
          } as any,
        })
        .select()
        .single();

      if (saveError) throw saveError;

      // Step 2: Create a temporary plan structure the edge function expects
      const tempPlanId = savedCampaign.id;
      const emailForPush = {
        id: tempPlanId,
        subject: campaignData.subject,
        previewText: campaignData.previewText || '',
        content: htmlContent,
        delayDays: 0,
        delayHours: 0,
      };

      // Save a temporary plan to klaviyo_email_plans for the push function
      const { data: tempPlan, error: planError } = await supabase
        .from('klaviyo_email_plans')
        .insert({
          client_id: clientId,
          flow_type: 'campaign',
          name: campaignName,
          status: 'draft',
          emails: [emailForPush] as any,
        } as any)
        .select()
        .single();

      if (planError) throw planError;

      // Step 3: Push to Klaviyo
      const { data: pushData, error: pushError } = await callApi('klaviyo-push-emails', {
        body: {
          plan_id: tempPlan.id,
          connection_id: connectionId,
          list_id: selectedList,
          send_strategy: sendStrategy,
          scheduled_at: sendStrategy === 'scheduled' ? scheduledAt || undefined : undefined,
        },
      });

      if (pushError) throw pushError;
      if (pushData?.error) throw new Error(pushData.error);

      // Step 4: Update email_campaigns with Klaviyo campaign ID
      const klaviyoCampaignId = pushData?.campaigns?.[0]?.campaign_id;
      if (klaviyoCampaignId) {
        await supabase
          .from('email_campaigns')
          .update({
            klaviyo_campaign_id: klaviyoCampaignId,
            status: sendStrategy === 'draft' ? 'draft' : sendStrategy === 'immediate' ? 'sent' : 'scheduled',
          })
          .eq('id', savedCampaign.id);
      }

      setPushResult(pushData);
      const strategyLabel = sendStrategy === 'draft'
        ? 'como borrador'
        : sendStrategy === 'immediate'
        ? 'para envío inmediato'
        : sendStrategy === 'smart_send'
        ? 'con Smart Send'
        : 'programada';
      toast.success(`Campaña creada ${strategyLabel} en Klaviyo`);
      onPublish(pushData);
    } catch (err: any) {
      // Error handled by toast below
      toast.error(`Error: ${err.message || 'No se pudo crear la campaña en Klaviyo'}`);
    } finally {
      setPushing(false);
    }
  }, [connectionId, selectedList, sendStrategy, scheduledAt, campaignData, htmlContent, clientId, onPublish]);

  // Success state
  if (pushResult) {
    const campaignId = pushResult?.campaigns?.[0]?.campaign_id;
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="font-semibold text-lg">Campaña creada en Klaviyo</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Tu campaña "{campaignData.subject}" ha sido creada exitosamente en Klaviyo.
          {sendStrategy === 'draft' && ' Puedes editarla directamente en tu cuenta de Klaviyo.'}
          {sendStrategy === 'scheduled' && ` Programada para ${scheduledAt}.`}
          {sendStrategy === 'immediate' && ' El envío ha sido iniciado.'}
          {sendStrategy === 'smart_send' && ' Klaviyo elegirá el mejor horario de envío.'}
        </p>
        {campaignId && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://www.klaviyo.com/campaigns/${campaignId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5"
            >
              <ExternalLink className="w-4 h-4" />
              Ver en Klaviyo
            </a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-base">Programar y Publicar</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configura cómo y cuándo se enviará tu campaña a través de Klaviyo.
        </p>
      </div>

      {/* Klaviyo List selector */}
      <div className="space-y-2">
        <Label>Lista de destinatarios</Label>
        {loadingLists ? (
          <Skeleton className="h-10 w-full" />
        ) : lists.length === 0 ? (
          <div className="text-center py-4 border rounded-lg border-dashed">
            <Mail className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No se encontraron listas en Klaviyo.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {connectionId ? 'Crea una lista en Klaviyo primero.' : 'Conecta Klaviyo en la sección de Conexiones.'}
            </p>
          </div>
        ) : (
          <Select value={selectedList} onValueChange={setSelectedList}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una lista" />
            </SelectTrigger>
            <SelectContent>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name} ({list.profile_count.toLocaleString()} perfiles)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Send strategy */}
      <div className="space-y-3">
        <Label>Estrategia de envío</Label>
        <RadioGroup
          value={sendStrategy}
          onValueChange={(v) => setSendStrategy(v as typeof sendStrategy)}
          className="space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="draft" id="strategy-draft" />
            <Label htmlFor="strategy-draft" className="font-normal cursor-pointer">
              <span className="font-medium">Borrador</span>
              <span className="text-muted-foreground"> — Crear sin programar, para editar en Klaviyo</span>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="scheduled" id="strategy-scheduled" />
            <Label htmlFor="strategy-scheduled" className="font-normal cursor-pointer">
              <span className="font-medium">Programado</span>
              <span className="text-muted-foreground"> — Elegir fecha y hora de envío</span>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="smart_send" id="strategy-smart" />
            <Label htmlFor="strategy-smart" className="font-normal cursor-pointer">
              <span className="font-medium">Smart Send</span>
              <span className="text-muted-foreground"> — Klaviyo elige la mejor hora para cada contacto</span>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="immediate" id="strategy-immediate" />
            <Label htmlFor="strategy-immediate" className="font-normal cursor-pointer">
              <span className="font-medium">Inmediato</span>
              <span className="text-muted-foreground"> — Enviar ahora mismo</span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Date/Time picker for scheduled sends */}
      {sendStrategy === 'scheduled' && (
        <div className="space-y-2">
          <Label htmlFor="scheduledAt">Fecha y hora de envío</Label>
          <Input
            id="scheduledAt"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Se usará la zona horaria configurada en tu cuenta de Klaviyo.
          </p>
        </div>
      )}

      {/* Publish button */}
      <div className="pt-4 border-t">
        <Button
          onClick={handlePublish}
          disabled={pushing || !selectedList || loadingLists}
          className="w-full"
          size="lg"
        >
          {pushing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creando campaña en Klaviyo...
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4 mr-2" />
              Crear en Klaviyo
            </>
          )}
        </Button>
        {sendStrategy === 'immediate' && (
          <p className="text-xs text-center text-amber-600 mt-2">
            La campaña se enviará inmediatamente a todos los contactos de la lista seleccionada.
          </p>
        )}
      </div>
    </div>
  );
}
