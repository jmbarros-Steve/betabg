-- Make the public_blog_posts view read-only by creating rules that prevent modifications
-- This protects against unauthorized INSERT, UPDATE, DELETE operations on the view

-- Drop and recreate the view with SECURITY INVOKER to ensure it respects base table RLS
DROP VIEW IF EXISTS public.public_blog_posts;

CREATE VIEW public.public_blog_posts
WITH (security_invoker = on) AS
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

-- Create rules to make the view completely read-only
-- These rules prevent any INSERT, UPDATE, or DELETE operations
CREATE RULE public_blog_posts_no_insert AS ON INSERT TO public.public_blog_posts DO INSTEAD NOTHING;
CREATE RULE public_blog_posts_no_update AS ON UPDATE TO public.public_blog_posts DO INSTEAD NOTHING;
CREATE RULE public_blog_posts_no_delete AS ON DELETE TO public.public_blog_posts DO INSTEAD NOTHING;