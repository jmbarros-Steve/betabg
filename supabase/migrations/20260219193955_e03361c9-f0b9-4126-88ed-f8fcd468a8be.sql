
-- Add fase_negocio and presupuesto_ads columns to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS fase_negocio text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS presupuesto_ads bigint DEFAULT NULL;
