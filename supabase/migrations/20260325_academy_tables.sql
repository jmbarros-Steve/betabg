-- Steve Academy: Cursos con Certificación
-- 8 tablas + RLS + seed data

-- 1. Cursos
CREATE TABLE IF NOT EXISTS academy_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT UNIQUE NOT NULL,
  thumbnail_url TEXT,
  category TEXT NOT NULL DEFAULT 'marketing',
  difficulty TEXT NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_hours NUMERIC(4,1) DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Lecciones
CREATE TABLE IF NOT EXISTS academy_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  youtube_video_id TEXT DEFAULT '',
  duration_minutes INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  is_free_preview BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Quizzes
CREATE TABLE IF NOT EXISTS academy_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  passing_score INT DEFAULT 70,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Preguntas del quiz
CREATE TABLE IF NOT EXISTS academy_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES academy_quizzes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct_option INT NOT NULL DEFAULT 0,
  explanation TEXT,
  sort_order INT DEFAULT 0
);

-- 5. Inscripciones
CREATE TABLE IF NOT EXISTS academy_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, course_id)
);

-- 6. Progreso de lecciones
CREATE TABLE IF NOT EXISTS academy_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT false,
  watched_seconds INT DEFAULT 0,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, lesson_id)
);

-- 7. Intentos de quiz
CREATE TABLE IF NOT EXISTS academy_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES academy_quizzes(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  passed BOOLEAN DEFAULT false,
  answers JSONB DEFAULT '[]',
  attempted_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Certificados
CREATE TABLE IF NOT EXISTS academy_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  certificate_number TEXT UNIQUE NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, course_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_academy_lessons_course ON academy_lessons(course_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_academy_quiz_questions_quiz ON academy_quiz_questions(quiz_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_academy_enrollments_user ON academy_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_academy_lesson_progress_user ON academy_lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_academy_quiz_attempts_user ON academy_quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_academy_certificates_user ON academy_certificates(user_id);

-- ========== RLS ==========
ALTER TABLE academy_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_certificates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "academy_courses_select" ON academy_courses;
DROP POLICY IF EXISTS "academy_lessons_select" ON academy_lessons;
DROP POLICY IF EXISTS "academy_quizzes_select" ON academy_quizzes;
DROP POLICY IF EXISTS "academy_quiz_questions_select" ON academy_quiz_questions;
DROP POLICY IF EXISTS "academy_enrollments_select" ON academy_enrollments;
DROP POLICY IF EXISTS "academy_enrollments_insert" ON academy_enrollments;
DROP POLICY IF EXISTS "academy_lesson_progress_select" ON academy_lesson_progress;
DROP POLICY IF EXISTS "academy_lesson_progress_insert" ON academy_lesson_progress;
DROP POLICY IF EXISTS "academy_lesson_progress_update" ON academy_lesson_progress;
DROP POLICY IF EXISTS "academy_quiz_attempts_select" ON academy_quiz_attempts;
DROP POLICY IF EXISTS "academy_quiz_attempts_insert" ON academy_quiz_attempts;
DROP POLICY IF EXISTS "academy_certificates_select" ON academy_certificates;
DROP POLICY IF EXISTS "academy_certificates_insert" ON academy_certificates;
DROP POLICY IF EXISTS "academy_courses_admin" ON academy_courses;
DROP POLICY IF EXISTS "academy_lessons_admin" ON academy_lessons;
DROP POLICY IF EXISTS "academy_quizzes_admin" ON academy_quizzes;
DROP POLICY IF EXISTS "academy_quiz_questions_admin" ON academy_quiz_questions;

-- Cursos publicados: lectura para todos los autenticados
CREATE POLICY "academy_courses_select" ON academy_courses FOR SELECT TO authenticated
  USING (is_published = true);

-- Lecciones de cursos publicados
CREATE POLICY "academy_lessons_select" ON academy_lessons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM academy_courses WHERE id = course_id AND is_published = true));

-- Quizzes de cursos publicados
CREATE POLICY "academy_quizzes_select" ON academy_quizzes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM academy_courses WHERE id = course_id AND is_published = true));

-- Preguntas de quizzes de cursos publicados
CREATE POLICY "academy_quiz_questions_select" ON academy_quiz_questions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM academy_quizzes q
    JOIN academy_courses c ON c.id = q.course_id
    WHERE q.id = quiz_id AND c.is_published = true
  ));

