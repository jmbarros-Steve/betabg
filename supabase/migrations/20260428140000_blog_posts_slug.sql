-- Add slug column to blog_posts for SEO-friendly URLs
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Unique partial index (allows existing NULLs, prevents duplicates among set values)
CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_unique
  ON public.blog_posts (slug)
  WHERE slug IS NOT NULL;

-- Index for the public read path (published + slug lookup)
CREATE INDEX IF NOT EXISTS blog_posts_published_slug_idx
  ON public.blog_posts (slug)
  WHERE published = true;
