-- Fix SECURITY DEFINER warning by recreating view with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_blog_posts;

CREATE VIEW public.public_blog_posts 
WITH (security_invoker = true) AS
SELECT 
  id,
  title,
  excerpt,
  content,
  category,
  published,
  created_at,
  updated_at
FROM public.blog_posts
WHERE published = true;

-- Grant access to the view for anonymous and authenticated users
GRANT SELECT ON public.public_blog_posts TO anon, authenticated;