import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, Users, Percent, DollarSign, HelpCircle } from 'lucide-react';

interface ConversionLtvPanelProps {
  conversionRate: number;
  averageLtv: number;
  totalCustomers: number;
  repeatCustomerRate: number;
  currency?: string;
}

export function ConversionLtvPanel({
  conversionRate,
  averageLtv,
  totalCustomers,
  repeatCustomerRate,
  currency = 'CLP',
}: ConversionLtvPanelProps) {
  const metrics = [
    {
      title: 'Tasa de Conversión',
      value: `${conversionRate.toFixed(2)}%`,
      description: 'Checkouts → Compras completadas',
      tooltip: 'Porcentaje de sesiones que terminan en compra. 1-3% es normal para ecommerce',
      icon: Percent,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'LTV Promedio',
      value: `$${averageLtv.toLocaleString('es-CL')}`,
      description: `Valor de vida del cliente (${currency})`,
      tooltip: 'Lifetime Value — valor promedio que genera un cliente a lo largo de su relación con tu marca',
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Clientes Totales',
      value: totalCustomers.toLocaleString('es-CL'),
      description: 'Clientes únicos en el período',
      tooltip: 'Número total de clientes únicos que realizaron al menos una compra en el período',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Clientes Recurrentes',
      value: `${repeatCustomerRate.toFixed(1)}%`,
      description: 'Han comprado más de una vez',
      tooltip: 'Porcentaje de clientes que han comprado más de una vez. Sobre 20% es bueno',
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <Card key={metric.title} className="bg-white border border-slate-200 rounded-xl card-hover">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                {metric.title}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>{metric.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                <metric.icon className={`w-4 h-4 ${metric.color}`} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold tabular-nums">{metric.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
