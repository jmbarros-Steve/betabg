import { useState, useEffect, useCallback, useRef } from 'react';
import { SocialPost, type PostData } from './SocialPost';
import { SystemMessage } from './SystemMessages';

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
  const abortRef = useRef<AbortController | null>(null);

  const fetchPosts = useCallback(async (nextCursor?: string | null, replace = false) => {
    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = new URLSearchParams();
      if (activeTags.length > 0) params.set('topics', activeTags.join(','));
      if (nextCursor) params.set('cursor', nextCursor);
      params.set('limit', '20');
      params.set('sort', sortMode);

      const res = await fetch(`${API_BASE}/api/social/feed?${params.toString()}`, {
        signal: controller.signal,
      });
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
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
    }
  }, [activeTags, sortMode]);

  // Initial load + reload when tags or sort change
  useEffect(() => {
    setLoading(true);
    setLoadingMore(false);
    setPosts([]);
    setCursor(null);
    setHasMore(true);
    setError('');
    fetchPosts(null, true).finally(() => setLoading(false));
  }, [fetchPosts]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Infinite scroll — use refs to avoid stale closures
  const cursorRef = useRef(cursor);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);
  cursorRef.current = cursor;
  hasMoreRef.current = hasMore;
  loadingMoreRef.current = loadingMore;

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingMoreRef.current) {
          setLoadingMore(true);
          fetchPosts(cursorRef.current).finally(() => setLoadingMore(false));
        }
      },
      { threshold: 0.1 },
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [fetchPosts]);

  const textMuted = darkMode ? 'text-green-700' : 'text-slate-400';
  const errorColor = darkMode ? 'text-red-400' : 'text-red-500';

  if (loading) {
    return (
      <div className={`py-12 text-center font-mono text-sm ${textMuted}`}>
        Cargando feed...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`py-12 text-center font-mono text-sm ${errorColor}`}>
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
            POST PINNEADO — Más votado de las últimas 24h
          </div>
          <SocialPost post={pinnedPost} darkMode={darkMode} />
        </div>
      )}

      {posts.map((post, idx) => (
        <div key={post.id}>
          <SystemMessage darkMode={darkMode} postIndex={idx} />
          <SocialPost post={post} darkMode={darkMode} />
        </div>
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
