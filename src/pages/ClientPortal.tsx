import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, BarChart3, Link2, Loader2, ArrowLeft, Bot, FileText, Sparkles, Mail, Target, Settings, PieChart, ShieldAlert, Instagram, Code, ShoppingBag, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

import { ClientPortalMetrics } from '@/components/client-portal/ClientPortalMetrics';
import { ClientPortalConnections } from '@/components/client-portal/ClientPortalConnections';
import { SteveChat } from '@/components/client-portal/SteveChat';
import { BrandBriefView } from '@/components/client-portal/BrandBriefView';
import { CopyGenerator } from '@/components/client-portal/CopyGenerator';
import { GoogleAdsGenerator } from '@/components/client-portal/GoogleAdsGenerator';
import { KlaviyoPlanner } from '@/components/client-portal/KlaviyoPlanner';
import { FinancialConfigPanel } from '@/components/client-portal/FinancialConfigPanel';
import { ChongaSupport } from '@/components/client-portal/ChongaSupport';
import { ClientOnboarding } from '@/components/client-portal/ClientOnboarding';
import { CampaignAnalyticsPanel } from '@/components/client-portal/CampaignAnalyticsPanel';
import { CompetitorAdsPanel } from '@/components/client-portal/CompetitorAdsPanel';
import { CompetitorDeepDivePanel } from '@/components/client-portal/CompetitorDeepDivePanel';
import { FloatingDiscountButton } from '@/components/client-portal/FloatingDiscountButton';
import { ShopifyDashboard } from '@/components/client-portal/ShopifyDashboard';
import { SteveStrategyChat } from '@/components/client-portal/SteveStrategyChat';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';

type TabType = 'metrics' | 'shopify' | 'campaigns' | 'connections' | 'brief' | 'competitors' | 'deepdive' | 'steve' | 'strategy' | 'copies' | 'google' | 'klaviyo' | 'config';
interface ClientInfo {
  id: string;
  name: string;
  company: string | null;
  shop_domain: string | null;
}

