-- Migration: Add check_type, check_config, implemented columns to criterio_rules
-- Purpose: Enable config-driven evaluation instead of hardcoded if-blocks

ALTER TABLE criterio_rules
  ADD COLUMN IF NOT EXISTS check_type TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS check_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS implemented BOOLEAN DEFAULT false;

-- Mark the 63 currently implemented rules (28 META + 21 EMAIL + 14 others with code)
-- These are the rules that have actual evaluation logic in criterio-meta.ts and criterio-email.ts

-- META COPY (13 rules implemented)
UPDATE criterio_rules SET implemented = true WHERE category = 'META COPY' AND (
  name ILIKE '%Largo copy primario%' OR
  name ILIKE '%Largo headline%' OR
  name ILIKE '%CTA presente%' OR
  name ILIKE '%ortográficos%' OR name ILIKE '%ortografía%' OR
  name ILIKE '%Precio coincide%' OR
  name ILIKE '%stock%' OR
  name ILIKE '%Ángulo distinto%' OR name ILIKE '%Angulo distinto%' OR
  name ILIKE '%claims médicos%' OR
  name ILIKE '%Emoji max%' OR
  name ILIKE '%MAYÚSCULAS%' OR
  name ILIKE '%Tono coherente%' OR
  name ILIKE '%URL destino%'
);

-- META TARGET (6 rules implemented)
UPDATE criterio_rules SET implemented = true WHERE category = 'META TARGET' AND (
  name ILIKE '%Edad coherente%' OR
  name ILIKE '%Género coherente%' OR name ILIKE '%Genero coherente%' OR
  name ILIKE '%Min 2 intereses%' OR
  name ILIKE '%País Chile%' OR name ILIKE '%Pais Chile%' OR
  name ILIKE '%No menores%' OR
  name ILIKE '%Idioma%'
);

-- META BUDGET (5 rules implemented)
UPDATE criterio_rules SET implemented = true WHERE category = 'META BUDGET' AND (
  name ILIKE '%Budget diario min%' OR
  name ILIKE '%10% ventas%' OR name ILIKE '%10%ventas%' OR
  name ILIKE '%Centavos%' OR
  name ILIKE '%Lifetime tiene fecha%' OR
  name ILIKE '%Moneda%'
);

-- META PLACEMENT (3 rules implemented)
UPDATE criterio_rules SET implemented = true WHERE category ILIKE '%PLACE%' AND (
  name ILIKE '%Audience Network solo%' OR
  name ILIKE '%Feed incluido%' OR
  name ILIKE '%Stories creative vertical%'
);

-- META CREATIVE (2 rules implemented)
UPDATE criterio_rules SET implemented = true WHERE category ILIKE '%CREATIVE%' AND (
  name ILIKE '%Resolución min%' OR name ILIKE '%Resolucion min%' OR
  name ILIKE '%Formato correcto%'
);

-- EMAIL SUBJECT (7 rules implemented)
UPDATE criterio_rules SET implemented = true WHERE category = 'EMAIL SUBJECT' AND (
  name ILIKE '%max 50%' OR
  name ILIKE '%min 15%' OR
  name ILIKE '%Preview text%' OR
  name ILIKE '%spam%' OR
  name ILIKE '%ALL CAPS%' OR name ILIKE '%mayúsculas%' OR
  name ILIKE '%emojis%' OR
  name ILIKE '%Distinto últimos%' OR name ILIKE '%Distinto ultimos%'
);

-- EMAIL BODY (8 rules implemented)
UPDATE criterio_rules SET implemented = true WHERE category = 'EMAIL BODY' AND (
  name ILIKE '%CTA principal%' OR
  name ILIKE '%desuscripción%' OR name ILIKE '%unsubscribe%' OR
  name ILIKE '%Largo%palabras%' OR
  name ILIKE '%alt text%' OR
  name ILIKE '%JavaScript%' OR
  name ILIKE '%Ancho max 600%' OR
  name ILIKE '%HTTPS%' OR
  name ILIKE '%UTM%'
);

-- EMAIL TIMING (3 rules implemented)
UPDATE criterio_rules SET implemented = true WHERE category = 'EMAIL TIMING' AND (
  name ILIKE '%Hora 8-21%' OR name ILIKE '%8-21%' OR
  name ILIKE '%Min 3 días%' OR name ILIKE '%Min 3 dias%' OR
  name ILIKE '%Timezone%'
);

-- EMAIL SEG (2 rules implemented)
UPDATE criterio_rules SET implemented = true WHERE category ILIKE '%SEG%' AND (
  name ILIKE '%unsubscribed%' OR name ILIKE '%desuscritos%' OR
  name ILIKE '%Min 100%'
);

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_criterio_rules_implemented ON criterio_rules(implemented);
CREATE INDEX IF NOT EXISTS idx_criterio_rules_check_type ON criterio_rules(check_type);

-- Add comment for documentation
COMMENT ON COLUMN criterio_rules.check_type IS 'Evaluation type: length, forbidden, required, regex, range, comparison, db_lookup, ai, external, manual_review, manual';
COMMENT ON COLUMN criterio_rules.check_config IS 'JSONB config for the evaluator function, varies by check_type';
COMMENT ON COLUMN criterio_rules.implemented IS 'Whether this rule has actual evaluation logic (vs default skip)';
