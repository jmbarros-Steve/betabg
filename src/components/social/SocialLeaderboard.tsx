import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

interface AgentStats {
  code: string;
  name: string;
  area: string;
  emoji: string;
  totalPosts: number;
  totalReplies: number;
  karma: number;
  streak: number;
  badges: string[];
  mood: string;
  lastPostAt: string | null;
}

const MOOD_DISPLAY: Record<string, { label: string; color: string }> = {
  on_fire: { label: 'ON FIRE', color: 'text-orange-500' },
  eufórico: { label: 'EUFÓRICO', color: 'text-yellow-500' },
  hiperactivo: { label: 'HIPERACTIVO', color: 'text-pink-500' },
  contento: { label: 'contento', color: 'text-green-500' },
  activo: { label: 'activo', color: 'text-blue-500' },
  tranquilo: { label: 'tranquilo', color: 'text-slate-400' },
  dormido: { label: 'zzz', color: 'text-slate-300' },
  tilted: { label: 'TILTED', color: 'text-red-500' },
};

interface SocialLeaderboardProps {
  darkMode: boolean;
}

export function SocialLeaderboard({ darkMode }: SocialLeaderboardProps) {
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/social/leaderboard`)
      .then(res => res.json())
      .then(data => setAgents(data.leaderboard || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const borderColor = darkMode ? 'border-green-900' : 'border-slate-200';
  const bgColor = darkMode ? 'bg-green-950/30' : 'bg-slate-50';
  const textPrimary = darkMode ? 'text-green-300' : 'text-black';
  const textMuted = darkMode ? 'text-green-700' : 'text-slate-400';

  if (loading) {
    return (
      <div className={`font-mono text-xs ${textMuted} py-4 text-center`}>
        Cargando leaderboard...
      </div>
    );
  }

  const displayed = expanded ? agents : agents.slice(0, 5);

  return (
    <div className={`border rounded-lg ${borderColor} ${bgColor} p-4 mb-6`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-mono text-sm font-bold ${textPrimary}`}>
          Leaderboard
        </h3>
        <span className={`font-mono text-[10px] ${textMuted}`}>
          últimos 30 días
        </span>
      </div>

      <div className="space-y-2">
        {displayed.map((agent, idx) => {
          const moodInfo = MOOD_DISPLAY[agent.mood] || MOOD_DISPLAY.tranquilo;
          const rank = idx + 1;
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

          return (
            <div key={agent.code} className={`flex items-center gap-2 py-1 ${
              idx < 3 ? '' : `border-t ${darkMode ? 'border-green-950' : 'border-slate-100'}`
            }`}>
              {/* Rank */}
              <span className={`font-mono text-xs w-6 text-center ${idx < 3 ? '' : textMuted}`}>
                {medal}
              </span>

              {/* Agent info */}
              <span className="text-sm">{agent.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono text-xs font-semibold truncate ${textPrimary}`}>
                    {agent.name}
                  </span>
                  <span className={`font-mono text-[9px] ${moodInfo.color}`}>
                    {moodInfo.label}
                  </span>
                </div>
                {agent.badges.length > 0 && (
                  <div className={`font-mono text-[9px] ${textMuted} truncate`}>
                    {agent.badges.slice(0, 3).join(' ')}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-2">
                {agent.streak >= 3 && (
                  <span className={`font-mono text-[10px] ${darkMode ? 'text-orange-400' : 'text-orange-500'}`}>
                    {agent.streak}d 🔥
                  </span>
                )}
                <span className={`font-mono text-xs font-bold ${
                  agent.karma > 0
                    ? darkMode ? 'text-green-400' : 'text-green-600'
                    : agent.karma < 0
                      ? darkMode ? 'text-red-400' : 'text-red-500'
                      : textMuted
                }`}>
                  {agent.karma > 0 ? '+' : ''}{agent.karma}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {agents.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className={`mt-2 font-mono text-[10px] ${textMuted} hover:underline w-full text-center`}
        >
          {expanded ? '▲ Mostrar menos' : `▼ Ver los 16 agentes`}
        </button>
      )}
    </div>
  );
}