export default function ClientPortal() {
  const { clientId: urlClientId } = useParams<{ clientId: string }>();
  const { user, loading: authLoading, signOut } = useAuth();
  const { isClient, isAdmin, isSuperAdmin, isShopifyUser, loading: roleLoading, clientData } = useUserRole();
  
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('metrics');
  const [adminViewClient, setAdminViewClient] = useState<ClientInfo | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);

  // SECURITY: Only super admins can view other clients' portals
  // Shopify users with admin role should NOT have this access
  const isAdminView = isSuperAdmin && urlClientId;
  
  // Determine which client data to use
  const displayClient = isAdminView ? adminViewClient : clientData;
  const effectiveClientId = isAdminView ? urlClientId : clientData?.id;

  // Check if this is first visit for onboarding
  useEffect(() => {
    if (user && isClient && !isAdminView) {
      const onboardingKey = `bg_onboarding_${user.id}`;
      const hasSeenOnboarding = localStorage.getItem(onboardingKey);
      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    }
  }, [user, isClient, isAdminView]);

  // Claridad de sesión: mostrar una vez al entrar al portal que la sesión está activa
  useEffect(() => {
    if (!user || !isClient || isAdminView || roleLoading) return;
    const key = 'bg_portal_session_toast';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, 'true');
      toast.success('Has iniciado sesión correctamente. Bienvenido a tu portal.');
    }
  }, [user, isClient, isAdminView, roleLoading]);

  const handleCompleteOnboarding = () => {
    if (user) {
      localStorage.setItem(`bg_onboarding_${user.id}`, 'true');
    }
    setShowOnboarding(false);
  };

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Fetch client data for admin view - ONLY for super admins
  useEffect(() => {
    async function fetchClientForAdmin() {
      // SECURITY: Only super admins can view other clients
      if (!isSuperAdmin || !urlClientId) return;
      
      setLoadingClient(true);
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('id, name, company, shop_domain')
          .eq('id', urlClientId)
          .single();

        if (error) throw error;
        setAdminViewClient(data);
      } catch (error) {
        console.error('Error fetching client:', error);
        navigate('/dashboard');
      } finally {
        setLoadingClient(false);
      }
    }

    if (!roleLoading && isSuperAdmin && urlClientId) {
      fetchClientForAdmin();
    }
  }, [isSuperAdmin, urlClientId, roleLoading, navigate]);

  useEffect(() => {
    // SECURITY: Redirect logic with multitenancy protection
    if (roleLoading || !user || isAdminView) return;

    // SECURITY: If user is a Shopify user trying to access admin URLs, redirect to portal
    if (isShopifyUser && urlClientId) {
      console.warn('SECURITY: Shopify user attempted to access admin client view');
      navigate('/portal');
      return;
    }

    // If user is super admin (but not viewing a specific client), send them to dashboard
    if (isSuperAdmin && !isClient) {
      navigate('/dashboard');
      return;
    }

    // If user has no client role and isn't a super admin, block portal access
    if (!isClient && !isSuperAdmin) {
      navigate('/auth');
    }
  }, [roleLoading, isClient, isAdmin, isSuperAdmin, isShopifyUser, isAdminView, user, urlClientId, navigate]);

  // Fetch client logo
  useEffect(() => {
    const id = isAdminView ? urlClientId : clientData?.id;
    if (!id) return;
    supabase
      .from('clients')
      .select('logo_url')
      .eq('id', id)
      .single()
      .then(({ data }) => { if (data?.logo_url) setClientLogoUrl(data.logo_url); });
  }, [clientData?.id, urlClientId, isAdminView]);

  if (authLoading || roleLoading || loadingClient) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (!displayClient && !isAdminView)) {
    return null;
  }

  const tabs = [
    { id: 'metrics', label: 'Métricas', icon: BarChart3 },
    { id: 'shopify', label: 'Shopify', icon: ShoppingBag },
    { id: 'campaigns', label: 'Campañas', icon: PieChart },
    { id: 'connections', label: 'Conexiones', icon: Link2 },
    { id: 'brief', label: 'Brief', icon: FileText },
    { id: 'competitors', label: 'Competencia', icon: Instagram },
    { id: 'deepdive', label: 'Deep Dive', icon: Code },
    { id: 'steve', label: 'Steve', icon: Bot },
    { id: 'strategy', label: 'Steve Estrategia', icon: MessageSquare },
    { id: 'copies', label: 'Meta Ads', icon: Sparkles },
    { id: 'google', label: 'Google Ads', icon: Target },
    { id: 'klaviyo', label: 'Klaviyo', icon: Mail },
    { id: 'config', label: 'Configuración', icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isAdminView && (
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <img src={logo} alt="Consultoría BG" className="h-10 w-auto" />
            <div className="hidden sm:block h-8 w-px bg-border mx-1" />
            <div className="hidden sm:flex flex-col items-start justify-center">
              {clientLogoUrl && (
                <img src={clientLogoUrl} alt={displayClient?.name} className="h-8 w-auto max-w-[120px] object-contain mb-0.5" />
              )}
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium leading-tight">{displayClient?.name}</p>
                {isAdminView && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Vista Admin
                  </span>
                )}
              </div>
              {displayClient?.company && (
                <p className="text-xs text-muted-foreground leading-tight">{displayClient.company}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-widest text-muted-foreground hidden sm:block">
              Portal Cliente
            </span>
            {!isAdminView && (
              <Button variant="ghost" size="icon" onClick={signOut}>
                <LogOut className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 uppercase tracking-wider text-xs whitespace-nowrap"
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'metrics' && effectiveClientId && (
            <ClientPortalMetrics clientId={effectiveClientId} />
          )}
          {activeTab === 'campaigns' && effectiveClientId && (
            <CampaignAnalyticsPanel clientId={effectiveClientId} />
          )}
          {activeTab === 'shopify' && effectiveClientId && (
            <ShopifyDashboard clientId={effectiveClientId} />
          )}
          {activeTab === 'connections' && effectiveClientId && (
            <ClientPortalConnections clientId={effectiveClientId} isAdmin={!!isAdminView} />
          )}
          {activeTab === 'brief' && effectiveClientId && (
            <BrandBriefView 
              clientId={effectiveClientId} 
              onEditBrief={() => setActiveTab('steve')} 
            />
          )}
          {activeTab === 'competitors' && effectiveClientId && (
            <CompetitorAdsPanel clientId={effectiveClientId} />
          )}
          {activeTab === 'deepdive' && effectiveClientId && (
            <CompetitorDeepDivePanel clientId={effectiveClientId} />
          )}
          {activeTab === 'steve' && effectiveClientId && (
            <div className="max-w-2xl mx-auto">
              <SteveChat clientId={effectiveClientId} />
            </div>
          )}
          {activeTab === 'strategy' && effectiveClientId && (
            <div className="max-w-2xl mx-auto">
              <SteveStrategyChat clientId={effectiveClientId} />
            </div>
          )}
          {activeTab === 'copies' && effectiveClientId && (
            <div className="max-w-4xl mx-auto">
              <CopyGenerator clientId={effectiveClientId} />
            </div>
          )}
          {activeTab === 'google' && effectiveClientId && (
            <div className="max-w-4xl mx-auto">
              <GoogleAdsGenerator clientId={effectiveClientId} />
            </div>
          )}
          {activeTab === 'klaviyo' && effectiveClientId && (
            <div className="max-w-4xl mx-auto">
              <KlaviyoPlanner clientId={effectiveClientId} />
            </div>
          )}
          {activeTab === 'config' && effectiveClientId && (
            <FinancialConfigPanel clientId={effectiveClientId} />
          )}
        </motion.div>
      </div>

      {/* Floating Discount Button */}
      {effectiveClientId && (
        <FloatingDiscountButton clientId={effectiveClientId} />
      )}

      {/* Chonga Support Bot */}
      {effectiveClientId && (
        <ChongaSupport clientId={effectiveClientId} />
      )}

      {/* Onboarding Modal */}
      {showOnboarding && (
        <ClientOnboarding 
          onComplete={handleCompleteOnboarding}
          clientName={displayClient?.name}
        />
      )}
    </div>
  );
}
