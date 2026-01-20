-- Add a policy to allow the SECURITY INVOKER view to access published blog posts
-- This policy allows read access to published posts without exposing user_id through the view
CREATE POLICY "Public can view published blog posts for view" 
ON public.blog_posts 
FOR SELECT 
TO anon, authenticated
USING (published = true);