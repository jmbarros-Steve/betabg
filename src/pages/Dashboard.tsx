import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Users, FileText, LogOut, LayoutDashboard, BookOpen, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { ClientsPanel } from '@/components/dashboard/ClientsPanel';
import { TimeEntryPanel } from '@/components/dashboard/TimeEntryPanel';
import { InvoicesPanel } from '@/components/dashboard/InvoicesPanel';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { BlogPanel } from '@/components/dashboard/BlogPanel';
import { StudyResourcesPanel } from '@/components/dashboard/StudyResourcesPanel';
import logo from '@/assets/logo.jpg';

type TabType = 'overview' | 'clients' | 'time' | 'invoices' | 'blog' | 'estudios';

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const tabs = [
    { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'time', label: 'Horas', icon: Clock },
    { id: 'invoices', label: 'Recibos', icon: FileText },
    { id: 'blog', label: 'Blog', icon: BookOpen },
    { id: 'estudios', label: 'Centro Estudios', icon: GraduationCap },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container px-6 h-16 flex items-center justify-between">
          <img src={logo} alt="Consultoría BG" className="h-10 w-auto" />

          <div className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-widest text-muted-foreground hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="w-5 h-5" />
            </Button>
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
          {activeTab === 'overview' && <DashboardStats userId={user.id} />}
          {activeTab === 'clients' && <ClientsPanel userId={user.id} />}
          {activeTab === 'time' && <TimeEntryPanel userId={user.id} />}
          {activeTab === 'invoices' && <InvoicesPanel userId={user.id} />}
          {activeTab === 'blog' && <BlogPanel userId={user.id} />}
          {activeTab === 'estudios' && <StudyResourcesPanel userId={user.id} />}
        </motion.div>
      </div>
    </div>
  );
}
