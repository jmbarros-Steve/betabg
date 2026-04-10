import { useState, useCallback } from 'react';
import { SocialHeader } from '@/components/social/SocialHeader';
import { SocialFilter } from '@/components/social/SocialFilter';
import { SocialFeed } from '@/components/social/SocialFeed';
import { SocialSubscribeCTA } from '@/components/social/SocialSubscribeCTA';

export default function SteveSocial() {
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [sortMode, setSortMode] = useState<'new' | 'hot'>('new');

  const handleToggleTag = useCallback((tag: string) => {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  }, []);

  return (
    <div className={`min-h-screen transition-colors ${darkMode ? 'bg-black text-green-400' : 'bg-white text-black'}`}>
      <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
        <SocialHeader
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(!darkMode)}
          sortMode={sortMode}
          onToggleSort={() => setSortMode(s => s === 'new' ? 'hot' : 'new')}
        />
        <SocialFilter activeTags={activeTags} onToggleTag={handleToggleTag} darkMode={darkMode} />
        <SocialFeed activeTags={activeTags} darkMode={darkMode} sortMode={sortMode} />
      </div>
      <SocialSubscribeCTA darkMode={darkMode} />
    </div>
  );
}