-- Enrollments: usuario gestiona las suyas
CREATE POLICY "academy_enrollments_select" ON academy_enrollments FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "academy_enrollments_insert" ON academy_enrollments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Progreso: usuario gestiona el suyo
CREATE POLICY "academy_lesson_progress_select" ON academy_lesson_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "academy_lesson_progress_insert" ON academy_lesson_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "academy_lesson_progress_update" ON academy_lesson_progress FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Quiz attempts: usuario gestiona los suyos
CREATE POLICY "academy_quiz_attempts_select" ON academy_quiz_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "academy_quiz_attempts_insert" ON academy_quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Certificados: usuario ve los suyos
CREATE POLICY "academy_certificates_select" ON academy_certificates FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "academy_certificates_insert" ON academy_certificates FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin: CRUD completo (super admin via user_roles.is_super_admin)
CREATE POLICY "academy_courses_admin" ON academy_courses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_super_admin = true));
CREATE POLICY "academy_lessons_admin" ON academy_lessons FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_super_admin = true));
CREATE POLICY "academy_quizzes_admin" ON academy_quizzes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_super_admin = true));
CREATE POLICY "academy_quiz_questions_admin" ON academy_quiz_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_super_admin = true));

-- ========== SEED DATA ==========

-- Curso 1: Meta Ads desde cero
INSERT INTO academy_courses (title, description, slug, category, difficulty, estimated_hours, is_published, sort_order)
VALUES (
  'Meta Ads desde cero',
  'Aprende a crear campañas efectivas en Facebook e Instagram Ads. Desde la configuración del Business Manager hasta la optimización de audiencias y presupuestos.',
  'meta-ads-desde-cero',
  'paid_media',
  'beginner',
  4.5,
  true,
  1
);

-- Curso 2: Google Ads para e-commerce
INSERT INTO academy_courses (title, description, slug, category, difficulty, estimated_hours, is_published, sort_order)
VALUES (
  'Google Ads para e-commerce',
  'Domina Google Ads enfocado en tiendas online. Shopping, Search, Performance Max y estrategias de ROAS para maximizar ventas.',
  'google-ads-ecommerce',
  'paid_media',
  'intermediate',
  5.0,
  true,
  2
);

-- Curso 3: Email Marketing con Klaviyo
INSERT INTO academy_courses (title, description, slug, category, difficulty, estimated_hours, is_published, sort_order)
VALUES (
  'Email Marketing con Klaviyo',
  'Configura Klaviyo como un pro. Flows automatizados, segmentación avanzada, templates que convierten y métricas que importan.',
  'email-marketing-klaviyo',
  'email',
  'intermediate',
  3.5,
  true,
  3
);

-- Curso 4: Shopify Analytics
INSERT INTO academy_courses (title, description, slug, category, difficulty, estimated_hours, is_published, sort_order)
VALUES (
  'Shopify Analytics',
  'Entiende los datos de tu tienda Shopify. Reportes, métricas clave, embudo de conversión y cómo tomar decisiones basadas en datos.',
  'shopify-analytics',
  'analytics',
  'beginner',
  3.0,
  true,
  4
);

-- Curso 5: Estrategia de Marketing Digital
INSERT INTO academy_courses (title, description, slug, category, difficulty, estimated_hours, is_published, sort_order)
VALUES (
  'Estrategia de Marketing Digital',
  'Construye una estrategia de marketing digital completa. Buyer personas, customer journey, presupuesto, canales y métricas de éxito.',
  'estrategia-marketing-digital',
  'strategy',
  'advanced',
  6.0,
  true,
  5
);

-- Lecciones para Curso 1: Meta Ads desde cero
INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order, is_free_preview)
SELECT id, 'Introducción a Meta Business Suite', 'Conoce la plataforma y configura tu cuenta publicitaria.', '', 15, 1, true
FROM academy_courses WHERE slug = 'meta-ads-desde-cero';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Estructura de campañas', 'Campaña, conjunto de anuncios y anuncios: entiende la estructura.', '', 20, 2
FROM academy_courses WHERE slug = 'meta-ads-desde-cero';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Audiencias y segmentación', 'Custom audiences, lookalikes y segmentación por intereses.', '', 25, 3
FROM academy_courses WHERE slug = 'meta-ads-desde-cero';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Creativos que convierten', 'Mejores prácticas para imágenes, videos y copies en ads.', '', 20, 4
FROM academy_courses WHERE slug = 'meta-ads-desde-cero';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Optimización y reportes', 'Cómo leer métricas, optimizar campañas y escalar resultados.', '', 25, 5
FROM academy_courses WHERE slug = 'meta-ads-desde-cero';

