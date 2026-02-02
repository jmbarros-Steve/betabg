import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Settings, Percent, DollarSign, CreditCard, Package, Save, RefreshCw, Trash2, Plus, AlertTriangle } from 'lucide-react';

interface FinancialConfigPanelProps {
  clientId: string;
}

interface FinancialConfig {
  id?: string;
  default_margin_percentage: number;
  use_shopify_costs: boolean;
  shopify_plan_cost: number;
  klaviyo_plan_cost: number;
  other_fixed_costs: number;
  other_fixed_costs_description: string | null;
  payment_gateway_commission: number;
  product_margins: Record<string, number>;
}

const defaultConfig: FinancialConfig = {
  default_margin_percentage: 30,
  use_shopify_costs: false,
  shopify_plan_cost: 0,
  klaviyo_plan_cost: 0,
  other_fixed_costs: 0,
  other_fixed_costs_description: null,
  payment_gateway_commission: 3.5,
  product_margins: {},
};

// Minimum reasonable CLP values (to detect USD values)
const MIN_CLP_THRESHOLD = 1000;

// Format number as Chilean pesos with thousands separator
function formatCLP(value: number): string {
  return value.toLocaleString('es-CL');
}

// Parse CLP input (remove dots used as thousands separators)
function parseCLPInput(value: string): number {
  // Remove dots (thousands separator) and parse
  const cleaned = value.replace(/\./g, '').replace(/,/g, '');
  return parseInt(cleaned) || 0;
}

