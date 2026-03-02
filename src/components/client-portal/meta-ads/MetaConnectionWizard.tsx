import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Facebook,
  Instagram,
  Crosshair,
  Megaphone,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import logoMeta from '@/assets/logo-meta-clean.png';
import type { PortfolioItem, BusinessGroup } from './MetaBusinessContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetaConnectionWizardProps {
  connectionId: string;
  onComplete: (portfolio: PortfolioItem) => void;
}

interface BusinessInfo {
  id: string;
  name: string;
  profile_picture_uri?: string;
}

type WizardStep = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MetaConnectionWizard({
  connectionId,
  onComplete,
}: MetaConnectionWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Business Managers
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessInfo | null>(null);

  // Step 2: Portfolios
  const [businessGroups, setBusinessGroups] = useState<BusinessGroup[]>([]);
  const [allPortfolios, setAllPortfolios] = useState<PortfolioItem[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioItem | null>(null);

  // Step 3: Confirming
  const [connecting, setConnecting] = useState(false);

  // ─── Step 1: Fetch Business Managers ──────────────────────────────────

  const fetchHierarchy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'fetch-meta-business-hierarchy',
        { body: { connection_id: connectionId } },
      );

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      // Extract businesses
      const biz: BusinessInfo[] = (data.businesses || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        profile_picture_uri: b.profile_picture_uri,
      }));
      setBusinesses(biz);

      // Parse groups
      const groups: BusinessGroup[] = (data.groups || []).map((g: any) => ({
        businessId: g.business_id,
        businessName: g.business_name,
        portfolios: (g.portfolios || []).map((p: any) => ({
          name: p.name,
          businessId: p.business_id,
          businessName: p.business_name,
          adAccountId: p.ad_account_id,
          adAccountName: p.ad_account_name,
          currency: p.currency,
          timezone: p.timezone,
          pageId: p.page_id,
          pageName: p.page_name,
          igAccountId: p.ig_account_id,
          igAccountName: p.ig_account_name,
          pixelId: p.pixel_id,
        })),
      }));
      setBusinessGroups(groups);
      setAllPortfolios(groups.flatMap((g) => g.portfolios));

      // Auto-select if only 1 BM
      if (biz.length === 1) {
        setSelectedBusiness(biz[0]);
        setStep(2);
      } else if (biz.length === 0 && groups.length > 0) {
        // Personal account - skip BM selection
        setSelectedBusiness({ id: 'personal', name: 'Cuenta Personal' });
        setStep(2);
      }
    } catch (err: any) {
      console.error('[MetaConnectionWizard] Hierarchy error:', err);
      setError(err?.message || 'Error cargando Business Managers');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  // ─── Step 3: Connect assets ──────────────────────────────────────────

  const handleConfirmConnect = async () => {
    if (!selectedPortfolio) return;
    setConnecting(true);
    try {
      // Save all assets to platform_connections
      const { error: updateError, data: updateData } = await supabase
        .from('platform_connections')
        .update({
          account_id: selectedPortfolio.adAccountId,
          store_name: selectedPortfolio.name,
          business_id: selectedPortfolio.businessId,
          portfolio_name: selectedPortfolio.name,
          page_id: selectedPortfolio.pageId,
          ig_account_id: selectedPortfolio.igAccountId,
          pixel_id: selectedPortfolio.pixelId,
        })
        .eq('id', connectionId)
        .select('id, account_id');

      if (updateError) throw updateError;
      if (!updateData || updateData.length === 0) {
        throw new Error('No se pudo actualizar la conexión (permisos insuficientes)');
      }

      toast.success(`Conectado: ${selectedPortfolio.name}`);
      onComplete(selectedPortfolio);
    } catch (err: any) {
      console.error('[MetaConnectionWizard] Connect error:', err);
      toast.error('Error al conectar activos');
    } finally {
      setConnecting(false);
    }
  };

  // ─── Get portfolios for selected business ─────────────────────────────

  const currentPortfolios = selectedBusiness
    ? allPortfolios.filter(
        (p) =>
          p.businessId === selectedBusiness.id ||
          selectedBusiness.id === 'personal',
      )
    : [];

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Cargando Business Managers y negocios...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="py-8 text-center">
          <Megaphone className="w-10 h-10 mx-auto text-destructive/50 mb-3" />
          <p className="text-sm font-medium text-destructive mb-2">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchHierarchy}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="py-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  s < step
                    ? 'bg-primary text-primary-foreground'
                    : s === step
                      ? 'bg-primary/20 text-primary border-2 border-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`w-12 h-0.5 ${s < step ? 'bg-primary' : 'bg-muted'}`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <img src={logoMeta} alt="Meta" className="h-8 w-8" />
          <div>
            <p className="text-sm font-semibold">
              {step === 1 && 'Paso 1: Selecciona tu Business Manager'}
              {step === 2 && 'Paso 2: Selecciona tu negocio'}
              {step === 3 && 'Paso 3: Confirma los activos a conectar'}
            </p>
            <p className="text-xs text-muted-foreground">
              {step === 1 && `${businesses.length} Business Manager${businesses.length !== 1 ? 's' : ''} encontrado${businesses.length !== 1 ? 's' : ''}`}
              {step === 2 && `${currentPortfolios.length} negocio${currentPortfolios.length !== 1 ? 's' : ''} en ${selectedBusiness?.name}`}
              {step === 3 && `Revisa los activos de "${selectedPortfolio?.name}"`}
            </p>
          </div>
        </div>

        {/* ─── Step 1: Select Business Manager ───────────────────────── */}
        {step === 1 && (
          <div className="space-y-2">
            {businesses.map((biz) => (
              <button
                key={biz.id}
                onClick={() => {
                  setSelectedBusiness(biz);
                  setStep(2);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left group"
              >
                <Building2 className="w-8 h-8 text-muted-foreground group-hover:text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{biz.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {biz.id}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
              </button>
            ))}
          </div>
        )}

        {/* ─── Step 2: Select Portfolio/Negocio ──────────────────────── */}
        {step === 2 && (
          <div className="space-y-2">
            {businesses.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep(1);
                  setSelectedPortfolio(null);
                }}
                className="mb-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Volver a Business Managers
              </Button>
            )}

            {currentPortfolios.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No se encontraron negocios activos en este Business Manager.
              </div>
            ) : (
              currentPortfolios.map((portfolio) => (
                <button
                  key={portfolio.adAccountId}
                  onClick={() => {
                    setSelectedPortfolio(portfolio);
                    setStep(3);
                  }}
                  className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left group"
                >
                  <Megaphone className="w-6 h-6 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{portfolio.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {portfolio.pageName && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Facebook className="w-3 h-3" />
                          {portfolio.pageName}
                        </Badge>
                      )}
                      {portfolio.igAccountName && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Instagram className="w-3 h-3" />
                          @{portfolio.igAccountName}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {portfolio.currency}
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary mt-1" />
                </button>
              ))
            )}
          </div>
        )}

        {/* ─── Step 3: Confirm Assets ────────────────────────────────── */}
        {step === 3 && selectedPortfolio && (
          <div className="space-y-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(2)}
              className="mb-1"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver a negocios
            </Button>

            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-sm">
                Activos de "{selectedPortfolio.name}"
              </h4>

              {/* Ad Account */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Cuenta Publicitaria</p>
                  <p className="text-sm font-medium">
                    {selectedPortfolio.adAccountName}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    act_{selectedPortfolio.adAccountId} - {selectedPortfolio.currency}
                  </p>
                </div>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>

              {/* Page */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600/10 flex items-center justify-center">
                  <Facebook className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Pagina de Facebook</p>
                  <p className="text-sm font-medium">
                    {selectedPortfolio.pageName || 'No detectada'}
                  </p>
                  {selectedPortfolio.pageId && (
                    <p className="text-xs text-muted-foreground font-mono">
                      ID: {selectedPortfolio.pageId}
                    </p>
                  )}
                </div>
                {selectedPortfolio.pageId ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Badge variant="outline" className="text-xs text-amber-600">
                    Opcional
                  </Badge>
                )}
              </div>

              {/* Instagram */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center">
                  <Instagram className="w-4 h-4 text-pink-500" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">
                    Cuenta de Instagram
                  </p>
                  <p className="text-sm font-medium">
                    {selectedPortfolio.igAccountName
                      ? `@${selectedPortfolio.igAccountName}`
                      : 'No vinculada'}
                  </p>
                </div>
                {selectedPortfolio.igAccountId ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Badge variant="outline" className="text-xs text-amber-600">
                    Opcional
                  </Badge>
                )}
              </div>

              {/* Pixel */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Crosshair className="w-4 h-4 text-purple-500" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Meta Pixel</p>
                  <p className="text-sm font-medium">
                    {selectedPortfolio.pixelId
                      ? `Pixel ${selectedPortfolio.pixelId}`
                      : 'Sin pixel — puedes crear uno despues'}
                  </p>
                </div>
                {selectedPortfolio.pixelId ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Badge variant="outline" className="text-xs text-amber-600">
                    Opcional
                  </Badge>
                )}
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleConfirmConnect}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Conectar estos activos
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
