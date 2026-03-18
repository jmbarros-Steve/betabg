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

-- Note: wa_credits table already has proper indexes from 20260317100003_whatsapp_tables.sql

ALTER TABLE wa_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access wa_credits" ON wa_credits;
DROP POLICY IF EXISTS "Service role full access wa_credits" ON wa_credits;
CREATE POLICY "Service role full access wa_credits"
  ON wa_credits
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Shop read own wa_credits" ON wa_credits;
DROP POLICY IF EXISTS "Shop read own wa_credits" ON wa_credits;
CREATE POLICY "Shop read own wa_credits"
  ON wa_credits
  FOR SELECT USING (true);
