import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LogOut, BarChart3, Link2, Loader2, ArrowLeft, Bot, FileText, Sparkles, Mail, MailCheck, Target, Settings, PieChart, ShieldAlert, Code, ShoppingBag, Lightbulb, ChevronDown, MessageSquare, Home, Instagram, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

import { ClientPortalMetrics } from '@/components/client-portal/ClientPortalMetrics';
import { ClientPortalConnections } from '@/components/client-portal/ClientPortalConnections';
import { SteveChat } from '@/components/client-portal/SteveChat';
import { SteveEstrategia } from '@/components/client-portal/SteveEstrategia';
import { BrandBriefView } from '@/components/client-portal/BrandBriefView';
import { CopyGenerator } from '@/components/client-portal/CopyGenerator';
import { GoogleAdsGenerator } from '@/components/client-portal/GoogleAdsGenerator';
import { CampaignStudio } from '@/components/client-portal/campaign-studio/CampaignStudio';
import { FinancialConfigPanel } from '@/components/client-portal/FinancialConfigPanel';
import { ChongaSupport } from '@/components/client-portal/ChongaSupport';
import { CampaignAnalyticsPanel } from '@/components/client-portal/CampaignAnalyticsPanel';
import { CompetitorDeepDivePanel } from '@/components/client-portal/CompetitorDeepDivePanel';
import MetaAdsManager from '@/components/client-portal/meta-ads/MetaAdsManager';
import { FloatingDiscountButton } from '@/components/client-portal/FloatingDiscountButton';
import { TabErrorBoundary } from '@/components/client-portal/TabErrorBoundary';
import { ShopifyDashboard } from '@/components/client-portal/ShopifyDashboard';
import { EmailMarketing } from '@/components/client-portal/email/EmailMarketing';
import { CommandPalette } from '@/components/client-portal/CommandPalette';
import { BottomNav } from '@/components/client-portal/BottomNav';
import { OfflineBanner } from '@/components/client-portal/OfflineBanner';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { SetupProgressTracker } from '@/components/client-portal/SetupProgressTracker';
import { TabCoachmark } from '@/components/client-portal/TabCoachmark';
import { KeyboardShortcutsDialog, useShortcutsDialog } from '@/components/client-portal/KeyboardShortcutsDialog';
import { WhatsAppHub } from '@/components/client-portal/whatsapp/WhatsAppHub';
import { IGMetricsDashboard } from '@/components/client-portal/instagram/IGMetricsDashboard';
import { InstagramHub } from '@/components/client-portal/InstagramHub';
import { SteveAcademy } from '@/components/client-portal/SteveAcademy';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';

