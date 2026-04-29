-- Brand Kit en clients: paleta de 6 colores (hex) en JSONB.
-- JM (2026-04-28): "6 colores fijos, solo hex. En el futuro vienen manuales
-- de marca pero no es el minuto."
--
-- Schema del JSONB: array de hasta 6 objetos:
-- [
--   {"name":"Primario","hex":"#1E3A7B"},
--   {"name":"Secundario","hex":"#5C4A3A"},
--   {"name":"Acento 1","hex":"#F4E1C1"},
--   {"name":"Acento 2","hex":"#9B6B43"},
--   {"name":"Neutro claro","hex":"#F4F4F4"},
--   {"name":"Neutro oscuro","hex":"#18181B"}
-- ]
--
-- brand_color y brand_secondary_color (legacy) se sincronizan con palette[0]
-- y palette[1] desde el backend para no romper Steve Mail / Estudio Creativo
-- / componentes que ya leen las columnas viejas.
--
-- Autor: Valentina W1 + Felipe W2 — 2026-04-28

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS brand_palette JSONB DEFAULT '[]'::jsonb;

-- Defense-in-depth: el backend ya hard-cap a 6 entradas en sanitizePalette,
-- pero un CHECK protege contra escrituras directas vía SQL/cron/admin.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brand_palette_max_6'
  ) THEN
    ALTER TABLE clients
      ADD CONSTRAINT brand_palette_max_6
      CHECK (
        brand_palette IS NULL
        OR jsonb_typeof(brand_palette) = 'array'
        AND jsonb_array_length(brand_palette) <= 6
      );
  END IF;
END $$;

COMMENT ON COLUMN clients.brand_palette IS
  'Paleta de marca: array de objetos {name:string, hex:string}. Hasta 6 entradas (CHECK enforced). brand_color y brand_secondary_color son atajos a palette[0] y palette[1] respectivamente, sincronizados desde backend.';
