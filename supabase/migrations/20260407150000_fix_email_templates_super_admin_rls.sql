-- Fix Javiera W12 (2026-04-07) — RLS bug detectado por Klaviyo (task 33193f98)
--
-- Las policies "Super admin full access" en email_templates y email_universal_blocks
-- referenciaban auth.users directo:
--   USING (auth.uid() IN (SELECT id FROM auth.users WHERE email = '...'))
--
-- En Supabase hosted, el rol authenticated NO tiene SELECT sobre auth.users
-- (solo service_role lo tiene). Cuando un cliente normal hace
--   GET /rest/v1/email_templates
-- Postgres evalua TODAS las policies con OR, y al llegar a la del super admin
-- lanza "permission denied for table users" → toda la query falla.
--
-- Reemplazo con public.is_super_admin(uuid) que ya existe como SECURITY DEFINER
-- en 00000000000000_complete_schema.sql:1691.
--
-- Reviewed-By: Isidora W6 (pendiente)

DROP POLICY IF EXISTS "Super admin full access to templates" ON public.email_templates;
DROP POLICY IF EXISTS "Super admin full access to universal blocks" ON public.email_universal_blocks;

CREATE POLICY "Super admin full access to templates"
  ON public.email_templates
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin full access to universal blocks"
  ON public.email_universal_blocks
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
