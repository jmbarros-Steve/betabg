import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, BarChart3, Link2, Loader2, ArrowLeft, Bot, FileText, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { ClientPortalMetrics } from '@/components/client-portal/ClientPortalMetrics';
import { ClientPortalConnections } from '@/components/client-portal/ClientPortalConnections';
import { SteveChat } from '@/components/client-portal/SteveChat';
import { BrandBriefView } from '@/components/client-portal/BrandBriefView';
import { CopyGenerator } from '@/components/client-portal/CopyGenerator';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.jpg';

type TabType = 'metrics' | 'connections' | 'brief' | 'steve' | 'copies';
interface ClientInfo {
  id: string;
  name: string;
  company: string | null;
}

export default function ClientPortal() {
  const { clientId: urlClientId } = useParams<{ clientId: string }>();
  const { user, loading: authLoading, signOut } = useAuth();
  const { isClient, isAdmin, loading: roleLoading, clientData } = useUserRole();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('metrics');
  const [adminViewClient, setAdminViewClient] = useState<ClientInfo | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);

  // Admin viewing a specific client's portal
  const isAdminView = isAdmin && urlClientId;
  
  // Determine which client data to use
  const displayClient = isAdminView ? adminViewClient : clientData;
  const effectiveClientId = isAdminView ? urlClientId : clientData?.id;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Fetch client data for admin view
  useEffect(() => {
    async function fetchClientForAdmin() {
      if (!isAdmin || !urlClientId) return;
      
      setLoadingClient(true);
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('id, name, company')
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

    if (!roleLoading && isAdmin && urlClientId) {
      fetchClientForAdmin();
    }
  }, [isAdmin, urlClientId, roleLoading, navigate]);

  useEffect(() => {
    // Redirect regular users who aren't clients and aren't admin viewing
    if (!roleLoading && user && !isClient && !isAdminView) {
      navigate('/dashboard');
    }
  }, [roleLoading, isClient, isAdminView, user, navigate]);

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
    { id: 'connections', label: 'Conexiones', icon: Link2 },
    { id: 'brief', label: 'Brief', icon: FileText },
    { id: 'steve', label: 'Steve', icon: Bot },
    { id: 'copies', label: 'Copies', icon: Sparkles },
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
            <div className="hidden sm:block">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{displayClient?.name}</p>
                {isAdminView && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Vista Admin
                  </span>
                )}
              </div>
              {displayClient?.company && (
                <p className="text-xs text-muted-foreground">{displayClient.company}</p>
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
        <div className="flex gap-2 mb-8">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 uppercase tracking-wider text-xs"
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
          {activeTab === 'connections' && effectiveClientId && (
            <ClientPortalConnections clientId={effectiveClientId} isAdmin={!!isAdminView} />
          )}
          {activeTab === 'brief' && effectiveClientId && (
            <BrandBriefView 
              clientId={effectiveClientId} 
              onEditBrief={() => setActiveTab('steve')} 
            />
          )}
          {activeTab === 'steve' && effectiveClientId && (
            <div className="max-w-2xl mx-auto">
              <SteveChat clientId={effectiveClientId} />
            </div>
          )}
          {activeTab === 'copies' && effectiveClientId && (
            <div className="max-w-4xl mx-auto">
              <CopyGenerator clientId={effectiveClientId} />
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
