
-- Create learning_queue table
CREATE TABLE public.learning_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type text NOT NULL,
  source_content text NOT NULL,
  source_title text,
  status text DEFAULT 'pending',
  rules_extracted integer,
  error_message text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.learning_queue ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage learning queue
CREATE POLICY "Super admins manage learning queue"
  ON public.learning_queue
  FOR ALL
  USING (is_super_admin(auth.uid()));
