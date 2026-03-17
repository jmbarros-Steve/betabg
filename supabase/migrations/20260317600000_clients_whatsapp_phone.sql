-- Add whatsapp_phone to clients for Steve Chat WA merchant identification
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_wa_phone ON clients(whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;
