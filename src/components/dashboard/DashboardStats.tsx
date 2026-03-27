import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, DollarSign, Coins } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  userId: string;
}

export function DashboardStats({ userId }: Props) {
  const [stats, setStats] = useState({
    totalClients: 0,
    totalTokensAvailable: 0,
    totalTokensUsed: 0,
  });

  useEffect(() => {
    fetchStats();
  }, [userId]);

  const fetchStats = async () => {
    const [clientsRes, creditsRes] = await Promise.all([
      supabase.from('clients').select('id').eq('user_id', userId),
      supabase.from('client_credits').select('creditos_disponibles, creditos_usados'),
    ]);

    setStats({
      totalClients: clientsRes.data?.length || 0,
      totalTokensAvailable: creditsRes.data?.reduce((acc, c) => acc + Number(c.creditos_disponibles), 0) || 0,
      totalTokensUsed: creditsRes.data?.reduce((acc, c) => acc + Number(c.creditos_usados), 0) || 0,
    });
  };

  const statCards = [
    { label: 'Clientes', value: stats.totalClients, icon: Users, color: 'text-[#1E3A7B]', bg: 'bg-[#F0F4FA]' },
    { label: 'Tokens Disponibles', value: stats.totalTokensAvailable.toLocaleString(), icon: Coins, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Tokens Usados', value: stats.totalTokensUsed.toLocaleString(), icon: Coins, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Panel de Control</h1>
        <p className="text-muted-foreground">Resumen de tu actividad</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