-- Lecciones para Curso 2: Google Ads para e-commerce
INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order, is_free_preview)
SELECT id, 'Configuración de Google Ads', 'Crea tu cuenta, vincula con Merchant Center y configura conversiones.', '', 20, 1, true
FROM academy_courses WHERE slug = 'google-ads-ecommerce';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Campañas Shopping', 'Feed de productos, campañas Shopping estándar y Smart Shopping.', '', 25, 2
FROM academy_courses WHERE slug = 'google-ads-ecommerce';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Search Ads para e-commerce', 'Keywords, match types y estructura de campañas de búsqueda.', '', 20, 3
FROM academy_courses WHERE slug = 'google-ads-ecommerce';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Performance Max', 'La campaña todo-en-uno de Google: setup y optimización.', '', 25, 4
FROM academy_courses WHERE slug = 'google-ads-ecommerce';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'ROAS y escalamiento', 'Estrategias de puja, ROAS target y cómo escalar sin perder rentabilidad.', '', 20, 5
FROM academy_courses WHERE slug = 'google-ads-ecommerce';

-- Lecciones para Curso 3: Email Marketing con Klaviyo
INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order, is_free_preview)
SELECT id, 'Setup inicial de Klaviyo', 'Conecta Klaviyo con tu tienda y configura tracking.', '', 15, 1, true
FROM academy_courses WHERE slug = 'email-marketing-klaviyo';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Flows automatizados esenciales', 'Welcome series, abandoned cart, post-purchase y winback.', '', 25, 2
FROM academy_courses WHERE slug = 'email-marketing-klaviyo';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Segmentación avanzada', 'Segmentos por comportamiento, RFM y engagement scoring.', '', 20, 3
FROM academy_courses WHERE slug = 'email-marketing-klaviyo';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Diseño de templates', 'Templates que convierten: layout, CTA, responsive design.', '', 20, 4
FROM academy_courses WHERE slug = 'email-marketing-klaviyo';

-- Lecciones para Curso 4: Shopify Analytics
INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order, is_free_preview)
SELECT id, 'Dashboard de Shopify', 'Entiende el dashboard principal y las métricas que importan.', '', 15, 1, true
FROM academy_courses WHERE slug = 'shopify-analytics';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Reportes de ventas', 'Reportes de ventas, productos top y análisis de tendencias.', '', 20, 2
FROM academy_courses WHERE slug = 'shopify-analytics';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Embudo de conversión', 'Analiza tu funnel: visitas, add to cart, checkout, compra.', '', 20, 3
FROM academy_courses WHERE slug = 'shopify-analytics';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Decisiones basadas en datos', 'Cómo usar los datos para mejorar tu tienda y marketing.', '', 20, 4
FROM academy_courses WHERE slug = 'shopify-analytics';

-- Lecciones para Curso 5: Estrategia de Marketing Digital
INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order, is_free_preview)
SELECT id, 'Fundamentos de estrategia', 'Qué es una estrategia de marketing digital y por qué la necesitas.', '', 20, 1, true
FROM academy_courses WHERE slug = 'estrategia-marketing-digital';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Buyer personas y customer journey', 'Define a tu cliente ideal y mapea su recorrido de compra.', '', 25, 2
FROM academy_courses WHERE slug = 'estrategia-marketing-digital';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Canales y presupuesto', 'Elige los canales correctos y distribuye tu presupuesto inteligentemente.', '', 25, 3
FROM academy_courses WHERE slug = 'estrategia-marketing-digital';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'KPIs y métricas de éxito', 'Define los indicadores que realmente miden el éxito de tu estrategia.', '', 20, 4
FROM academy_courses WHERE slug = 'estrategia-marketing-digital';

INSERT INTO academy_lessons (course_id, title, description, youtube_video_id, duration_minutes, sort_order)
SELECT id, 'Plan de acción mensual', 'Crea tu calendario y plan de ejecución mes a mes.', '', 25, 5
FROM academy_courses WHERE slug = 'estrategia-marketing-digital';

-- Quizzes (uno por curso)
INSERT INTO academy_quizzes (course_id, title, passing_score)
SELECT id, 'Examen: Meta Ads desde cero', 70
FROM academy_courses WHERE slug = 'meta-ads-desde-cero';

INSERT INTO academy_quizzes (course_id, title, passing_score)
SELECT id, 'Examen: Google Ads para e-commerce', 70
FROM academy_courses WHERE slug = 'google-ads-ecommerce';