type TabType = 'metrics' | 'shopify' | 'campaigns' | 'connections' | 'brief' | 'competitors' | 'deepdive' | 'steve' | 'estrategia' | 'copies' | 'instagram' | 'google' | 'klaviyo' | 'email' | 'config' | 'wa_credits' | 'academy';
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
  const [activeTab, setActiveTab] = useState<TabType>('connections');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabType>>(new Set(['connections']));
  const [adminViewClient, setAdminViewClient] = useState<ClientInfo | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const [defaultTabResolved, setDefaultTabResolved] = useState(false);
  const userNavigatedRef = useRef(false);
  const shortcutsDialog = useShortcutsDialog();

  // Wrapper for user-initiated tab navigation — prevents resolveDefaultTab from overriding
  const handleUserNavigate = (tab: TabType) => {
    userNavigatedRef.current = true;
    setActiveTab(tab);
  };

  // Track visited tabs so they stay mounted (preserves state like in-flight API calls)
  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      return new Set([...prev, activeTab]);
    });
  }, [activeTab]);

  // Listen for cross-component tab navigation events (e.g. from SmartInsightsPanel)
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab;
      if (tab) handleUserNavigate(tab as TabType);
    };
    window.addEventListener('steve:navigate-tab', handler);
    return () => window.removeEventListener('steve:navigate-tab', handler);
  }, []);

  // Keyboard shortcuts: 1-5 for primary tabs
  useEffect(() => {
    const tabMap: Record<string, TabType> = { '1': 'steve', '2': 'brief', '3': 'metrics', '4': 'connections', '5': 'config' };
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const tab = tabMap[e.key];
      if (tab) handleUserNavigate(tab);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // SECURITY: Only super admins can view other clients' portals
  // Shopify users with admin role should NOT have this access
  const isAdminView = isSuperAdmin && urlClientId;

  // Determine which client data to use
  const displayClient = isAdminView ? adminViewClient : clientData;
  const effectiveClientId = isAdminView ? urlClientId : clientData?.id;

  // Onboarding disabled — will rebuild properly later
  useEffect(() => {
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
      } catch {
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
      // SECURITY: Shopify users must not access admin client views
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

  // Determine smart default tab based on user state
  useEffect(() => {
    if (defaultTabResolved || roleLoading || authLoading) return;
    const id = isAdminView ? urlClientId : clientData?.id;
    if (!id) return;

    async function resolveDefaultTab() {
      try {
        // If user already clicked a tab before this async work finishes, don't override
        if (userNavigatedRef.current) return;

        // Check if user has platform connections
        const { data: connections } = await supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', id)
          .limit(1);

        if (userNavigatedRef.current) return;

        const hasConnections = connections && connections.length > 0;

        if (!hasConnections) {
          // No connections: go to Conexiones
          setActiveTab('connections');
          setVisitedTabs(new Set(['connections']));
        } else {
          // Has connections: check if brief exists
          const { data: brief } = await supabase
            .from('brand_research')
            .select('id')
            .eq('client_id', id)
            .limit(1);

          if (userNavigatedRef.current) return;

          const hasBrief = brief && brief.length > 0;

          if (!hasBrief) {
            // Has connections but no brief: go to Steve
            setActiveTab('steve');
            setVisitedTabs(new Set(['steve']));
          } else {
            // Has connections and brief: go to Metricas
            setActiveTab('metrics');
            setVisitedTabs(new Set(['metrics']));
          }
        }
      } catch (e) {
        // On error, default to metrics
        if (!userNavigatedRef.current) {
          setActiveTab('metrics');
          setVisitedTabs(new Set(['metrics']));
        }
      } finally {
        setDefaultTabResolved(true);
      }
    }

    resolveDefaultTab();
  }, [defaultTabResolved, roleLoading, authLoading, isAdminView, urlClientId, clientData?.id]);

  // Fetch client logo (validate URL before setting to avoid broken images)
  useEffect(() => {
    const id = isAdminView ? urlClientId : clientData?.id;
    if (!id) return;
    supabase
      .from('clients')
      .select("logo_url")
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data?.logo_url) {
          const img = new Image();
          img.onload = () => setClientLogoUrl(data.logo_url);
          img.onerror = () => { /* skip broken logo */ };
          img.src = data.logo_url;
        }
      });
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

    // Onboarding removed

  const primaryTabs = [
    { id: 'steve', label: 'Steve', icon: Bot },
    { id: 'brief', label: 'Brief', icon: FileText },
    { id: 'metrics', label: 'Métricas', icon: BarChart3 },
    { id: 'connections', label: 'Conexiones', icon: Link2 },
    { id: 'config', label: 'Configuración', icon: Settings },
  ] as const;

  const secondaryTabs = [
    { id: 'shopify', label: 'Shopify', icon: ShoppingBag },
    { id: 'campaigns', label: 'Campañas', icon: PieChart },
    { id: 'deepdive', label: 'Deep Dive', icon: Code },
    { id: 'estrategia', label: 'Estrategia', icon: Lightbulb },
    { id: 'copies', label: 'Meta Ads', icon: Sparkles },
    { id: 'instagram', label: 'Instagram', icon: Instagram },
    { id: 'google', label: 'Google Ads', icon: Target },
    { id: 'klaviyo', label: 'Klaviyo', icon: Mail },
    { id: 'email', label: 'Steve Mail', icon: MailCheck },
    { id: 'wa_credits', label: 'WhatsApp', icon: MessageSquare },
    { id: 'academy', label: 'Academy', icon: GraduationCap },
  ] as const;

  const tabs = [...primaryTabs, ...secondaryTabs] as const;

  return (
    <div className="min-h-screen bg-background">
      <OfflineBanner />
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="container px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isAdminView && (
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <img src={logo} alt="Steve Ads" className="h-12 w-auto" />
            <div className="hidden sm:block h-8 w-px bg-slate-200 mx-1" />
            <div className="hidden sm:flex flex-col items-start justify-center">
              {clientLogoUrl && (
                <img
                  src={clientLogoUrl}
                  alt={displayClient?.name}
                  className="h-8 w-auto max-w-[120px] object-contain mb-0.5"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900 leading-tight">{displayClient?.name}</p>
                {isAdminView && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    Vista Admin
                  </span>
                )}
              </div>
              {displayClient?.company && (
                <p className="text-xs text-slate-500 leading-tight">{displayClient.company}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-400 hidden sm:block">
              Portal Cliente
            </span>
            {!isAdminView && (
              <Button variant="ghost" size="icon" onClick={signOut} className="text-slate-400 hover:text-slate-700">
                <LogOut className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Breadcrumb — hidden on mobile */}
      <div className="hidden sm:block container px-6 pt-3 pb-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                href="#"
                onClick={(e) => { e.preventDefault(); handleUserNavigate('steve'); }}
                className="flex items-center gap-1 text-xs"
              >
                <Home className="w-3.5 h-3.5" />
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-xs">
                {tabs.find(t => t.id === activeTab)?.label || activeTab}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="container px-6 py-8 pb-20 md:pb-8 pt-4 sm:pt-6">
        {/* Tabs — hidden on mobile where BottomNav is used */}
        <div className="hidden md:flex gap-2 mb-8 overflow-x-auto pb-2 relative z-10">
          {primaryTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleUserNavigate(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-card text-slate-600 hover:bg-slate-100 border border-border'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  secondaryTabs.some(t => t.id === activeTab)
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-card text-slate-600 hover:bg-slate-100 border border-border'
                }`}
              >
                {secondaryTabs.find(t => t.id === activeTab)?.label || 'Más'}
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {secondaryTabs.map((tab) => (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => handleUserNavigate(tab.id)}
                  className={`flex items-center gap-2 text-sm ${activeTab === tab.id ? 'bg-primary/10 text-primary' : ''}`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Setup Progress Tracker */}
        {effectiveClientId && (
          <SetupProgressTracker clientId={effectiveClientId} onNavigate={(tab) => handleUserNavigate(tab as TabType)} />
        )}

        {/* Tab-specific coachmark */}
        <TabCoachmark tabId={activeTab} />

        {/* Content — tabs stay mounted once visited so in-flight requests complete */}
        <div>
          {visitedTabs.has('metrics') && effectiveClientId && (
            <div className={activeTab !== 'metrics' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Métricas">
                <ClientPortalMetrics clientId={effectiveClientId} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('campaigns') && effectiveClientId && (
            <div className={activeTab !== 'campaigns' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Campañas">
                <CampaignAnalyticsPanel clientId={effectiveClientId} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('shopify') && effectiveClientId && (
            <div className={activeTab !== 'shopify' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Shopify">
                <ShopifyDashboard clientId={effectiveClientId} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('connections') && effectiveClientId && (
            <div className={activeTab !== 'connections' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Conexiones">
                <ClientPortalConnections clientId={effectiveClientId} isAdmin={!!isAdminView} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('brief') && effectiveClientId && (
            <div className={activeTab !== 'brief' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Brief">
                <BrandBriefView
                  clientId={effectiveClientId}
                  onEditBrief={() => handleUserNavigate('steve')}
                />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('deepdive') && effectiveClientId && (
            <div className={activeTab !== 'deepdive' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Deep Dive">
                <CompetitorDeepDivePanel clientId={effectiveClientId} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('steve') && effectiveClientId && (
            <div className={activeTab !== 'steve' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Steve">
                <div className="max-w-2xl mx-auto">
                  <SteveChat clientId={effectiveClientId} />
                </div>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('estrategia') && effectiveClientId && (
            <div className={activeTab !== 'estrategia' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Estrategia">
                <div className="max-w-2xl mx-auto">
                  <SteveEstrategia clientId={effectiveClientId} />
                </div>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('copies') && effectiveClientId && (
            <div className={activeTab !== 'copies' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Meta Ads">
                <MetaAdsManager clientId={effectiveClientId} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('google') && effectiveClientId && (
            <div className={activeTab !== 'google' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Google Ads">
                <div className="max-w-4xl mx-auto">
                  <GoogleAdsGenerator clientId={effectiveClientId} />
                </div>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('klaviyo') && effectiveClientId && (
            <div className={activeTab !== 'klaviyo' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Klaviyo">
                <div className="max-w-4xl mx-auto">
                  <CampaignStudio clientId={effectiveClientId} />
                </div>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('email') && effectiveClientId && (
            <div className={activeTab !== 'email' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Steve Mail">
                <div className="max-w-5xl mx-auto">
                  <EmailMarketing clientId={effectiveClientId} />
                </div>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('instagram') && effectiveClientId && (
            <div className={activeTab !== 'instagram' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Instagram">
                <div className="max-w-5xl mx-auto">
                  <InstagramHub clientId={effectiveClientId} />
                </div>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('config') && effectiveClientId && (
            <div className={activeTab !== 'config' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Configuración">
                <FinancialConfigPanel clientId={effectiveClientId} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('wa_credits') && effectiveClientId && (
            <div className={activeTab !== 'wa_credits' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="WhatsApp">
                <div className="max-w-5xl mx-auto">
                  <WhatsAppHub clientId={effectiveClientId} />
                </div>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('academy') && effectiveClientId && (
            <div className={activeTab !== 'academy' ? 'hidden' : ''}>
              <TabErrorBoundary tabName="Academy">
                <div className="max-w-5xl mx-auto">
                  <SteveAcademy clientId={effectiveClientId} />
                </div>
              </TabErrorBoundary>
            </div>
          )}
        </div>
      </div>

      {/* Floating Discount Button */}
      {effectiveClientId && (
        <FloatingDiscountButton clientId={effectiveClientId} />
      )}

      {/* Chonga Support Bot */}
      {effectiveClientId && (
        <ChongaSupport clientId={effectiveClientId} />
      )}

      {/* Onboarding Modal — disabled */}

      {/* Cmd+K Command Palette */}
      <CommandPalette onNavigate={(tab) => handleUserNavigate(tab as TabType)} />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog open={shortcutsDialog.open} onOpenChange={shortcutsDialog.setOpen} />

      {/* Onboarding removed */}

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onNavigate={(tab) => handleUserNavigate(tab as TabType)}
        secondaryTabs={[
          { id: 'brief', label: 'Brief', icon: <FileText className="w-5 h-5" /> },
          ...secondaryTabs.map((t) => ({
            id: t.id,
            label: t.label,
            icon: <t.icon className="w-5 h-5" />,
          })),
        ]}
      />
    </div>
  );
}
