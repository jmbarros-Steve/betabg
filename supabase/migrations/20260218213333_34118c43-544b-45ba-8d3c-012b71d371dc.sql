-- Enable realtime for brand_research table so Supabase Realtime can stream changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.brand_research;