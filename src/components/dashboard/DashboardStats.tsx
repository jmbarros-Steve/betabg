import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Users, FileText, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  userId: string;
}

export function DashboardStats({ userId }: Props) {
  const [stats, setStats] = useState({
    totalClients: 0,
    totalHours: 0,
    totalInvoices: 0,
    totalRevenue: 0,
    monthlyHours: 0,
  });

  useEffect(() => {
    fetchStats();
  }, [userId]);

  const fetchStats = async () => {
    const [clientsRes, entriesRes, invoicesRes] = await Promise.all([
      supabase.from('clients').select('id').eq('user_id', userId),
      supabase.from('time_entries').select('hours, date').eq('user_id', userId),
      supabase.from('invoices').select('total_amount, total_hours').eq('user_id', userId),
    ]);

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlyHours = entriesRes.data?.reduce((acc, entry) => {
      const entryDate = new Date(entry.date);
      if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
        return acc + Number(entry.hours);
      }
      return acc;
    }, 0) || 0;

    setStats({
      totalClients: clientsRes.data?.length || 0,
      totalHours: entriesRes.data?.reduce((acc, e) => acc + Number(e.hours), 0) || 0,
      totalInvoices: invoicesRes.data?.length || 0,
      totalRevenue: invoicesRes.data?.reduce((acc, i) => acc + Number(i.total_amount), 0) || 0,
      monthlyHours,
    });
  };

  const statCards = [
    { label: 'Clientes', value: stats.totalClients, icon: Users, color: 'text-[#1E3A7B]', bg: 'bg-[#F0F4FA]' },
    { label: 'Horas Totales', value: stats.totalHours.toFixed(1), icon: Clock, color: 'text-[#1E3A7B]', bg: 'bg-[#F0F4FA]' },
    { label: 'Horas Este Mes', value: stats.monthlyHours.toFixed(1), icon: Clock, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Recibos Generados', value: stats.totalInvoices, icon: FileText, color: 'text-[#1E3A7B]', bg: 'bg-[#F0F4FA]' },
    { label: 'Ingresos Totales', value: `€${stats.totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Panel de Control</h1>
        <p className="text-muted-foreground">Resumen de tu actividad de consultoría</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white border border-slate-200 rounded-xl p-5 card-hover"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-2xl font-bold mb-1">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
