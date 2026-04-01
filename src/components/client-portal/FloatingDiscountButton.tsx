import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShopifyDiscountDialog } from './ShopifyDiscountDialog';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useUserPlan } from '@/hooks/useUserPlan';

interface FloatingDiscountButtonProps {
  clientId: string;
}

export function FloatingDiscountButton({ clientId }: FloatingDiscountButtonProps) {
  const { canAccess } = useUserPlan();
  const [isOpen, setIsOpen] = useState(false);
  const [hasShopify, setHasShopify] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkShopifyConnection();
  }, [clientId]);

  async function checkShopifyConnection() {
    try {
      const { data, error } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'shopify')
        .eq('is_active', true)
        .maybeSingle();

      if (!error && data) {
        setHasShopify(true);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }

  // Don't show if no Shopify connection, still loading, or plan doesn't allow
  if (loading || !hasShopify || !canAccess('shopify.discounts')) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="fixed bottom-24 right-6 z-40">
        <AnimatePresence>
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setIsOpen(true)}
                  size="lg"
                  className="rounded-full w-14 h-14 shadow-lg bg-orange-500 hover:bg-orange-500/90 text-white"
                >
                  <Tag className="w-6 h-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-background border">
                <p className="text-sm font-medium">Crear código de descuento</p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        </AnimatePresence>

        <ShopifyDiscountDialog
          open={isOpen}
          onOpenChange={setIsOpen}
          clientId={clientId}
        />
      </div>
    </TooltipProvider>
  );
}