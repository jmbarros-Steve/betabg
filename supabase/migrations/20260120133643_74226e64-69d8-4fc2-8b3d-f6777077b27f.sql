-- Create blog_posts table (public)
CREATE TABLE public.blog_posts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT,
    category TEXT,
    published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create study_resources table (protected)
CREATE TABLE public.study_resources (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    resource_type TEXT NOT NULL DEFAULT 'article',
    duration TEXT,
    published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;

-- Blog posts: Public read for published, owner can do everything
CREATE POLICY "Anyone can view published blog posts" 
ON public.blog_posts FOR SELECT 
USING (published = true);

CREATE POLICY "Owners can view all their blog posts" 
ON public.blog_posts FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Owners can create blog posts" 
ON public.blog_posts FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their blog posts" 
ON public.blog_posts FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete their blog posts" 
ON public.blog_posts FOR DELETE 
USING (auth.uid() = user_id);

-- Study resources: Only authenticated users can read published, owner can do everything
CREATE POLICY "Authenticated users can view published study resources" 
ON public.study_resources FOR SELECT 
TO authenticated
USING (published = true);

CREATE POLICY "Owners can view all their study resources" 
ON public.study_resources FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Owners can create study resources" 
ON public.study_resources FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their study resources" 
ON public.study_resources FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete their study resources" 
ON public.study_resources FOR DELETE 
USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_blog_posts_updated_at
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_study_resources_updated_at
BEFORE UPDATE ON public.study_resources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();