import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, LogOut, LayoutDashboard, BookOpen, GraduationCap, Link2, BarChart3, Brain, Loader2, MessageSquare, Library, UserSearch, ClipboardList, Zap, Kanban, CheckSquare, Eye, FileInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminClientsPanel } from '@/components/dashboard/AdminClientsPanel';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { BlogPanel } from '@/components/dashboard/BlogPanel';
import { StudyResourcesPanel } from '@/components/dashboard/StudyResourcesPanel';
import { PlatformConnectionsPanel } from '@/components/dashboard/PlatformConnectionsPanel';
import { ClientMetricsPanel } from '@/components/dashboard/ClientMetricsPanel';
import { SteveKnowledgePanel } from '@/components/dashboard/SteveKnowledgePanel';
import { SteveTrainingPanel } from '@/components/dashboard/SteveTrainingPanel';
import { SteveTrainingChat } from '@/components/dashboard/SteveTrainingChat';
import { KnowledgeRulesExplorer } from '@/components/dashboard/KnowledgeRulesExplorer';
import { AdminSupportPanel } from '@/components/dashboard/AdminSupportPanel';
import { AcademyAdminPanel } from '@/components/dashboard/AcademyAdminPanel';
import { ProspectosPanel } from '@/components/dashboard/ProspectosPanel';
import { OnboardingProgressPanel } from '@/components/dashboard/OnboardingProgressPanel';
import { InsightApprovalPanel } from '@/components/dashboard/InsightApprovalPanel';
import { CreativeReviewFeed } from '@/components/dashboard/CreativeReviewFeed';
import { ProspectKanban } from '@/components/dashboard/ProspectKanban';
import { SalesTasksPanel } from '@/components/dashboard/SalesTasksPanel';
import { WebFormsPanel } from '@/components/dashboard/WebFormsPanel';
import logo from '@/assets/logo.jpg';

type TabType = 'overview' | 'clients' | 'blog' | 'estudios' | 'platforms' | 'metrics' | 'training' | 'insights' | 'review' | 'support' | 'academy' | 'prospectos' | 'onboarding' | 'pipeline' | 'tareas' | 'formularios';

export default function Dashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isSuperAdmin, isShopifyUser, isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }
    
    // SECURITY: Wait for role loading to complete before checking access
    if (roleLoading || authLoading) return;

    // SECURITY: Shopify users should NEVER access dashboard
    // Even if they somehow have admin role
    if (isShopifyUser) {
      // SECURITY: Shopify users must not access admin dashboard
      navigate('/portal');
      return;
    }

    // Only super admins or real admins can access dashboard
    if (!isSuperAdmin && !isAdmin) {
      navigate('/portal');
      return;
    }
  }, [user, authLoading, roleLoading, isSuperAdmin, isAdmin, isShopifyUser, navigate]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // SECURITY: Block rendering for Shopify users or non-admins
  if (!user || isShopifyUser || (!isSuperAdmin && !isAdmin)) {
    return null;
  }

  const tabs = [
    { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
    { id: 'metrics', label: 'Métricas', icon: BarChart3 },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'platforms', label: 'Plataformas', icon: Link2 },
    { id: 'training', label: 'Steve IA', icon: Brain },
    { id: 'insights', label: 'Insights', icon: Zap },
    { id: 'review', label: 'Review', icon: Eye },
    { id: 'prospectos', label: 'Prospectos', icon: UserSearch },
    { id: 'pipeline', label: 'Pipeline', icon: Kanban },
    { id: 'tareas', label: 'Tareas', icon: CheckSquare },
    { id: 'formularios', label: 'Formularios', icon: FileInput },
    { id: 'onboarding', label: 'Onboarding', icon: ClipboardList },
    { id: 'support', label: 'Soporte', icon: MessageSquare },
    { id: 'blog', label: 'Blog', icon: BookOpen },
    { id: 'estudios', label: 'Centro Estudios', icon: GraduationCap },
    { id: 'academy', label: 'Academy', icon: Library },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="container px-6 h-16 flex items-center justify-between">
          <img src={logo} alt="Steve Ads" className="h-12 w-auto" />

          <div className="flex items-center gap-4">
            {isSuperAdmin && (
              <div className="hidden md:flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin/cerebro')} className="text-slate-500 hover:text-slate-800 text-xs">
                  <Brain className="w-3.5 h-3.5 mr-1" /> Cerebro
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin/organigrama')} className="text-slate-500 hover:text-slate-800 text-xs">
                  <Users className="w-3.5 h-3.5 mr-1" /> Organigrama
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin/planes')} className="text-slate-500 hover:text-slate-800 text-xs">
                  <BarChart3 className="w-3.5 h-3.5 mr-1" /> Planes
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin/skyvern')} className="text-slate-500 hover:text-slate-800 text-xs">
                  <Zap className="w-3.5 h-3.5 mr-1" /> Skyvern
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin/swarm-sources')} className="text-slate-500 hover:text-slate-800 text-xs">
                  <BookOpen className="w-3.5 h-3.5 mr-1" /> Swarm
                </Button>
              </div>
            )}
            <span className="text-sm font-medium text-slate-400 hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut} className="text-slate-400 hover:text-slate-700">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-[#1E3A7B] text-white shadow-md'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'overview' && <DashboardStats userId={user.id} />}
          {activeTab === 'metrics' && <ClientMetricsPanel />}
          {activeTab === 'clients' && <AdminClientsPanel />}
          {activeTab === 'platforms' && <PlatformConnectionsPanel />}
          {activeTab === 'training' && (
            <div className="space-y-10">
              <SteveTrainingChat />
              <KnowledgeRulesExplorer />
              <SteveKnowledgePanel />
            </div>
          )}
          {activeTab === 'insights' && <InsightApprovalPanel />}
          {activeTab === 'review' && <CreativeReviewFeed />}
          {activeTab === 'prospectos' && <ProspectosPanel />}
          {activeTab === 'pipeline' && <ProspectKanban />}
          {activeTab === 'tareas' && <SalesTasksPanel />}
          {activeTab === 'formularios' && <WebFormsPanel />}
          {activeTab === 'onboarding' && <OnboardingProgressPanel />}
          {activeTab === 'support' && <AdminSupportPanel />}
          {activeTab === 'blog' && <BlogPanel userId={user.id} />}
          {activeTab === 'estudios' && <StudyResourcesPanel userId={user.id} />}
          {activeTab === 'academy' && <AcademyAdminPanel />}
        </motion.div>
      </div>
    </div>
  );
}
