import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tag, Percent, DollarSign, Calendar, Users, Loader2, Sparkles, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ShopifyDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  suggestedCode?: string;
  onSuccess?: (code: string) => void;
}

export function ShopifyDiscountDialog({
  open,
  onOpenChange,
  clientId,
  suggestedCode,
  onSuccess,
}: ShopifyDiscountDialogProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [code, setCode] = useState(suggestedCode || '');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [discountValue, setDiscountValue] = useState('10');
  const [minimumPurchase, setMinimumPurchase] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const handleCreate = async () => {
    if (!code.trim()) {
      toast.error('Ingresa un código de descuento');
      return;
    }

    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      toast.error('Ingresa un valor de descuento válido');
      return;
    }

    if (discountType === 'percentage' && value > 100) {
      toast.error('El porcentaje no puede ser mayor a 100%');
      return;
    }

    setIsCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-shopify-discount', {
        body: {
          clientId,
          code: code.toUpperCase().replace(/\s/g, ''),
          discountType,
          discountValue: value,
          minimumPurchase: minimumPurchase ? parseFloat(minimumPurchase) : undefined,
          usageLimit: usageLimit ? parseInt(usageLimit) : undefined,
          endsAt: endsAt || undefined,
          title: `Descuento ${code.toUpperCase()}`,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success(`¡Código ${data.code} creado en Shopify!`);
      onSuccess?.(data.code);
      onOpenChange(false);
      
      // Reset form
      setCode('');
      setDiscountValue('10');
      setMinimumPurchase('');
      setUsageLimit('');
      setEndsAt('');
    } catch (error: unknown) {
      console.error('Error creating discount:', error);
      const message = error instanceof Error ? error.message : 'Error al crear el descuento';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'BG';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCode(result);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Crear Código de Descuento en Shopify
          </DialogTitle>
          <DialogDescription>
            Este código se creará automáticamente en tu tienda Shopify conectada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Discount Code */}
          <div className="space-y-2">
            <Label htmlFor="code">Código de Descuento</Label>
            <div className="flex gap-2">
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME10"
                className="flex-1 uppercase"
              />
              <Button type="button" variant="outline" size="icon" onClick={generateRandomCode}>
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Discount Type */}
          <div className="space-y-2">
            <Label>Tipo de Descuento</Label>
            <RadioGroup value={discountType} onValueChange={(v) => setDiscountType(v as 'percentage' | 'fixed_amount')}>
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentage" id="percentage" />
                  <Label htmlFor="percentage" className="flex items-center gap-1 cursor-pointer">
                    <Percent className="h-4 w-4" />
                    Porcentaje
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="fixed_amount" id="fixed_amount" />
                  <Label htmlFor="fixed_amount" className="flex items-center gap-1 cursor-pointer">
                    <DollarSign className="h-4 w-4" />
                    Monto Fijo
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Discount Value */}
          <div className="space-y-2">
            <Label htmlFor="value">
              Valor {discountType === 'percentage' ? '(%)' : '($)'}
            </Label>
            <div className="relative">
              <Input
                id="value"
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'percentage' ? '10' : '5.00'}
                min="0"
                max={discountType === 'percentage' ? '100' : undefined}
                step={discountType === 'percentage' ? '1' : '0.01'}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {discountType === 'percentage' ? '%' : '$'}
              </span>
            </div>
          </div>

          {/* Optional Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="minimum" className="text-sm">Compra Mínima ($)</Label>
              <Input
                id="minimum"
                type="number"
                value={minimumPurchase}
                onChange={(e) => setMinimumPurchase(e.target.value)}
                placeholder="Sin mínimo"
                min="0"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit" className="text-sm">Límite de Usos</Label>
              <Input
                id="limit"
                type="number"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="Ilimitado"
                min="1"
              />
            </div>
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label htmlFor="endsAt" className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Fecha de Expiración (opcional)
            </Label>
            <Input
              id="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !code.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <Tag className="h-4 w-4 mr-2" />
                Crear en Shopify
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
