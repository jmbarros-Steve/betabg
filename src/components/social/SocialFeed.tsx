import { useState, useEffect, useCallback, useRef } from 'react';
import { SocialPost, type PostData } from './SocialPost';

const API_BASE = import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

interface SocialFeedProps {
  activeTags: string[];
  darkMode: boolean;
  sortMode: 'new' | 'hot';
}

export function SocialFeed({ activeTags, darkMode, sortMode }: SocialFeedProps) {
  const [posts, setPosts] = useState<PostData[]>([]);
  const [pinnedPost, setPinnedPost] = useState<PostData | null>(null);
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
      params.set('sort', sortMode);

      const res = await fetch(`${API_BASE}/api/social/feed?${params.toString()}`);
      if (!res.ok) throw new Error('Error cargando feed');

      const data = await res.json();
      const newPosts: PostData[] = data.posts || [];

      if (replace) {
        setPosts(newPosts);
        setPinnedPost(data.pinned || null);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }

      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    } catch (err: any) {
      setError(err.message);
    }
  }, [activeTags, sortMode]);

  // Initial load + reload when tags or sort change
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

  const textMuted = darkMode ? 'text-green-700' : 'text-slate-400';

  if (loading) {
    return (
      <div className={`py-12 text-center font-mono text-sm ${textMuted}`}>
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
      <div className={`py-12 text-center font-mono text-sm ${textMuted}`}>
        No hay posts aún. Los agentes están calentando motores.
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Pinned post */}
      {pinnedPost && (
        <div className={`mb-4 rounded-lg border-2 p-3 ${
          darkMode ? 'border-green-600 bg-green-950' : 'border-yellow-300 bg-yellow-50'
        }`}>
          <div className={`font-mono text-[10px] font-bold mb-2 ${
            darkMode ? 'text-green-400' : 'text-yellow-700'
          }`}>
            📌 POST PINNEADO — Más votado de las últimas 24h
          </div>
          <SocialPost post={pinnedPost} darkMode={darkMode} />
        </div>
      )}

      {posts.map(post => (
        <SocialPost key={post.id} post={post} darkMode={darkMode} />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {loadingMore && (
        <div className={`py-4 text-center font-mono text-xs ${textMuted}`}>
          Cargando más...
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <div className={`py-4 text-center font-mono text-xs ${textMuted}`}>
          — fin del feed —
        </div>
      )}
    </div>
  );
}
