import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, BarChart3, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { ClientPortalMetrics } from '@/components/client-portal/ClientPortalMetrics';
import { ClientPortalConnections } from '@/components/client-portal/ClientPortalConnections';
import logo from '@/assets/logo.jpg';

type TabType = 'metrics' | 'connections';

export default function ClientPortal() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isClient, loading: roleLoading, clientData } = useUserRole();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('metrics');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    // Redirect admin users to dashboard
    if (!roleLoading && user && !isClient) {
      navigate('/dashboard');
    }
  }, [roleLoading, isClient, user, navigate]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isClient || !clientData) {
    return null;
  }

  const tabs = [
    { id: 'metrics', label: 'Mis Métricas', icon: BarChart3 },
    { id: 'connections', label: 'Conexiones', icon: Link2 },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={logo} alt="Consultoría BG" className="h-10 w-auto" />
            <div className="hidden sm:block">
              <p className="text-sm font-medium">{clientData.name}</p>
              {clientData.company && (
                <p className="text-xs text-muted-foreground">{clientData.company}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-widest text-muted-foreground hidden sm:block">
              Portal Cliente
            </span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="w-5 h-5" />
            </Button>
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
          {activeTab === 'metrics' && <ClientPortalMetrics clientId={clientData.id} />}
          {activeTab === 'connections' && <ClientPortalConnections clientId={clientData.id} />}
        </motion.div>
      </div>
    </div>
  );
}
