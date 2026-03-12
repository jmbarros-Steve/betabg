import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Building2, Upload, CheckCircle2, ChevronRight, ShoppingBag, Loader2, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { SteveChat } from './SteveChat';
import { ClientPortalConnections } from './ClientPortalConnections';
import avatarSteve from '@/assets/avatar-steve.png';
import logoShopify from '@/assets/logo-shopify-clean.png';
import logoMeta from '@/assets/logo-meta-clean.png';

interface OnboardingWizardProps {
  clientId: string;
  initialStep: number;
  onComplete: () => void;
}

const STEPS = [
  { number: 1, label: 'Tu Marca' },
  { number: 2, label: 'Brand Brief' },
  { number: 3, label: 'Shopify' },
  { number: 4, label: 'Meta & Klaviyo' },
];

export function OnboardingWizard({ clientId, initialStep, onComplete }: OnboardingWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);

  // Step 1 fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Step 2 - brief completion tracking
  const [briefComplete, setBriefComplete] = useState(false);

  // Load existing client data for step 1
  useEffect(() => {
    async function loadClient() {
      const { data } = await supabase
        .from('clients')
        .select('name, company, logo_url')
        .eq('id', clientId)
        .single();
      if (data) {
        const parts = (data.name || '').split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
        setCompany(data.company || '');
        if (data.logo_url) setLogoPreview(data.logo_url);
      }
    }
    loadClient();
  }, [clientId]);

  // Check if brief is already complete
  useEffect(() => {
    async function checkBrief() {
      const { data } = await supabase
        .from('buyer_personas')
        .select('is_complete')
        .eq('client_id', clientId)
        .eq('is_complete', true)
        .maybeSingle();
      if (data) setBriefComplete(true);
    }
    checkBrief();
  }, [clientId]);

  // Listen for brief completion from SteveChat
  useEffect(() => {
    if (step !== 2) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('buyer_personas')
        .select('is_complete')
        .eq('client_id', clientId)
        .eq('is_complete', true)
        .maybeSingle();
      if (data) {
        setBriefComplete(true);
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [step, clientId]);

  async function saveStep(nextStep: number) {
    setSaving(true);
    try {
      await supabase
        .from('clients')
        .update({ onboarding_step: nextStep > 4 ? null : nextStep } as any)
        .eq('id', clientId);

      if (nextStep > 4) {
        onComplete();
      } else {
        setStep(nextStep);
      }
    } catch (e) {
      console.error('Error saving step:', e);
    } finally {
      setSaving(false);
    }
  }

  async function handleStep1Submit() {
    if (!firstName.trim()) {
      toast.error('Ingresa tu nombre');
      return;
    }
    if (!company.trim()) {
      toast.error('Ingresa el nombre de tu empresa');
      return;
    }

    setSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const updates: Record<string, any> = {
        name: fullName,
        company: company.trim(),
      };

      // Upload logo if selected
      if (logoFile && user) {
        const ext = logoFile.name.split('.').pop();
        const path = `${user.id}/logo/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('client-assets')
          .upload(path, logoFile);
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('client-assets')
            .getPublicUrl(path);
          updates.logo_url = urlData.publicUrl;

          // Also save to client_assets table
          await supabase.from('client_assets').insert({
            client_id: clientId,
            url: urlData.publicUrl,
            nombre: logoFile.name,
            tipo: 'logo',
          });
        }
      }

      const { error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', clientId);

      if (error) throw error;
      await saveStep(2);
    } catch (e) {
      console.error('Error saving step 1:', e);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-semibold text-foreground">Configurar tu cuenta</h1>
            <span className="text-sm text-muted-foreground">Paso {step} de 4</span>
          </div>

          {/* Step indicators */}
          <div className="flex gap-2">
            {STEPS.map((s) => (
              <div key={s.number} className="flex-1">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    s.number < step
                      ? 'bg-primary'
                      : s.number === step
                        ? 'bg-primary'
                        : 'bg-muted'
                  }`}
                />
                <p className={`text-xs mt-1 ${
                  s.number <= step ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {/* STEP 1: Tu Marca */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Cuéntanos sobre ti</h2>
                <p className="text-muted-foreground">Datos básicos para personalizar tu experiencia</p>
              </div>

              <Card className="bg-card rounded-xl shadow-sm">
                <CardContent className="p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Nombre *</Label>
                      <Input
                        id="firstName"
                        placeholder="Juan"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Apellido</Label>
                      <Input
                        id="lastName"
                        placeholder="Pérez"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company">Nombre de tu empresa *</Label>
                    <Input
                      id="company"
                      placeholder="Mi Tienda SpA"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Logo de tu empresa</Label>
                    <div className="flex items-center gap-4">
                      {logoPreview ? (
                        <div className="relative">
                          <img
                            src={logoPreview}
                            alt="Logo"
                            className="h-16 w-16 rounded-lg object-contain border"
                          />
                          <button
                            onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
                          <Upload className="w-5 h-5 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Subir logo</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoSelect}
                          />
                        </label>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Opcional. PNG o JPG, máx 5MB</p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  onClick={handleStep1Submit}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-white px-8"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Siguiente
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Brand Brief (SteveChat) */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-3">
                  <img src={avatarSteve} alt="Steve" className="h-10 w-10 rounded-full" />
                  <h2 className="text-2xl font-bold text-foreground">Crea tu Brand Brief</h2>
                </div>
                <p className="text-muted-foreground">
                  Steve te hará preguntas para conocer tu marca. Toma ~15 minutos.
                </p>
              </div>

              {/* SteveChat embedded - the exact same component */}
              <div className="max-w-2xl mx-auto">
                <SteveChat clientId={clientId} />
              </div>

              {/* Show "Next" only when brief is complete */}
              {briefComplete && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-3 pt-4"
                >
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Brief completado</span>
                  </div>
                  <Button
                    onClick={() => saveStep(3)}
                    disabled={saving}
                    className="bg-primary hover:bg-primary/90 text-white px-8"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Siguiente: Conectar Shopify
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </motion.div>
              )}

              {/* Option to skip if they want to come back later */}
              {!briefComplete && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => saveStep(3)}
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Continuar después, saltar por ahora
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 3: Conectar Shopify */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-3">
                  <img src={logoShopify} alt="Shopify" className="h-10 w-10 object-contain" />
                  <h2 className="text-2xl font-bold text-foreground">Conecta tu tienda Shopify</h2>
                </div>
                <p className="text-muted-foreground">
                  Conecta Shopify para ver métricas de ventas, productos y pedidos en tiempo real.
                </p>
              </div>

              <Card className="bg-card rounded-xl shadow-sm">
                <CardContent className="p-6">
                  <ClientPortalConnections clientId={clientId} isAdmin={false} />
                </CardContent>
              </Card>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => saveStep(4)}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Saltar por ahora
                </button>
                <Button
                  onClick={() => saveStep(4)}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-white px-8"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Siguiente
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Meta & Klaviyo */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-3">
                  <img src={logoMeta} alt="Meta" className="h-10 w-10 object-contain" />
                  <h2 className="text-2xl font-bold text-foreground">Conecta Meta & Klaviyo</h2>
                </div>
                <p className="text-muted-foreground">
                  Conecta Meta Ads para campañas y Klaviyo para email marketing. Puedes hacerlo ahora o después.
                </p>
              </div>

              <Card className="bg-card rounded-xl shadow-sm">
                <CardContent className="p-6">
                  <ClientPortalConnections clientId={clientId} isAdmin={false} />
                </CardContent>
              </Card>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => saveStep(5)}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Saltar por ahora
                </button>
                <Button
                  onClick={() => saveStep(5)}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-white px-8"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Ir al portal
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
