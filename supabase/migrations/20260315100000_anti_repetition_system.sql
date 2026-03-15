-- Anti-repetition system: track generated copies, angles, and visual styles

-- 1. Generated copies history (for anti-repetition)
CREATE TABLE IF NOT EXISTS generated_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  funnel_stage TEXT NOT NULL CHECK (funnel_stage IN ('tofu', 'mofu', 'bofu')),
  angle_category TEXT,
  headlines TEXT[] NOT NULL DEFAULT '{}',
  primary_text TEXT,
  hooks TEXT[] DEFAULT '{}',
  visual_style TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_generated_copies_client_funnel
  ON generated_copies(client_id, funnel_stage, created_at DESC);

ALTER TABLE generated_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own client copies"
  ON generated_copies FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
  ));

-- 2. Copy angles bank
CREATE TABLE IF NOT EXISTS copy_angles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'dolor', 'aspiracion', 'curiosidad', 'fomo', 'testimonio',
    'controversia', 'educacion', 'comparacion', 'antes-despues',
    'secreto', 'urgencia', 'social-proof', 'transformacion',
    'objecion', 'humor'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed 20 diverse angles
INSERT INTO copy_angles (name, description, category) VALUES
  ('Dolor nocturno', 'Explota el problema que mantiene despierto al cliente a las 3 AM', 'dolor'),
  ('Miedo a quedarse atrás', 'Tu competencia ya lo está haciendo, ¿y tú?', 'fomo'),
  ('El secreto que nadie cuenta', 'Revela algo que la industria oculta deliberadamente', 'secreto'),
  ('Antes vs Después', 'Contraste dramático entre la vida sin y con el producto', 'antes-despues'),
  ('Testimonio impactante', 'Historia real de un cliente que logró resultados extraordinarios', 'testimonio'),
  ('Pregunta incómoda', 'Hace que el lector se cuestione sus propias decisiones', 'controversia'),
  ('El error #1', 'El error más común que comete tu audiencia y cómo evitarlo', 'educacion'),
  ('Nosotros vs Ellos', 'Comparación directa con la competencia sin nombrarla', 'comparacion'),
  ('Sueño aspiracional', 'Pinta la vida ideal que el producto hace posible', 'aspiracion'),
  ('Urgencia real', 'Stock limitado, temporada, fecha límite — escasez genuina', 'urgencia'),
  ('Número impactante', 'Estadística o dato que detiene el scroll instantáneamente', 'curiosidad'),
  ('La garantía absurda', 'Una garantía tan ridícula que elimina todo riesgo percibido', 'objecion'),
  ('Prueba social masiva', 'Miles de personas ya lo usan — ¿por qué tú no?', 'social-proof'),
  ('Transformación en X días', 'Resultado específico en un plazo concreto y creíble', 'transformacion'),
  ('El villano oculto', 'Identifica al enemigo real del cliente (no el producto, sino el problema)', 'dolor'),
  ('Curiosidad imposible', 'Un dato tan intrigante que es imposible no hacer click', 'curiosidad'),
  ('Humor relatable', 'Situación cómica que toda la audiencia reconoce como propia', 'humor'),
  ('El insider tip', 'Consejo de experto que solo los profesionales conocen', 'secreto'),
  ('Objeción destruida', 'Anticipa la excusa principal y la desmonta con datos', 'objecion'),
  ('FOMO de comunidad', 'Únete a la tribu — los que entienden ya están dentro', 'fomo')
ON CONFLICT DO NOTHING;

-- 3. Angle usage tracking per client
CREATE TABLE IF NOT EXISTS copy_angle_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  angle_id UUID NOT NULL REFERENCES copy_angles(id) ON DELETE CASCADE,
  funnel_stage TEXT NOT NULL CHECK (funnel_stage IN ('tofu', 'mofu', 'bofu')),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_copy_angle_usage_client
  ON copy_angle_usage(client_id, funnel_stage, used_at DESC);

ALTER TABLE copy_angle_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own angle usage"
  ON copy_angle_usage FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
  ));

-- 4. Visual style usage tracking
CREATE TABLE IF NOT EXISTS visual_style_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  style_name TEXT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visual_style_usage_client
  ON visual_style_usage(client_id, used_at DESC);

ALTER TABLE visual_style_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own style usage"
  ON visual_style_usage FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
  ));

-- Grant service role access for backend inserts
GRANT ALL ON generated_copies TO service_role;
GRANT ALL ON copy_angles TO service_role;
GRANT ALL ON copy_angle_usage TO service_role;
GRANT ALL ON visual_style_usage TO service_role;
