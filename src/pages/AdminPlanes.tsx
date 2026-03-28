import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { ArrowLeft, Eye, Brain, Rocket, Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const PLANES = [
  {
    nombre: 'Visual',
    emoji: '🔍',
    tagline: 'Ve tus datos en un solo lugar',
    color: 'bg-slate-100 border-slate-300',
    headerColor: 'bg-slate-600 text-white',
    icon: Eye,
  },
  {
    nombre: 'Estrategia',
    emoji: '🧠',
    tagline: 'Ve + Inteligencia de Steve IA',
    color: 'bg-blue-50 border-blue-300',
    headerColor: 'bg-[#1E3A7B] text-white',
    icon: Brain,
  },
  {
    nombre: 'Full',
    emoji: '🚀',
    tagline: 'Ve + Estrategia + Crea y Ejecuta',
    color: 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-300',
    headerColor: 'bg-gradient-to-r from-purple-600 to-blue-600 text-white',
    icon: Rocket,
  },
];

type Feature = {
  nombre: string;
  visual: string[];
  estrategia: string[];
  full: string[];
};

type Modulo = {
  modulo: string;
  features: Feature[];
};

const COMPARATIVA: Modulo[] = [
  {
    modulo: 'Shopify',
    features: [
      { nombre: 'Vista de productos', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Vista de órdenes', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Métricas de ventas', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Sync automático', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Steve Chat',
    features: [
      { nombre: 'Chat básico (preguntas)', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Análisis de marca (brand research)', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Recomendaciones estratégicas', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Ejecución de acciones desde chat', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Steve Estrategia',
    features: [
      { nombre: 'Diagnóstico de marca', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Plan de marketing mensual', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Análisis de competencia', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Ejecución automática del plan', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Deep Dive',
    features: [
      { nombre: 'Análisis profundo de datos', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Insights accionables', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Brief View',
    features: [
      { nombre: 'Ver briefs de campaña', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Generar briefs con IA', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Copies',
    features: [
      { nombre: 'Ver copies existentes', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Generar copies con IA', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Publicar copies a plataformas', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Meta Ads',
    features: [
      { nombre: 'Ver campañas y métricas', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Análisis de rendimiento IA', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Crear campañas', visual: ['—'], estrategia: ['—'], full: ['✅'] },
      { nombre: 'Editar y optimizar campañas', visual: ['—'], estrategia: ['—'], full: ['✅'] },
      { nombre: 'Social Inbox', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Klaviyo',
    features: [
      { nombre: 'Ver métricas de email', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Ver flows y campañas', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Crear campañas de email', visual: ['—'], estrategia: ['—'], full: ['✅'] },
      { nombre: 'Editor drag & drop', visual: ['—'], estrategia: ['—'], full: ['✅'] },
      { nombre: 'Importar templates', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Instagram',
    features: [
      { nombre: 'Ver feed y métricas', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Análisis de contenido IA', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Publicar contenido', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Google Ads',
    features: [
      { nombre: 'Ver campañas y métricas', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Análisis de rendimiento IA', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Crear y editar campañas', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Steve Mail',
    features: [
      { nombre: 'Ver emails enviados', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Crear y enviar emails', visual: ['—'], estrategia: ['—'], full: ['✅'] },
      { nombre: 'Editor visual de emails', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
  {
    modulo: 'WhatsApp',
    features: [
      { nombre: 'Ver conversaciones', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Enviar mensajes', visual: ['—'], estrategia: ['—'], full: ['✅'] },
      { nombre: 'Automatizaciones', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Academy',
    features: [
      { nombre: 'Cursos y tutoriales', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Contenido avanzado', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Métricas',
    features: [
      { nombre: 'Dashboard de métricas', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Reportes avanzados', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Reporte semanal automático', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Conexiones',
    features: [
      { nombre: 'Conectar plataformas', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Gestión de tokens', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Configuración',
    features: [
      { nombre: 'Perfil y cuenta', visual: ['✅'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Gestión de usuarios', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Chonga',
    features: [
      { nombre: 'Asistente de contenido IA', visual: ['—'], estrategia: ['✅'], full: ['✅'] },
      { nombre: 'Generación de imágenes', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
  {
    modulo: 'Botón Descuento',
    features: [
      { nombre: 'Widget de descuento en tienda', visual: ['—'], estrategia: ['—'], full: ['✅'] },
      { nombre: 'Configuración de reglas', visual: ['—'], estrategia: ['—'], full: ['✅'] },
    ],
  },
];

function CellIcon({ value }: { value: string }) {
  if (value === '✅') {
    return <Check className="h-5 w-5 text-green-600 mx-auto" />;
  }
  return <Minus className="h-4 w-4 text-slate-300 mx-auto" />;
}

export default function AdminPlanes() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
    if (!roleLoading && !authLoading && !isSuperAdmin) navigate('/portal');
  }, [user, authLoading, isSuperAdmin, roleLoading, navigate]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">Planes Steve Ads</h1>
        </div>

        {/* Cards resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {PLANES.map((plan) => (
            <Card key={plan.nombre} className={`${plan.color} border-2`}>
              <CardContent className="pt-6 text-center">
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${plan.headerColor} mb-4`}>
                  <plan.icon className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold mb-1">
                  {plan.emoji} {plan.nombre}
                </h2>
                <p className="text-sm text-slate-600">{plan.tagline}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabla comparativa */}
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4 font-semibold text-slate-700 w-1/2">Feature</th>
                <th className="text-center p-4 w-1/6">
                  <span className="inline-block px-3 py-1 rounded-full bg-slate-600 text-white text-xs font-semibold">
                    🔍 Visual
                  </span>
                </th>
                <th className="text-center p-4 w-1/6">
                  <span className="inline-block px-3 py-1 rounded-full bg-[#1E3A7B] text-white text-xs font-semibold">
                    🧠 Estrategia
                  </span>
                </th>
                <th className="text-center p-4 w-1/6">
                  <span className="inline-block px-3 py-1 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold">
                    🚀 Full
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARATIVA.map((modulo) => (
                <>
                  <tr key={`header-${modulo.modulo}`} className="bg-slate-50">
                    <td colSpan={4} className="p-3 font-bold text-slate-800 text-base">
                      {modulo.modulo}
                    </td>
                  </tr>
                  {modulo.features.map((feature, idx) => (
                    <tr
                      key={`${modulo.modulo}-${idx}`}
                      className="border-b border-slate-100 hover:bg-slate-50/50"
                    >
                      <td className="p-3 pl-6 text-slate-600">{feature.nombre}</td>
                      <td className="p-3 text-center">
                        <CellIcon value={feature.visual[0]} />
                      </td>
                      <td className="p-3 text-center">
                        <CellIcon value={feature.estrategia[0]} />
                      </td>
                      <td className="p-3 text-center">
                        <CellIcon value={feature.full[0]} />
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-8">
          Comparativa interna — Solo visible para administradores
        </p>
      </div>
    </div>
  );
}