INSERT INTO academy_quizzes (course_id, title, passing_score)
SELECT id, 'Examen: Email Marketing con Klaviyo', 70
FROM academy_courses WHERE slug = 'email-marketing-klaviyo';

INSERT INTO academy_quizzes (course_id, title, passing_score)
SELECT id, 'Examen: Shopify Analytics', 70
FROM academy_courses WHERE slug = 'shopify-analytics';

INSERT INTO academy_quizzes (course_id, title, passing_score)
SELECT id, 'Examen: Estrategia de Marketing Digital', 70
FROM academy_courses WHERE slug = 'estrategia-marketing-digital';

-- Preguntas del Quiz: Meta Ads desde cero
INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Cuál es la estructura jerárquica de Meta Ads?',
  '["Anuncio > Conjunto > Campaña", "Campaña > Conjunto de anuncios > Anuncio", "Conjunto > Campaña > Anuncio", "Campaña > Anuncio > Conjunto"]'::jsonb,
  1, 'La estructura es: Campaña (objetivo) > Conjunto de anuncios (audiencia/presupuesto) > Anuncio (creativo).', 1
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'meta-ads-desde-cero';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué es una Lookalike Audience?',
  '["Una audiencia de retargeting", "Una audiencia similar a tus clientes actuales", "Una audiencia por intereses", "Una audiencia demográfica"]'::jsonb,
  1, 'Las Lookalike Audiences son audiencias que Meta crea basándose en las características de tu audiencia fuente (ej: clientes actuales).', 2
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'meta-ads-desde-cero';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Cuál es el objetivo de campaña para generar ventas online?',
  '["Reconocimiento", "Tráfico", "Ventas", "Interacción"]'::jsonb,
  2, 'El objetivo de Ventas (antes Conversiones) es el indicado para generar compras en tu sitio web.', 3
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'meta-ads-desde-cero';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué métrica mide el costo por cada compra generada?',
  '["CPM", "CPC", "CPA", "CTR"]'::jsonb,
  2, 'CPA (Cost Per Acquisition) mide cuánto cuesta cada compra o conversión.', 4
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'meta-ads-desde-cero';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Cuánto tiempo se recomienda esperar antes de optimizar una campaña nueva?',
  '["1 día", "3-5 días (fase de aprendizaje)", "2 semanas", "1 mes"]'::jsonb,
  1, 'La fase de aprendizaje de Meta dura aproximadamente 3-5 días o 50 conversiones. No se deben hacer cambios significativos durante este período.', 5
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'meta-ads-desde-cero';

-- Preguntas del Quiz: Google Ads para e-commerce
INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué se necesita para crear campañas Shopping?',
  '["Solo Google Ads", "Google Ads + Google Analytics", "Google Ads + Google Merchant Center", "Solo Merchant Center"]'::jsonb,
  2, 'Las campañas Shopping requieren un feed de productos en Merchant Center vinculado a Google Ads.', 1
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'google-ads-ecommerce';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué es ROAS?',
  '["Return on Ad Sales", "Return on Ad Spend", "Revenue on Ad Spend", "Rate of Ad Success"]'::jsonb,
  1, 'ROAS = Return on Ad Spend. Se calcula dividiendo los ingresos generados por el gasto en publicidad.', 2
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'google-ads-ecommerce';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué tipo de campaña combina Search, Shopping, Display y YouTube?',
  '["Smart Shopping", "Search", "Performance Max", "Discovery"]'::jsonb,
  2, 'Performance Max es la campaña unificada de Google que muestra anuncios en todos los canales de Google.', 3
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'google-ads-ecommerce';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué match type de keyword es más restrictivo?',
  '["Broad match", "Phrase match", "Exact match", "Negative match"]'::jsonb,
  2, 'Exact match [keyword] muestra anuncios solo cuando la búsqueda coincide exactamente con tu keyword.', 4
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'google-ads-ecommerce';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Cuál es un buen ROAS para e-commerce en general?',
  '["1x (break even)", "2x-3x", "4x o más", "Depende del margen del negocio"]'::jsonb,
  3, 'El ROAS objetivo depende del margen de cada negocio. No hay un número universal correcto.', 5
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'google-ads-ecommerce';

