-- Admin RLS: super admin can read wa_prospects and update wa_messages metadata
-- Required for ProspectosPanel in Dashboard

-- 1. Super admin can READ all prospects
CREATE POLICY "super_admin_read_wa_prospects"
  ON wa_prospects FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- 2. Super admin can UPDATE wa_messages (for rating metadata)
CREATE POLICY "super_admin_update_wa_messages"
  ON wa_messages FOR UPDATE
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 3. Super admin can READ all wa_messages (prospect conversations)
CREATE POLICY "super_admin_read_wa_messages"
  ON wa_messages FOR SELECT
  USING (public.is_super_admin(auth.uid()));
