-- Create table for Steve's training feedback on campaign recommendations
CREATE TABLE public.steve_training_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_id UUID REFERENCES public.campaign_recommendations(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  recommendation_type TEXT NOT NULL,
  original_recommendation TEXT NOT NULL,
  feedback_rating TEXT NOT NULL CHECK (feedback_rating IN ('positive', 'negative', 'neutral')),
  feedback_notes TEXT,
  improved_recommendation TEXT,
  campaign_metrics JSONB DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for custom training examples (cases)
CREATE TABLE public.steve_training_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'both')),
  scenario_description TEXT NOT NULL,
  campaign_metrics JSONB DEFAULT '{}',
  correct_analysis TEXT NOT NULL,
  incorrect_analysis TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.steve_training_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_training_examples ENABLE ROW LEVEL SECURITY;

-- RLS policies for training feedback (admin only)
CREATE POLICY "Admins can view all training feedback"
ON public.steve_training_feedback FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert training feedback"
ON public.steve_training_feedback FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update training feedback"
ON public.steve_training_feedback FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete training feedback"
ON public.steve_training_feedback FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- RLS policies for training examples (admin only)
CREATE POLICY "Admins can view all training examples"
ON public.steve_training_examples FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert training examples"
ON public.steve_training_examples FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update training examples"
ON public.steve_training_examples FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete training examples"
ON public.steve_training_examples FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_training_feedback_rating ON public.steve_training_feedback(feedback_rating);
CREATE INDEX idx_training_feedback_type ON public.steve_training_feedback(recommendation_type);
CREATE INDEX idx_training_examples_platform ON public.steve_training_examples(platform);
CREATE INDEX idx_training_examples_active ON public.steve_training_examples(is_active);

-- Trigger for updated_at
CREATE TRIGGER update_steve_training_examples_updated_at
BEFORE UPDATE ON public.steve_training_examples
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();