-- wa_credits: balance y transacciones de créditos WhatsApp por merchant
CREATE TABLE IF NOT EXISTS wa_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL,                    -- 'topup' | 'message_sent' | 'adjustment' | 'refund'
  amount INTEGER NOT NULL,               -- positivo = crédito, negativo = débito
  balance_after INTEGER NOT NULL,        -- saldo después de la transacción
  description TEXT,                      -- "Recarga 500 créditos" | "WA enviado a +569..."
  reference_id TEXT,                     -- ID del mensaje WA o ID de pago
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_credits_shop ON wa_credits(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_credits_type ON wa_credits(type, shop_id);

ALTER TABLE wa_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access wa_credits" ON wa_credits;
CREATE POLICY "Service role full access wa_credits" ON wa_credits
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Shop read own wa_credits" ON wa_credits;
CREATE POLICY "Shop read own wa_credits" ON wa_credits
  FOR SELECT USING (true);
