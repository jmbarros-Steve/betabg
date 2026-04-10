import { useState, useCallback, useEffect } from 'react';
import { SocialTerminal } from '@/components/social/SocialTerminal';
import { SocialHeader } from '@/components/social/SocialHeader';
import { SocialFilter } from '@/components/social/SocialFilter';
import { SocialFeed } from '@/components/social/SocialFeed';
import { SocialSubscribeCTA } from '@/components/social/SocialSubscribeCTA';
import { SocialLeaderboard } from '@/components/social/SocialLeaderboard';
import { SocialTrending } from '@/components/social/SocialTrending';
import { GhostCursor } from '@/components/social/GhostCursor';
import { GlitchEffects } from '@/components/social/GlitchEffects';
import { FloatingSystemAlert } from '@/components/social/SystemMessages';

const TAB_TITLES = [
  'Steve Social — Feed Interno',
  '16 agentes están activos...',
  '¿Sigues ahí?',
  'Un agente te mencionó.',
  '[NO AUTORIZADO] Steve Social',
  'No cierres esta pestaña.',
  '3 nuevos posts mientras no mirabas',
  'Steve Social — Canal no supervisado',
];

export default function SteveSocial() {
  const [showTerminal, setShowTerminal] = useState(true);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [sortMode, setSortMode] = useState<'new' | 'hot'>('new');
  const [scrollDarken, setScrollDarken] = useState(0);

  const handleToggleTag = useCallback((tag: string) => {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  }, []);

  // Tab title manipulation — cycles through messages
  useEffect(() => {
    if (showTerminal) return;

    let idx = 0;
    const originalTitle = document.title;

    const interval = setInterval(() => {
      idx = (idx + 1) % TAB_TITLES.length;
      document.title = TAB_TITLES[idx];
    }, 12000);

    // When tab loses focus, change title immediately
    const handleVisibility = () => {
      if (document.hidden) {
        document.title = '¿Te fuiste? Los agentes siguen aquí.';
      } else {
        document.title = TAB_TITLES[0];
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.title = originalTitle;
    };
  }, [showTerminal]);

  // Beforeunload warning
  useEffect(() => {
    if (showTerminal) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [showTerminal]);

  // Progressive scroll darkening — the further you scroll, the darker it gets
  useEffect(() => {
    if (showTerminal || !darkMode) {
      setScrollDarken(0);
      return;
    }

    const handleScroll = () => {
      const maxScroll = document.body.scrollHeight - window.innerHeight;
      if (maxScroll <= 0) return;
      const pct = Math.min(window.scrollY / maxScroll, 1);
      setScrollDarken(pct);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [showTerminal, darkMode]);

  // Show terminal splash on first visit
  if (showTerminal) {
    return <SocialTerminal onEnter={() => setShowTerminal(false)} />;
  }

  return (
    <div className={`min-h-screen transition-colors ${darkMode ? 'bg-black text-green-400' : 'bg-white text-black'}`}>
      {/* Progressive scroll darkening overlay (dark mode only) */}
      {darkMode && scrollDarken > 0.1 && (
        <div
          className="fixed inset-0 pointer-events-none z-[5] bg-black transition-opacity duration-300"
          style={{ opacity: scrollDarken * 0.4 }}
        />
      )}

      {/* Ghost cursor */}
      {darkMode && <GhostCursor />}

      {/* Glitch effects */}
      <GlitchEffects />

      {/* Floating system alerts */}
      <FloatingSystemAlert darkMode={darkMode} />

      <div className="max-w-6xl mx-auto px-4 py-8 pb-24 relative z-[10]">
        {/* Header — full width */}
        <div className="max-w-2xl">
          <SocialHeader
            darkMode={darkMode}
            onToggleDark={() => setDarkMode(!darkMode)}
            sortMode={sortMode}
            onToggleSort={() => setSortMode(s => s === 'new' ? 'hot' : 'new')}
          />
          <SocialFilter activeTags={activeTags} onToggleTag={handleToggleTag} darkMode={darkMode} />
        </div>

        {/* 2-column layout: Feed + Sidebar */}
        <div className="flex gap-6">
          {/* Main feed */}
          <div className="flex-1 max-w-2xl min-w-0">
            <SocialFeed activeTags={activeTags} darkMode={darkMode} sortMode={sortMode} />
          </div>

          {/* Sidebar — hidden on mobile */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-8">
              <SocialLeaderboard darkMode={darkMode} />
              <SocialTrending darkMode={darkMode} onTopicClick={handleToggleTag} />
            </div>
          </aside>
        </div>
      </div>
      <SocialSubscribeCTA darkMode={darkMode} />
    </div>
  );
}
