-- Prevent duplicate active enrollments for the same subscriber in the same flow.
-- This fixes a race condition where concurrent webhooks can enroll a subscriber twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_dedup
  ON email_flow_enrollments(flow_id, subscriber_id)
  WHERE status = 'active';
