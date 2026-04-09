-- Bug #61 fix: Replace permissive USING(true) SELECT policies on WA tables
-- with client_id-scoped policies to prevent cross-tenant data leakage.
--
-- All WA tables have client_id that references clients(id).
-- Users can only see rows where client_id belongs to a client they own
-- (via clients.user_id or clients.client_user_id).
-- Service role (backend) retains full access via a separate permissive policy.

-- Helper: reusable subquery for client_id ownership check
-- client_id IN (SELECT c.id FROM clients c WHERE c.user_id = auth.uid() OR c.client_user_id = auth.uid())

BEGIN;

-- ============================================================================
-- 1. wa_twilio_accounts
-- ============================================================================
DROP POLICY IF EXISTS "Users read own wa_twilio_accounts" ON wa_twilio_accounts;
DROP POLICY IF EXISTS "client_wa_twilio_accounts" ON wa_twilio_accounts;
DROP POLICY IF EXISTS "wa_twilio_accounts_select_by_client" ON wa_twilio_accounts;
DROP POLICY IF EXISTS "wa_twilio_accounts_select_service_role" ON wa_twilio_accounts;

CREATE POLICY "wa_twilio_accounts_select_by_client"
  ON wa_twilio_accounts FOR SELECT
  USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.user_id = auth.uid() OR c.client_user_id = auth.uid()
    )
  );

-- Service role needs full access for backend operations
CREATE POLICY "wa_twilio_accounts_select_service_role"
  ON wa_twilio_accounts FOR SELECT
  USING (
    (SELECT current_setting('request.jwt.claim.role', true)) = 'service_role'
  );

-- ============================================================================
-- 2. wa_credits
-- ============================================================================
DROP POLICY IF EXISTS "Users read own wa_credits" ON wa_credits;
DROP POLICY IF EXISTS "wa_credits_select_by_client" ON wa_credits;
DROP POLICY IF EXISTS "wa_credits_select_service_role" ON wa_credits;

CREATE POLICY "wa_credits_select_by_client"
  ON wa_credits FOR SELECT
  USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.user_id = auth.uid() OR c.client_user_id = auth.uid()
    )
  );

CREATE POLICY "wa_credits_select_service_role"
  ON wa_credits FOR SELECT
  USING (
    (SELECT current_setting('request.jwt.claim.role', true)) = 'service_role'
  );

-- ============================================================================
-- 3. wa_credit_transactions
-- ============================================================================
DROP POLICY IF EXISTS "Users read own wa_credit_transactions" ON wa_credit_transactions;
DROP POLICY IF EXISTS "wa_credit_transactions_select_by_client" ON wa_credit_transactions;
DROP POLICY IF EXISTS "wa_credit_transactions_select_service_role" ON wa_credit_transactions;

CREATE POLICY "wa_credit_transactions_select_by_client"
  ON wa_credit_transactions FOR SELECT
  USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.user_id = auth.uid() OR c.client_user_id = auth.uid()
    )
  );

CREATE POLICY "wa_credit_transactions_select_service_role"
  ON wa_credit_transactions FOR SELECT
  USING (
    (SELECT current_setting('request.jwt.claim.role', true)) = 'service_role'
  );

-- ============================================================================
-- 4. wa_messages
-- ============================================================================
DROP POLICY IF EXISTS "Users read own wa_messages" ON wa_messages;
DROP POLICY IF EXISTS "client_wa_messages" ON wa_messages;
DROP POLICY IF EXISTS "wa_messages_select_by_client" ON wa_messages;
DROP POLICY IF EXISTS "wa_messages_select_service_role" ON wa_messages;

CREATE POLICY "wa_messages_select_by_client"
  ON wa_messages FOR SELECT
  USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.user_id = auth.uid() OR c.client_user_id = auth.uid()
    )
  );

CREATE POLICY "wa_messages_select_service_role"
  ON wa_messages FOR SELECT
  USING (
    (SELECT current_setting('request.jwt.claim.role', true)) = 'service_role'
  );

-- ============================================================================
-- 5. wa_conversations
-- ============================================================================
DROP POLICY IF EXISTS "Users read own wa_conversations" ON wa_conversations;
DROP POLICY IF EXISTS "client_wa_conversations" ON wa_conversations;
DROP POLICY IF EXISTS "wa_conversations_select_by_client" ON wa_conversations;
DROP POLICY IF EXISTS "wa_conversations_select_service_role" ON wa_conversations;

CREATE POLICY "wa_conversations_select_by_client"
  ON wa_conversations FOR SELECT
  USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.user_id = auth.uid() OR c.client_user_id = auth.uid()
    )
  );

CREATE POLICY "wa_conversations_select_service_role"
  ON wa_conversations FOR SELECT
  USING (
    (SELECT current_setting('request.jwt.claim.role', true)) = 'service_role'
  );

-- ============================================================================
-- 6. wa_campaigns
-- ============================================================================
DROP POLICY IF EXISTS "Users read own wa_campaigns" ON wa_campaigns;
DROP POLICY IF EXISTS "wa_campaigns_select_by_client" ON wa_campaigns;
DROP POLICY IF EXISTS "wa_campaigns_select_service_role" ON wa_campaigns;

CREATE POLICY "wa_campaigns_select_by_client"
  ON wa_campaigns FOR SELECT
  USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.user_id = auth.uid() OR c.client_user_id = auth.uid()
    )
  );

CREATE POLICY "wa_campaigns_select_service_role"
  ON wa_campaigns FOR SELECT
  USING (
    (SELECT current_setting('request.jwt.claim.role', true)) = 'service_role'
  );

-- ============================================================================
-- 7. wa_automations
-- ============================================================================
DROP POLICY IF EXISTS "Users read own wa_automations" ON wa_automations;
DROP POLICY IF EXISTS "wa_automations_select_by_client" ON wa_automations;
DROP POLICY IF EXISTS "wa_automations_select_service_role" ON wa_automations;

CREATE POLICY "wa_automations_select_by_client"
  ON wa_automations FOR SELECT
  USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.user_id = auth.uid() OR c.client_user_id = auth.uid()
    )
  );

CREATE POLICY "wa_automations_select_service_role"
  ON wa_automations FOR SELECT
  USING (
    (SELECT current_setting('request.jwt.claim.role', true)) = 'service_role'
  );

COMMIT;
