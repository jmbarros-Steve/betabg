-- Create a public view for blog posts that excludes user_id to prevent enumeration
CREATE OR REPLACE VIEW public.public_blog_posts AS
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

-- Drop the permissive public SELECT policy that exposes user_id
DROP POLICY IF EXISTS "Anyone can view published blog posts" ON public.blog_posts;

-- The "Owners can view all their blog posts" policy already exists and allows owners to see their own posts
-- For public access, apps should use the public_blog_posts view instead