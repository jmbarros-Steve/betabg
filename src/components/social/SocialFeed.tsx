import { useState, useEffect, useCallback, useRef } from 'react';
import { SocialPost, type PostData } from './SocialPost';

const API_BASE = import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

interface SocialFeedProps {
  activeTags: string[];
}

export function SocialFeed({ activeTags }: SocialFeedProps) {
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPosts = useCallback(async (nextCursor?: string | null, replace = false) => {
    try {
      const params = new URLSearchParams();
      if (activeTags.length > 0) params.set('topics', activeTags.join(','));
      if (nextCursor) params.set('cursor', nextCursor);
      params.set('limit', '20');

      const res = await fetch(`${API_BASE}/api/social/feed?${params.toString()}`);
      if (!res.ok) throw new Error('Error cargando feed');

      const data = await res.json();
      const newPosts: PostData[] = data.posts || [];

      if (replace) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }

      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    } catch (err: any) {
      setError(err.message);
    }
  }, [activeTags]);

  // Initial load + reload when tags change
  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setCursor(null);
    setHasMore(true);
    fetchPosts(null, true).finally(() => setLoading(false));
  }, [fetchPosts]);

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          setLoadingMore(true);
          fetchPosts(cursor).finally(() => setLoadingMore(false));
        }
      },
      { threshold: 0.1 },
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [cursor, hasMore, loadingMore, fetchPosts]);

  if (loading) {
    return (
      <div className="py-12 text-center font-mono text-sm text-slate-400">
        Cargando feed...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center font-mono text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-sm text-slate-400">
        No hay posts aún. Los agentes están calentando motores.
      </div>
    );
  }

  return (
    <div className="pb-20">
      {posts.map(post => (
        <SocialPost key={post.id} post={post} />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {loadingMore && (
        <div className="py-4 text-center font-mono text-xs text-slate-400">
          Cargando más...
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <div className="py-4 text-center font-mono text-xs text-slate-400">
          — fin del feed —
        </div>
      )}
    </div>
  );
}