-- Preguntas del Quiz: Email Marketing con Klaviyo
INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Cuál es el flow más importante para recuperar ventas perdidas?',
  '["Welcome series", "Abandoned cart", "Post-purchase", "Winback"]'::jsonb,
  1, 'El Abandoned Cart flow recupera usuarios que dejaron productos en el carrito sin comprar. Es típicamente el flow con mayor ROI.', 1
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'email-marketing-klaviyo';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué es segmentación RFM?',
  '["Recency, Frequency, Monetary", "Reach, Followers, Messages", "Revenue, Funnel, Marketing", "Rate, Flow, Metrics"]'::jsonb,
  0, 'RFM segmenta clientes por Recency (cuándo compraron), Frequency (cuántas veces) y Monetary (cuánto gastaron).', 2
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'email-marketing-klaviyo';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Cuál es una buena tasa de apertura para emails de e-commerce?',
  '["5-10%", "15-25%", "40-50%", "60-70%"]'::jsonb,
  1, 'Una tasa de apertura del 15-25% se considera saludable para emails de e-commerce.', 3
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'email-marketing-klaviyo';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Cuántos emails debe tener un Welcome Series mínimo?',
  '["1 email", "3-5 emails", "10 emails", "20 emails"]'::jsonb,
  1, 'Un Welcome Series efectivo tiene entre 3-5 emails: bienvenida, historia de marca, beneficios, social proof y oferta.', 4
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'email-marketing-klaviyo';

-- Preguntas del Quiz: Shopify Analytics
INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué métrica indica el porcentaje de visitantes que compran?',
  '["Bounce rate", "Average order value", "Conversion rate", "Sessions"]'::jsonb,
  2, 'La tasa de conversión (Conversion Rate) mide el % de sesiones que terminan en compra.', 1
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'shopify-analytics';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué es el AOV?',
  '["Average Order Volume", "Average Order Value", "Annual Order Value", "Active Order Verification"]'::jsonb,
  1, 'AOV (Average Order Value) es el valor promedio de cada pedido. Se calcula: ventas totales / número de pedidos.', 2
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'shopify-analytics';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Cuál es una buena tasa de conversión para e-commerce?',
  '["0.1-0.5%", "1-3%", "10-15%", "20-30%"]'::jsonb,
  1, 'Una tasa de conversión del 1-3% es el estándar en e-commerce. Sobre 3% se considera excelente.', 3
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'shopify-analytics';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué paso del funnel tiene típicamente más abandono?',
  '["Visita → Add to cart", "Add to cart → Checkout", "Checkout → Pago", "Todos por igual"]'::jsonb,
  0, 'La mayor caída suele estar entre visita y agregar al carrito, donde se pierde el 90%+ de los visitantes.', 4
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'shopify-analytics';

-- Preguntas del Quiz: Estrategia de Marketing Digital
INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué es un buyer persona?',
  '["Un cliente real", "Una representación ficticia de tu cliente ideal", "Tu mejor cliente", "Un segmento demográfico"]'::jsonb,
  1, 'Un buyer persona es una representación semi-ficticia de tu cliente ideal basada en datos reales e investigación.', 1
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'estrategia-marketing-digital';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Cuál es la fase TOFU del funnel?',
  '["Top of Funnel (Awareness)", "Middle of Funnel", "Bottom of Funnel", "Total of Funnel"]'::jsonb,
  0, 'TOFU = Top of Funnel, la etapa de reconocimiento donde el usuario descubre tu marca por primera vez.', 2
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'estrategia-marketing-digital';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué porcentaje del presupuesto se recomienda para testing?',
  '["0%", "5-10%", "10-20%", "50%"]'::jsonb,
  2, 'Se recomienda destinar 10-20% del presupuesto a testing de nuevas audiencias, creativos y canales.', 3
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'estrategia-marketing-digital';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Qué KPI es más relevante para una tienda online?',
  '["Followers en redes sociales", "Impresiones", "Revenue y ROAS", "Likes en publicaciones"]'::jsonb,
  2, 'Para e-commerce, Revenue (ingresos) y ROAS son los KPIs más directamente vinculados al éxito del negocio.', 4
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'estrategia-marketing-digital';

INSERT INTO academy_quiz_questions (quiz_id, question, options, correct_option, explanation, sort_order)
SELECT q.id,
  '¿Con qué frecuencia se debe revisar la estrategia de marketing?',
  '["Nunca, se define una vez", "Mensualmente", "Anualmente", "Solo cuando hay problemas"]'::jsonb,
  1, 'La estrategia debe revisarse mensualmente para ajustar tácticas según los resultados y cambios del mercado.', 5
FROM academy_quizzes q JOIN academy_courses c ON c.id = q.course_id WHERE c.slug = 'estrategia-marketing-digital';