export function FinancialConfigPanel({ clientId }: FinancialConfigPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<FinancialConfig>(defaultConfig);
  const [newSku, setNewSku] = useState('');
  const [newMargin, setNewMargin] = useState('');

  // Detect if values look like USD (too low for CLP)
  const hasLowValues = 
    (config.shopify_plan_cost > 0 && config.shopify_plan_cost < MIN_CLP_THRESHOLD) ||
    (config.klaviyo_plan_cost > 0 && config.klaviyo_plan_cost < MIN_CLP_THRESHOLD) ||
    (config.other_fixed_costs > 0 && config.other_fixed_costs < MIN_CLP_THRESHOLD);

  useEffect(() => {
    fetchConfig();
  }, [clientId]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_financial_config')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig({
          id: data.id,
          default_margin_percentage: Number(data.default_margin_percentage),
          use_shopify_costs: data.use_shopify_costs,
          shopify_plan_cost: Math.round(Number(data.shopify_plan_cost)),
          klaviyo_plan_cost: Math.round(Number(data.klaviyo_plan_cost)),
          other_fixed_costs: Math.round(Number(data.other_fixed_costs)),
          other_fixed_costs_description: data.other_fixed_costs_description,
          payment_gateway_commission: Number(data.payment_gateway_commission),
          product_margins: (data.product_margins as Record<string, number>) || {},
        });
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validate values are in CLP range
    if (hasLowValues) {
      toast.error('Los valores parecen estar en USD. Por favor, ingresa los montos en Pesos Chilenos (CLP).', {
        description: 'Ejemplo: $29.000 CLP en vez de $29 USD',
        duration: 5000,
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        default_margin_percentage: config.default_margin_percentage,
        use_shopify_costs: config.use_shopify_costs,
        shopify_plan_cost: Math.round(config.shopify_plan_cost),
        klaviyo_plan_cost: Math.round(config.klaviyo_plan_cost),
        other_fixed_costs: Math.round(config.other_fixed_costs),
        other_fixed_costs_description: config.other_fixed_costs_description,
        payment_gateway_commission: config.payment_gateway_commission,
        product_margins: config.product_margins,
      };

      if (config.id) {
        const { error } = await supabase
          .from('client_financial_config')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('client_financial_config')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setConfig((prev) => ({ ...prev, id: data.id }));
      }

      toast.success('Configuración guardada correctamente');
      // Notify other views to refresh
      window.dispatchEvent(new CustomEvent('bg:sync-complete'));
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleCostChange = (field: 'shopify_plan_cost' | 'klaviyo_plan_cost' | 'other_fixed_costs', value: string) => {
    const numValue = parseInt(value.replace(/\D/g, '')) || 0;
    setConfig((prev) => ({ ...prev, [field]: numValue }));
  };

  const handleAddProductMargin = () => {
    if (!newSku.trim()) {
      toast.error('Ingresa un SKU');
      return;
    }
    const margin = parseFloat(newMargin);
    if (isNaN(margin) || margin < 0 || margin > 100) {
      toast.error('Margen debe ser entre 0 y 100');
      return;
    }

    setConfig((prev) => ({
      ...prev,
      product_margins: { ...prev.product_margins, [newSku.trim().toUpperCase()]: margin },
    }));
    setNewSku('');
    setNewMargin('');
    toast.success(`Margen para ${newSku.trim().toUpperCase()} agregado`);
  };

  const handleRemoveProductMargin = (sku: string) => {
    setConfig((prev) => {
      const updated = { ...prev.product_margins };
      delete updated[sku];
      return { ...prev, product_margins: updated };
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-1 flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Configuración Financiera
          </h2>
          <p className="text-muted-foreground text-sm">
            Define tus márgenes, costos fijos y comisiones para calcular POAS y estado de resultados
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} variant="hero">
          {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar
        </Button>
      </div>

      {/* Warning if values look like USD */}
      {hasLowValues && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>⚠️ Los valores parecen estar en USD.</strong> Esta aplicación usa exclusivamente Pesos Chilenos (CLP). 
            Por ejemplo, si tu plan de Shopify cuesta US$29, ingresa el equivalente en CLP: aproximadamente $27.550 CLP.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Margin Settings */}
        <Card className="glow-box">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Percent className="w-4 h-4" />
              Configuración de Márgenes
            </CardTitle>
            <CardDescription>
              Define cómo calcular la rentabilidad de tus productos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="default_margin">Margen promedio global (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="default_margin"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={config.default_margin_percentage}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, default_margin_percentage: parseFloat(e.target.value) || 0 }))
                  }
                  className="w-24"
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Se usa cuando no hay margen específico por producto
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="use_shopify">Importar costos de Shopify</Label>
                <p className="text-xs text-muted-foreground">
                  Usar el campo "Cost per item" de Shopify cuando esté disponible
                </p>
              </div>
              <Switch
                id="use_shopify"
                checked={config.use_shopify_costs}
                onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, use_shopify_costs: checked }))}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Márgenes por SKU
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="SKU"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="%"
                  type="number"
                  min="0"
                  max="100"
                  value={newMargin}
                  onChange={(e) => setNewMargin(e.target.value)}
                  className="w-20"
                />
                <Button variant="outline" size="icon" onClick={handleAddProductMargin}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {Object.keys(config.product_margins).length > 0 && (
                <div className="space-y-2 max-h-[150px] overflow-y-auto">
                  {Object.entries(config.product_margins).map(([sku, margin]) => (
                    <div key={sku} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {sku}
                        </Badge>
                        <span className="text-sm">{margin}%</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveProductMargin(sku)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Fixed Costs - CLP Only */}
        <Card className="glow-box">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Costos Fijos Mensuales
              <Badge variant="secondary" className="ml-2">CLP</Badge>
            </CardTitle>
            <CardDescription>
              Ingresa tus costos fijos en <strong>Pesos Chilenos (CLP)</strong>. No uses USD.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shopify_cost">Plan de Shopify</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">$</span>
                <Input
                  id="shopify_cost"
                  type="text"
                  inputMode="numeric"
                  value={formatCLP(config.shopify_plan_cost)}
                  onChange={(e) => handleCostChange('shopify_plan_cost', e.target.value)}
                  placeholder="Ej: 27.550"
                  className={config.shopify_plan_cost > 0 && config.shopify_plan_cost < MIN_CLP_THRESHOLD ? 'border-destructive' : ''}
                />
                <span className="text-muted-foreground text-sm font-medium">CLP/mes</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Plan Basic ~$27.550 | Shopify ~$74.100 | Advanced ~$296.400
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="klaviyo_cost">Plan de Klaviyo</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">$</span>
                <Input
                  id="klaviyo_cost"
                  type="text"
                  inputMode="numeric"
                  value={formatCLP(config.klaviyo_plan_cost)}
                  onChange={(e) => handleCostChange('klaviyo_plan_cost', e.target.value)}
                  placeholder="Ej: 42.750"
                  className={config.klaviyo_plan_cost > 0 && config.klaviyo_plan_cost < MIN_CLP_THRESHOLD ? 'border-destructive' : ''}
                />
                <span className="text-muted-foreground text-sm font-medium">CLP/mes</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="other_costs">Otros costos fijos</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">$</span>
                <Input
                  id="other_costs"
                  type="text"
                  inputMode="numeric"
                  value={formatCLP(config.other_fixed_costs)}
                  onChange={(e) => handleCostChange('other_fixed_costs', e.target.value)}
                  placeholder="Ej: 15.000"
                  className={config.other_fixed_costs > 0 && config.other_fixed_costs < MIN_CLP_THRESHOLD ? 'border-destructive' : ''}
                />
                <span className="text-muted-foreground text-sm font-medium">CLP/mes</span>
              </div>
              <Input
                placeholder="Descripción (ej: Hosting, Apps adicionales...)"
                value={config.other_fixed_costs_description || ''}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, other_fixed_costs_description: e.target.value || null }))
                }
                maxLength={200}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="gateway_commission" className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Comisión pasarela de pago (%)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="gateway_commission"
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={config.payment_gateway_commission}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, payment_gateway_commission: parseFloat(e.target.value) || 0 }))
                  }
                  className="w-24"
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Transbank 2.95% | Mercado Pago 3.49% + IVA | Flow 2.9%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Margen por defecto</p>
              <p className="font-semibold">{config.default_margin_percentage}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Costos fijos totales</p>
              <p className="font-semibold">
                ${formatCLP(config.shopify_plan_cost + config.klaviyo_plan_cost + config.other_fixed_costs)} CLP/mes
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Comisión pasarela</p>
              <p className="font-semibold">{config.payment_gateway_commission}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">SKUs con margen específico</p>
              <p className="font-semibold">{Object.keys(config.product_margins).length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Moneda base</p>
              <p className="font-semibold text-primary">🇨🇱 CLP</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
