import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReveal } from '@/hooks/useReveal';
import { MessageSquare, FileText, ShoppingBag, Mail, DollarSign } from 'lucide-react';

const tabs = [
  {
    id: 'chat',
    label: 'Chat AI',
    icon: MessageSquare,
    mockup: (
      <div className="p-6 space-y-3">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold">S</div>
          <div>
            <p className="font-semibold text-sm text-slate-800">Steve AI</p>
            <p className="text-xs text-emerald-500">Online</p>
          </div>
        </div>
        <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-700 max-w-[80%]">
          Tu campana "Summer Sale" tiene un CTR del 2.4%. Te sugiero probar estos headlines...
        </div>
        <div className="bg-[#1E3A7B] rounded-lg px-3 py-2 text-sm text-white max-w-[70%] ml-auto">
          Genera 3 variaciones
        </div>
        <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-700 max-w-[80%]">
          <p className="font-medium mb-1">Aqui tienes 3 variaciones:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-xs">
            <li>Descuentos de verano hasta 50%</li>
            <li>Tu look de verano te espera</li>
            <li>Ofertas que no puedes dejar pasar</li>
          </ol>
        </div>
      </div>
    ),
  },
  {
    id: 'copies',
    label: 'Copies Ads',
    icon: FileText,
    mockup: (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-semibold text-sm text-slate-800">Generador de Copies</h3>
          <span className="text-xs bg-[#D6E0F0] text-[#162D5F] px-2 py-0.5 rounded">Meta Ads</span>
        </div>
        {['Headline', 'Texto principal', 'Descripcion'].map((field) => (
          <div key={field} className="space-y-1">
            <label className="text-xs font-medium text-slate-500">{field}</label>
            <div className="h-8 bg-slate-50 rounded border border-slate-200 flex items-center px-3">
              <div className="h-2 bg-slate-200 rounded w-3/4" />
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <div className="flex-1 h-9 bg-[#1E3A7B] rounded flex items-center justify-center text-white text-xs font-medium">Generar con AI</div>
          <div className="h-9 px-3 border border-slate-200 rounded flex items-center text-xs text-slate-500">Copiar</div>
        </div>
      </div>
    ),
  },
  {
    id: 'shopify',
    label: 'Shopify Analytics',
    icon: ShoppingBag,
    mockup: (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-semibold text-sm text-slate-800">Shopify Analytics</h3>
          <span className="text-xs text-slate-400">Ultimos 30 dias</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Ventas', value: '$12,450', change: '+18%' },
            { label: 'Ordenes', value: '234', change: '+12%' },
            { label: 'AOV', value: '$53.20', change: '+5%' },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className="font-bold text-slate-900 text-sm">{stat.value}</p>
              <p className="text-xs text-emerald-600">{stat.change}</p>
            </div>
          ))}
        </div>
        <div className="h-24 bg-gradient-to-t from-[#F0F4FA] to-transparent rounded-lg border border-slate-100 flex items-end p-3 gap-1">
          {[30, 45, 35, 55, 50, 65, 60, 75, 70, 85, 80, 90].map((h, i) => (
            <div key={i} className="flex-1 bg-[#38BDF8] rounded-t opacity-70" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'email',
    label: 'Email Marketing',
    icon: Mail,
    mockup: (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-semibold text-sm text-slate-800">Email Campaigns</h3>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Klaviyo</span>
        </div>
        {[
          { name: 'Welcome Series', status: 'Activo', open: '45%', click: '12%' },
          { name: 'Abandoned Cart', status: 'Activo', open: '38%', click: '8%' },
          { name: 'Post-Purchase', status: 'Draft', open: '\u2014', click: '\u2014' },
        ].map((flow) => (
          <div key={flow.name} className="flex items-center justify-between py-2 border-b border-slate-50">
            <div>
              <p className="text-sm font-medium text-slate-800">{flow.name}</p>
              <span className={`text-xs ${flow.status === 'Activo' ? 'text-emerald-600' : 'text-slate-400'}`}>{flow.status}</span>
            </div>
            <div className="flex gap-4 text-xs text-slate-500">
              <span>Open: {flow.open}</span>
              <span>Click: {flow.click}</span>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'finance',
    label: 'Finanzas',
    icon: DollarSign,
    mockup: (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-semibold text-sm text-slate-800">Resumen Financiero</h3>
          <span className="text-xs text-slate-400">Marzo 2026</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Ad Spend', value: '$3,200', color: 'text-red-600' },
            { label: 'Revenue', value: '$18,750', color: 'text-emerald-600' },
            { label: 'ROAS', value: '5.86x', color: 'text-[#1E3A7B]' },
            { label: 'Profit', value: '$15,550', color: 'text-emerald-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className={`font-bold text-lg ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

export function ProductShowcase() {
  const [activeTab, setActiveTab] = useState('chat');
  const ref = useReveal();
  const current = tabs.find((t) => t.id === activeTab)!;

  return (
    <section id="features" className="bg-slate-50 py-20 md:py-28">
      <div ref={ref} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Todo tu marketing en un panel
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Desde campanas de Meta Ads hasta emails de Klaviyo — gestiona todo con la ayuda de Steve.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#1E3A7B] text-white shadow-md'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-white rounded-md px-3 py-1 text-xs text-slate-400 border border-slate-200">
                  app.steveads.com/{current.id}
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="min-h-[320px]"
              >
                {current.mockup}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
