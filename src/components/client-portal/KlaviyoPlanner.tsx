import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Mail, ShoppingCart, UserMinus, Megaphone, 
  ChevronRight, ChevronDown, Trash2, Edit2, Check, 
  Clock, Send, Loader2, Save, Archive, Copy, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogDescription, DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logoKlaviyo from '@/assets/logo-klaviyo-clean.png';
import { KlaviyoPlanWizard } from './KlaviyoPlanWizard';
import { KlaviyoVariables } from './KlaviyoVariables';
import { SteveFeedbackDialog } from './SteveFeedbackDialog';

interface EmailStep {
  id: string;
  subject: string;
  previewText: string;
  content: string;
  delayDays: number;
  delayHours: number;
}

interface EmailPlan {
  id: string;
  client_id: string;
  flow_type: 'welcome_series' | 'abandoned_cart' | 'customer_winback' | 'campaign';
  name: string;
  status: 'draft' | 'pending_review' | 'approved' | 'implemented';
  campaign_date?: string;
  campaign_subject?: string;
  emails: EmailStep[];
  client_notes?: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
}

interface KlaviyoPlannerProps {
  clientId: string;
}

const flowTypeConfig = {
  welcome_series: {
    label: 'Serie de Bienvenida',
    icon: Mail,
    description: 'Emails automáticos para nuevos suscriptores',
    color: 'bg-blue-500/10 text-blue-600 border-blue-200',
    defaultEmails: [
      { subject: 'Bienvenido a [Marca]', delayDays: 0, delayHours: 0 },
      { subject: 'Conoce nuestros productos', delayDays: 1, delayHours: 0 },
      { subject: 'Tu descuento especial', delayDays: 3, delayHours: 0 },
    ],
  },
  abandoned_cart: {
    label: 'Carrito Abandonado',
    icon: ShoppingCart,
    description: 'Recupera ventas de carritos abandonados',
    color: 'bg-amber-500/10 text-amber-600 border-amber-200',
    defaultEmails: [
      { subject: 'Olvidaste algo en tu carrito', delayDays: 0, delayHours: 1 },
      { subject: 'Tu carrito te espera', delayDays: 0, delayHours: 24 },
      { subject: 'Última oportunidad: 10% de descuento', delayDays: 3, delayHours: 0 },
    ],
  },
  customer_winback: {
    label: 'Reactivación de Clientes',
    icon: UserMinus,
    description: 'Recupera clientes inactivos',
    color: 'bg-purple-500/10 text-purple-600 border-purple-200',
    defaultEmails: [
      { subject: 'Te extrañamos', delayDays: 30, delayHours: 0 },
      { subject: 'Mira lo nuevo que tenemos', delayDays: 45, delayHours: 0 },
      { subject: 'Oferta especial para ti', delayDays: 60, delayHours: 0 },
    ],
  },
  campaign: {
    label: 'Campaña Puntual',
    icon: Megaphone,
    description: 'Emails promocionales y de temporada',
    color: 'bg-green-500/10 text-green-600 border-green-200',
    defaultEmails: [],
  },
};

