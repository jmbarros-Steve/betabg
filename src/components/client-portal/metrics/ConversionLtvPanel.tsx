import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Percent, DollarSign } from 'lucide-react';

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
      icon: Percent,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'LTV Promedio',
      value: `$${averageLtv.toLocaleString('es-CL')}`,
      description: `Valor de vida del cliente (${currency})`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Clientes Totales',
      value: totalCustomers.toLocaleString('es-CL'),
      description: 'Clientes únicos en el período',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Clientes Recurrentes',
      value: `${repeatCustomerRate.toFixed(1)}%`,
      description: 'Han comprado más de una vez',
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <Card key={metric.title} className="glow-box">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {metric.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                <metric.icon className={`w-4 h-4 ${metric.color}`} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{metric.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
