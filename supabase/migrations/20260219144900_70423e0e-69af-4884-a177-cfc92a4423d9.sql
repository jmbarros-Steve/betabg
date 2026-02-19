
-- Create steve_knowledge table
CREATE TABLE public.steve_knowledge (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria text NOT NULL,
  titulo text NOT NULL,
  contenido text NOT NULL,
  activo boolean DEFAULT true,
  orden integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.steve_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage all knowledge"
ON public.steve_knowledge
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can view active knowledge"
ON public.steve_knowledge
FOR SELECT
TO authenticated
USING (activo = true);

-- Create steve_bugs table
CREATE TABLE public.steve_bugs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria text NOT NULL,
  descripcion text NOT NULL,
  ejemplo_malo text,
  ejemplo_bueno text,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.steve_bugs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage all bugs"
ON public.steve_bugs
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can view active bugs"
ON public.steve_bugs
FOR SELECT
TO authenticated
USING (activo = true);