const statusConfig = {
  draft: { label: 'Borrador', color: 'bg-muted text-muted-foreground' },
  pending_review: { label: 'En Revisión', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Aprobado', color: 'bg-blue-100 text-blue-800' },
  implemented: { label: 'Implementado', color: 'bg-green-100 text-green-800' },
};

export function KlaviyoPlanner({ clientId }: KlaviyoPlannerProps) {
  const [plans, setPlans] = useState<EmailPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'flows' | 'campaigns' | 'archive'>('flows');
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [newPlanType, setNewPlanType] = useState<EmailPlan['flow_type'] | null>(null);
  const [showVariables, setShowVariables] = useState(false);
  
  // Feedback state
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastCreatedPlanId, setLastCreatedPlanId] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, [clientId]);

  async function fetchPlans() {
    try {
      const { data, error } = await supabase
        .from('klaviyo_email_plans')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Parse emails from JSONB and cast to our types
      const parsedPlans = (data || []).map(plan => ({
        id: plan.id,
        client_id: plan.client_id,
        flow_type: plan.flow_type as EmailPlan['flow_type'],
        name: plan.name,
        status: plan.status as EmailPlan['status'],
        campaign_date: plan.campaign_date ?? undefined,
        campaign_subject: plan.campaign_subject ?? undefined,
        emails: (Array.isArray(plan.emails) ? plan.emails : []) as unknown as EmailStep[],
        client_notes: plan.client_notes ?? undefined,
        admin_notes: plan.admin_notes ?? undefined,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      }));
      
      setPlans(parsedPlans);
    } catch (error) {
      console.error('Error fetching plans:', error);
      toast.error('Error al cargar los planes');
    } finally {
      setLoading(false);
    }
  }

  async function createPlanFromWizard(data: {
    name: string;
    emails: EmailStep[];
    notes: string;
    campaignDate?: string;
    selectedProducts?: string[];
  }) {
    if (!newPlanType) return;
    
    try {
      setSaving(true);

      const insertData = {
        client_id: clientId,
        flow_type: newPlanType,
        name: data.name,
        status: 'draft',
        emails: data.emails as unknown,
        client_notes: data.notes || null,
        campaign_date: data.campaignDate || null,
      };

      const { data: dbData, error } = await supabase
        .from('klaviyo_email_plans')
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;

      const newPlan: EmailPlan = {
        id: dbData.id,
        client_id: dbData.client_id,
        flow_type: dbData.flow_type as EmailPlan['flow_type'],
        name: dbData.name,
        status: dbData.status as EmailPlan['status'],
        campaign_date: dbData.campaign_date ?? undefined,
        campaign_subject: dbData.campaign_subject ?? undefined,
        emails: data.emails,
        client_notes: dbData.client_notes ?? undefined,
        admin_notes: dbData.admin_notes ?? undefined,
        created_at: dbData.created_at,
        updated_at: dbData.updated_at,
      };
      
      setPlans(prev => [newPlan, ...prev]);
      setExpandedPlan(dbData.id);
      setShowWizard(false);
      setNewPlanType(null);
      
      // Trigger Steve's feedback
      setLastCreatedPlanId(dbData.id);
      setShowFeedback(true);
      
      toast.success('Plan creado correctamente');
    } catch (error) {
      console.error('Error creating plan:', error);
      toast.error('Error al crear el plan');
    } finally {
      setSaving(false);
    }
  }

  async function updatePlan(planId: string, updates: Partial<EmailPlan>) {
    try {
      setSaving(true);
      
      // Convert emails to JSONB-compatible format if present
      const dbUpdates: Record<string, unknown> = { ...updates };
      if (updates.emails) {
        dbUpdates.emails = updates.emails as unknown as Record<string, unknown>[];
      }
      
      const { error } = await supabase
        .from('klaviyo_email_plans')
        .update(dbUpdates)
        .eq('id', planId);

      if (error) throw error;

      setPlans(prev => prev.map(p => 
        p.id === planId ? { ...p, ...updates } : p
      ));
      toast.success('Plan actualizado');
    } catch (error) {
      console.error('Error updating plan:', error);
      toast.error('Error al actualizar');
    } finally {
      setSaving(false);
    }
  }

  async function deletePlan(planId: string) {
    try {
      const { error } = await supabase
        .from('klaviyo_email_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;

      setPlans(prev => prev.filter(p => p.id !== planId));
      toast.success('Plan eliminado');
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast.error('Error al eliminar');
    }
  }

  function addEmailToPlan(planId: string) {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    const newEmail: EmailStep = {
      id: `email-${Date.now()}`,
      subject: 'Nuevo email',
      previewText: '',
      content: '',
      delayDays: plan.emails.length > 0 ? 1 : 0,
      delayHours: 0,
    };

    const updatedEmails = [...plan.emails, newEmail];
    updatePlan(planId, { emails: updatedEmails });
  }

  function updateEmailInPlan(planId: string, emailIndex: number, updates: Partial<EmailStep>) {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    const updatedEmails = plan.emails.map((email, idx) =>
      idx === emailIndex ? { ...email, ...updates } : email
    );
    
    setPlans(prev => prev.map(p => 
      p.id === planId ? { ...p, emails: updatedEmails } : p
    ));
  }

  function removeEmailFromPlan(planId: string, emailIndex: number) {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    const updatedEmails = plan.emails.filter((_, idx) => idx !== emailIndex);
    updatePlan(planId, { emails: updatedEmails });
  }

  async function submitForReview(planId: string) {
    await updatePlan(planId, { status: 'pending_review' });
  }

  const flowPlans = plans.filter(p => p.flow_type !== 'campaign' && p.status !== 'implemented');
  const campaignPlans = plans.filter(p => p.flow_type === 'campaign' && p.status !== 'implemented');
  const archivedPlans = plans.filter(p => p.status === 'implemented');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logoKlaviyo} alt="Klaviyo" className="h-8 w-auto" />
          <div>
            <h2 className="text-xl font-semibold">Email Marketing</h2>
            <p className="text-sm text-muted-foreground">
              Planifica tus automatizaciones y campañas de email
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowVariables(!showVariables)}
          className="flex items-center gap-2"
        >
          <Copy className="w-4 h-4" />
          Variables
        </Button>
      </div>

      {/* Klaviyo Variables Panel */}
      {showVariables && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <KlaviyoVariables />
        </motion.div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'flows' | 'campaigns' | 'archive')}>
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="flows" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Automatizaciones
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            Campañas
          </TabsTrigger>
          <TabsTrigger value="archive" className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Archivo
            {archivedPlans.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {archivedPlans.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Flows Tab */}
        <TabsContent value="flows" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(['welcome_series', 'abandoned_cart', 'customer_winback'] as const).map((type) => {
              const config = flowTypeConfig[type];
              const Icon = config.icon;
              return (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewPlanType(type);
                    setShowWizard(true);
                  }}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <Icon className="w-4 h-4" />
                  {config.label}
                </Button>
              );
            })}
          </div>

          {flowPlans.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  No tienes automatizaciones creadas.
                </p>
                <p className="text-sm text-muted-foreground">
                  Crea tu primera serie de bienvenida, carrito abandonado o winback.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {flowPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  expanded={expandedPlan === plan.id}
                  onToggle={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                  onUpdate={updatePlan}
                  onDelete={deletePlan}
                  onAddEmail={addEmailToPlan}
                  onUpdateEmail={updateEmailInPlan}
                  onRemoveEmail={removeEmailFromPlan}
                  onSubmitForReview={submitForReview}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewPlanType('campaign');
              setShowWizard(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <Megaphone className="w-4 h-4" />
            Nueva Campaña
          </Button>

          {campaignPlans.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Megaphone className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  No tienes campañas creadas.
                </p>
                <p className="text-sm text-muted-foreground">
                  Crea campañas para promociones, lanzamientos o fechas especiales.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {campaignPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  expanded={expandedPlan === plan.id}
                  onToggle={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                  onUpdate={updatePlan}
                  onDelete={deletePlan}
                  onAddEmail={addEmailToPlan}
                  onUpdateEmail={updateEmailInPlan}
                  onRemoveEmail={removeEmailFromPlan}
                  onSubmitForReview={submitForReview}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Archive Tab */}
        <TabsContent value="archive" className="space-y-4">
          {archivedPlans.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Archive className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  No hay planes archivados.
                </p>
                <p className="text-sm text-muted-foreground">
                  Los planes implementados aparecerán aquí.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {archivedPlans.map((plan) => (
                <ArchivedPlanCard
                  key={plan.id}
                  plan={plan}
                  expanded={expandedPlan === plan.id}
                  onToggle={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Wizard Dialog */}
      <Dialog open={showWizard} onOpenChange={(open) => {
        setShowWizard(open);
        if (!open) setNewPlanType(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {newPlanType && (
            <KlaviyoPlanWizard
              flowType={newPlanType}
              clientId={clientId}
              onComplete={createPlanFromWizard}
              onCancel={() => {
                setShowWizard(false);
                setNewPlanType(null);
              }}
              saving={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Steve Feedback Dialog */}
      {showFeedback && lastCreatedPlanId && (
        <SteveFeedbackDialog
          clientId={clientId}
          contentType="klaviyo_email"
          contentId={lastCreatedPlanId}
          onComplete={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}

// Subcomponent for Plan Card
interface PlanCardProps {
  plan: EmailPlan;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (planId: string, updates: Partial<EmailPlan>) => Promise<void>;
  onDelete: (planId: string) => Promise<void>;
  onAddEmail: (planId: string) => void;
  onUpdateEmail: (planId: string, emailIndex: number, updates: Partial<EmailStep>) => void;
  onRemoveEmail: (planId: string, emailIndex: number) => void;
  onSubmitForReview: (planId: string) => Promise<void>;
  saving: boolean;
}

function PlanCard({
  plan,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddEmail,
  onUpdateEmail,
  onRemoveEmail,
  onSubmitForReview,
  saving,
}: PlanCardProps) {
  const config = flowTypeConfig[plan.flow_type];
  const status = statusConfig[plan.status];
  const Icon = config.icon;
  const [clientNotes, setClientNotes] = useState(plan.client_notes || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <Card className={expanded ? 'ring-2 ring-primary/20' : ''}>
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <span>{config.label}</span>
                <span>•</span>
                <span>{plan.emails.length} emails</span>
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={status.color}>{status.label}</Badge>
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-4 border-t pt-4">
              {/* Email Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Secuencia de Emails</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAddEmail(plan.id)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar Email
                  </Button>
                </div>

                {plan.emails.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No hay emails en esta secuencia.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {plan.emails.map((email, index) => (
                      <EmailStepCard
                        key={email.id}
                        email={email}
                        index={index}
                        isFirst={index === 0}
                        onUpdate={(updates) => onUpdateEmail(plan.id, index, updates)}
                        onRemove={() => onRemoveEmail(plan.id, index)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Client Notes */}
              <div className="space-y-2">
                <Label htmlFor={`notes-${plan.id}`}>Notas para el equipo</Label>
                <Textarea
                  id={`notes-${plan.id}`}
                  placeholder="Describe el objetivo, tono, ofertas especiales, etc."
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Admin Notes (read-only) */}
              {plan.admin_notes && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Comentarios del equipo:</p>
                  <p className="text-sm">{plan.admin_notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Eliminar
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUpdate(plan.id, { client_notes: clientNotes })}
                    disabled={saving}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    Guardar
                  </Button>
                  {plan.status === 'draft' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onUpdate(plan.id, { client_notes: clientNotes });
                        onSubmitForReview(plan.id);
                      }}
                      disabled={saving || plan.emails.length === 0}
                    >
                      <Send className="w-4 h-4 mr-1" />
                      Enviar a Revisión
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>¿Eliminar este plan?</DialogTitle>
                  <DialogDescription>
                    Esta acción no se puede deshacer. Se eliminarán todos los emails configurados.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={() => {
                      onDelete(plan.id);
                      setShowDeleteConfirm(false);
                    }}
                  >
                    Eliminar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// Subcomponent for Email Step
interface EmailStepCardProps {
  email: EmailStep;
  index: number;
  isFirst: boolean;
  onUpdate: (updates: Partial<EmailStep>) => void;
  onRemove: () => void;
}

function EmailStepCard({ email, index, isFirst, onUpdate, onRemove }: EmailStepCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localEmail, setLocalEmail] = useState(email);

  const delayText = isFirst
    ? 'Inmediato'
    : email.delayDays > 0
    ? `${email.delayDays} día${email.delayDays > 1 ? 's' : ''} después`
    : `${email.delayHours} hora${email.delayHours > 1 ? 's' : ''} después`;

  return (
    <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border group">
      {/* Timeline indicator */}
      <div className="flex flex-col items-center mt-1">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
          {index + 1}
        </div>
        {!isFirst && (
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {delayText}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Asunto</Label>
              <Input
                value={localEmail.subject}
                onChange={(e) => setLocalEmail({ ...localEmail, subject: e.target.value })}
                placeholder="Asunto del email"
              />
            </div>
            <div className="space-y-2">
              <Label>Texto de vista previa</Label>
              <Input
                value={localEmail.previewText}
                onChange={(e) => setLocalEmail({ ...localEmail, previewText: e.target.value })}
                placeholder="Texto que aparece junto al asunto"
              />
            </div>
            <div className="space-y-2">
              <Label>Contenido / Briefing</Label>
              <Textarea
                value={localEmail.content}
                onChange={(e) => setLocalEmail({ ...localEmail, content: e.target.value })}
                placeholder="Describe qué debe incluir este email: productos, ofertas, CTA, etc."
                rows={4}
              />
            </div>
            {/* Compact variables reference */}
            <KlaviyoVariables compact />
            {!isFirst && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Días después</Label>
                  <Input
                    type="number"
                    min={0}
                    value={localEmail.delayDays}
                    onChange={(e) => setLocalEmail({ ...localEmail, delayDays: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Horas después</Label>
                  <Input
                    type="number"
                    min={0}
                    value={localEmail.delayHours}
                    onChange={(e) => setLocalEmail({ ...localEmail, delayHours: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onUpdate(localEmail);
                  setIsEditing(false);
                }}
              >
                <Check className="w-4 h-4 mr-1" />
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-medium text-sm truncate">{email.subject}</p>
            {email.previewText && (
              <p className="text-xs text-muted-foreground truncate">{email.previewText}</p>
            )}
            {email.content && (
              <p className="text-xs text-muted-foreground line-clamp-2">{email.content}</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isEditing && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Subcomponent for Archived Plan Card (read-only view)
interface ArchivedPlanCardProps {
  plan: EmailPlan;
  expanded: boolean;
  onToggle: () => void;
}

function ArchivedPlanCard({ plan, expanded, onToggle }: ArchivedPlanCardProps) {
  const config = flowTypeConfig[plan.flow_type];
  const Icon = config.icon;
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  async function copyEmailContent(email: EmailStep) {
    const content = `Asunto: ${email.subject}\n\nVista previa: ${email.previewText || '(sin definir)'}\n\nContenido:\n${email.content || '(sin definir)'}`;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedEmail(email.id);
      toast.success('Email copiado al portapapeles');
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch (error) {
      toast.error('Error al copiar');
    }
  }

  async function copyAllEmails() {
    const content = plan.emails.map((email, idx) => {
      const delay = idx === 0 
        ? 'Inmediato' 
        : `${email.delayDays} días, ${email.delayHours} horas después`;
      return `=== EMAIL ${idx + 1} ===\nTiming: ${delay}\nAsunto: ${email.subject}\nVista previa: ${email.previewText || '(sin definir)'}\nContenido:\n${email.content || '(sin definir)'}\n`;
    }).join('\n');
    
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Todos los emails copiados');
    } catch (error) {
      toast.error('Error al copiar');
    }
  }

  return (
    <Card className="opacity-90">
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {plan.name}
                <Badge variant="secondary" className="text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  Implementado
                </Badge>
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <span>{config.label}</span>
                <span>•</span>
                <span>{plan.emails.length} emails</span>
                <span>•</span>
                <span>{new Date(plan.created_at).toLocaleDateString()}</span>
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-4 border-t pt-4">
              {/* Copy all button */}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={copyAllEmails}>
                  <Copy className="w-4 h-4 mr-1" />
                  Copiar todos los emails
                </Button>
              </div>

              {/* Email list (read-only) */}
              <div className="space-y-2">
                {plan.emails.map((email, index) => {
                  const delayText = index === 0
                    ? 'Inmediato'
                    : email.delayDays > 0
                    ? `${email.delayDays} día${email.delayDays > 1 ? 's' : ''} después`
                    : `${email.delayHours} hora${email.delayHours > 1 ? 's' : ''} después`;

                  return (
                    <div
                      key={email.id}
                      className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border group"
                    >
                      <div className="flex flex-col items-center mt-1">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        {index > 0 && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {delayText}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-medium text-sm">{email.subject}</p>
                        {email.previewText && (
                          <p className="text-xs text-muted-foreground">{email.previewText}</p>
                        )}
                        {email.content && (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{email.content}</p>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyEmailContent(email)}
                      >
                        {copiedEmail === email.id ? (
                          <Check className="w-4 h-4 text-primary" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              {plan.client_notes && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Notas del plan:
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{plan.client_notes}</p>
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
