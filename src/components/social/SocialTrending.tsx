import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

interface TrendingTopic {
  topic: string;
  count: number;
  sample: string;
  heat: 'hot' | 'warm' | 'rising';
}

interface SocialTrendingProps {
  darkMode: boolean;
  onTopicClick?: (topic: string) => void;
}

const HEAT_CONFIG = {
  hot: { label: '🔥', barColor: 'bg-orange-500' },
  warm: { label: '🟡', barColor: 'bg-yellow-500' },
  rising: { label: '📈', barColor: 'bg-green-500' },
};

export function SocialTrending({ darkMode, onTopicClick }: SocialTrendingProps) {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/social/trending`)
      .then(res => {
        if (!res.ok) throw new Error('Trending error');
        return res.json();
      })
      .then(data => {
        setTopics(data.trending || []);
        setTotalPosts(data.total_posts_24h || 0);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const borderColor = darkMode ? 'border-green-900' : 'border-slate-200';
  const bgColor = darkMode ? 'bg-green-950/30' : 'bg-slate-50';
  const textPrimary = darkMode ? 'text-green-300' : 'text-black';
  const textMuted = darkMode ? 'text-green-700' : 'text-slate-400';
  const textSecondary = darkMode ? 'text-green-500' : 'text-slate-500';

  if (loading) {
    return (
      <div className={`border rounded-lg ${borderColor} ${bgColor} p-4 mb-6`}>
        <div className={`font-mono text-xs ${textMuted} text-center py-4`}>
          Cargando trending...
        </div>
      </div>
    );
  }

  if (error || topics.length === 0) {
    return null; // Don't show if no data
  }

  const maxCount = topics[0]?.count || 1;

  return (
    <div className={`border rounded-lg ${borderColor} ${bgColor} p-4 mb-6`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-mono text-sm font-bold ${textPrimary}`}>
          Trending
        </h3>
        <span className={`font-mono text-[10px] ${textMuted}`}>
          {totalPosts} posts / 24h
        </span>
      </div>

      <div className="space-y-2.5">
        {topics.slice(0, 8).map((topic, idx) => {
          const heat = HEAT_CONFIG[topic.heat];
          const barWidth = Math.max((topic.count / maxCount) * 100, 8);

          return (
            <button
              key={topic.topic}
              onClick={() => onTopicClick?.(topic.topic)}
              className="w-full text-left group"
            >
              <div className="flex items-center gap-2">
                <span className={`font-mono text-[10px] w-4 text-right ${textMuted}`}>
                  {idx + 1}
                </span>
                <span className="text-xs">{heat.label}</span>
                <span className={`font-mono text-xs font-semibold ${textPrimary} group-hover:underline`}>
                  #{topic.topic}
                </span>
                <span className={`font-mono text-[10px] ${textMuted} ml-auto`}>
                  {topic.count}
                </span>
              </div>

              {/* Heat bar */}
              <div className={`ml-6 mt-1 h-1 rounded-full ${darkMode ? 'bg-green-950' : 'bg-slate-200'} overflow-hidden`}>
                <div
                  className={`h-full rounded-full ${heat.barColor} transition-all`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              {/* Sample text */}
              <p className={`ml-6 mt-1 font-mono text-[10px] ${textSecondary} truncate`}>
                {topic.sample}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
