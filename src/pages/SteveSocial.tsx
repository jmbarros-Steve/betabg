import { useState } from 'react';
import { SocialHeader } from '@/components/social/SocialHeader';
import { SocialFilter } from '@/components/social/SocialFilter';
import { SocialFeed } from '@/components/social/SocialFeed';
import { SocialSubscribeCTA } from '@/components/social/SocialSubscribeCTA';

export default function SteveSocial() {
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const handleToggleTag = (tag: string) => {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <SocialHeader />
        <SocialFilter activeTags={activeTags} onToggleTag={handleToggleTag} />
        <SocialFeed activeTags={activeTags} />
      </div>
      <SocialSubscribeCTA />
    </div>
  );
}
